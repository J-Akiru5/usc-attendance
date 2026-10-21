import { describe, expect, it, vi } from 'vitest'
import {
  SCAN_FEEDBACK,
  SCAN_FEEDBACK_STATES,
  applyTorchMode,
  detectTorch,
  feedbackFor,
  scanFailureState,
  torchReported,
  vibrateFeedback,
  type ScanFeedbackState,
  type TorchSwitch
} from '../../app/utils/scanner-engine'

/**
 * T-0012 AC1: every scanner outcome maps to exactly one feedback record, and
 * the four positive-looking outcomes are not collapsed into one green buzz.
 * AC2: a phone without the Vibration API, and a camera without a torch, are
 * ordinary cases, not errors.
 */
describe('scan outcome -> feedback', () => {
  it('has exactly one record for each of the five outcomes', () => {
    expect(SCAN_FEEDBACK_STATES).toEqual(['recorded', 'duplicate', 'refused', 'queued', 'error'])
    expect(new Set(SCAN_FEEDBACK_STATES).size).toBe(SCAN_FEEDBACK_STATES.length)
    expect(Object.keys(SCAN_FEEDBACK).sort()).toEqual([...SCAN_FEEDBACK_STATES].sort())

    for (const state of SCAN_FEEDBACK_STATES) {
      const feedback = feedbackFor(state)
      expect(feedback.state).toBe(state)
      expect(feedback.label.trim()).not.toBe('')
      expect(feedback.vibration.length).toBeGreaterThan(0)
      expect(['success', 'warning', 'info', 'danger']).toContain(feedback.tone)
    }
  })

  it('is deterministic: the same outcome never yields two different banners', () => {
    for (const state of SCAN_FEEDBACK_STATES) {
      expect(feedbackFor(state)).toBe(feedbackFor(state))
    }
  })

  it('keeps duplicate and queued distinct from success', () => {
    const recorded = feedbackFor('recorded')
    const duplicate = feedbackFor('duplicate')
    const queued = feedbackFor('queued')

    for (const state of [duplicate, queued]) {
      expect(state.tone).not.toBe('success')
      expect(state.label).not.toBe(recorded.label)
      expect(state.vibration).not.toEqual(recorded.vibration)
    }
    expect(duplicate.label).not.toBe(queued.label)
    expect(duplicate.tone).not.toBe(queued.tone)
    expect(duplicate.vibration).not.toEqual(queued.vibration)
  })

  it('gives every outcome its own label and vibration pattern', () => {
    const labels = SCAN_FEEDBACK_STATES.map(state => feedbackFor(state).label)
    const patterns = SCAN_FEEDBACK_STATES.map(state => feedbackFor(state).vibration.join(','))
    expect(new Set(labels).size).toBe(SCAN_FEEDBACK_STATES.length)
    expect(new Set(patterns).size).toBe(SCAN_FEEDBACK_STATES.length)
  })

  it('only interrupts the officer for a refusal or a broken scan', () => {
    const assertive = SCAN_FEEDBACK_STATES.filter(state => feedbackFor(state).assertive)
    expect(assertive).toEqual(['refused', 'error'])
  })
})

describe('scanFailureState', () => {
  it('recognises the server\'s duplicate answer', () => {
    expect(scanFailureState({ status: 403, message: 'Already checked in. Check out before checking in again.' }))
      .toBe('duplicate')
  })

  it('treats another 4xx as a refusal', () => {
    expect(scanFailureState({ status: 403, message: 'You are outside the venue.' })).toBe('refused')
    expect(scanFailureState({ status: 429, message: 'Too many scans.' })).toBe('refused')
  })

  it('treats a missing status or a 5xx as a broken scan', () => {
    expect(scanFailureState({ message: 'Scan failed' })).toBe('error')
    expect(scanFailureState({ status: 0, message: 'Offline' })).toBe('error')
    expect(scanFailureState({ status: 500, message: 'Server error' })).toBe('error')
    expect(scanFailureState({})).toBe('error')
  })
})

describe('vibration haptics', () => {
  it('sends the mapped pattern when the Vibration API exists', () => {
    const vibrate = vi.fn(() => true)
    expect(vibrateFeedback('recorded', { vibrate })).toBe(true)
    expect(vibrate).toHaveBeenCalledOnce()
    expect(vibrate).toHaveBeenCalledWith([...feedbackFor('recorded').vibration])
  })

  it('is silently absent when the API is missing', () => {
    expect(() => vibrateFeedback('refused', {})).not.toThrow()
    expect(vibrateFeedback('refused', {})).toBe(false)
    expect(vibrateFeedback('refused', null)).toBe(false)
  })

  it('is silently absent when the API throws', () => {
    const vibrate = vi.fn(() => {
      throw new Error('not allowed')
    })
    expect(vibrateFeedback('error', { vibrate })).toBe(false)
  })
})

describe('torch capability', () => {
  it('only accepts an explicit platform report', () => {
    expect(torchReported({ torch: true })).toBe(true)
    expect(torchReported({ torch: false })).toBe(false)
    expect(torchReported({ zoom: true })).toBe(false)
    expect(torchReported(undefined)).toBe(false)
    expect(torchReported(null)).toBe(false)
    expect(torchReported('torch')).toBe(false)
  })

  it('treats a throwing capability read as no torch', () => {
    expect(detectTorch(() => ({ torch: true }))).toBe(true)
    expect(detectTorch(() => {
      throw new Error('track ended')
    })).toBe(false)
  })

  it('does not apply a torch when the platform has no torch API', async () => {
    await expect(applyTorchMode(undefined, true)).resolves.toBe(false)
    await expect(applyTorchMode(null, false)).resolves.toBe(false)
  })

  it('does not call apply when the platform reports no support', async () => {
    const apply = vi.fn(async () => {})
    const feature: TorchSwitch = { isSupported: () => false, apply }
    await expect(applyTorchMode(feature, true)).resolves.toBe(false)
    expect(apply).not.toHaveBeenCalled()
  })

  it('falls back silently when switching the torch fails', async () => {
    const feature: TorchSwitch = {
      isSupported: () => true,
      apply: async () => { throw new Error('constraint refused') }
    }
    await expect(applyTorchMode(feature, true)).resolves.toBe(false)
  })

  it('reports success only when the constraint was applied', async () => {
    const apply = vi.fn(async () => {})
    const feature: TorchSwitch = { isSupported: () => true, apply }
    await expect(applyTorchMode(feature, true)).resolves.toBe(true)
    expect(apply).toHaveBeenCalledWith(true)
  })
})

// Keep the state union honest if a future outcome is added without a record.
const exhaustive: Record<ScanFeedbackState, true> = {
  recorded: true,
  duplicate: true,
  refused: true,
  queued: true,
  error: true
}

describe('feedback map completeness', () => {
  it('covers every declared state', () => {
    expect(Object.keys(exhaustive).sort()).toEqual([...SCAN_FEEDBACK_STATES].sort())
  })
})
