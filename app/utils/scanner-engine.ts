/**
 * The scanner engine, kept behind a dynamic import (BC-13 / NP-11).
 *
 * `html5-qrcode` plus the ZXing decoder is the single largest script in the
 * portal. It must never be pulled into the scanner page's shared/entry chunk:
 * an officer on a low-end Android in a gym needs the event picker and the
 * manual number search to work before — and even if — the camera bundle
 * arrives. Only the formatted enum and the camera class are imported here, and
 * only when `startStudentScanner()` is called on mount.
 *
 * The type-only import of `Html5Qrcode` is erased at build time; it does not
 * create a static dependency edge.
 *
 * T-0012 adds the parts of the loop an officer feels without looking: one
 * exhaustive outcome -> feedback mapping, Vibration API haptics that disappear
 * silently on a device without it, and a torch switch that only exists when the
 * live camera track says it has one. None of that needs the camera bundle; the
 * pure helpers below are imported by the page and unit-tested directly.
 */
import type { Html5Qrcode } from 'html5-qrcode'

// ---------------------------------------------------------------------------
// Outcome -> feedback (T-0012)
//
// The scanner has exactly five outcomes. "Already checked in" is not a failure
// (the student is present, just not newly recorded) and "saved offline" is not
// a success (nothing has reached the server yet), so the four positive-looking
// outcomes must not share one green banner or one buzz.
// ---------------------------------------------------------------------------

export type ScanFeedbackState = 'recorded' | 'duplicate' | 'refused' | 'queued' | 'error'

/** `info` is the quiet "saved, not sent" tone; it is never used for success. */
export type ScanFeedbackTone = 'success' | 'warning' | 'info' | 'danger'

export interface ScanFeedback {
  state: ScanFeedbackState
  /** Short heading for the result banner. */
  label: string
  tone: ScanFeedbackTone
  /** Decorative glyph; the label carries the meaning for screen readers. */
  glyph: string
  /** Vibration API pattern in milliseconds. Never empty. */
  vibration: readonly number[]
  /**
   * True where the officer must look now (refused / broken scan). `recorded`,
   * `duplicate` and `queued` are polite so they do not interrupt a scan.
   */
  assertive: boolean
}

export const SCAN_FEEDBACK_STATES: readonly ScanFeedbackState[] = [
  'recorded',
  'duplicate',
  'refused',
  'queued',
  'error'
]

/**
 * One entry per outcome, with no fallthrough: a missing state is a type error
 * rather than a silent "success" banner.
 */
export const SCAN_FEEDBACK: Readonly<Record<ScanFeedbackState, ScanFeedback>> = {
  recorded: {
    state: 'recorded',
    label: 'Recorded',
    tone: 'success',
    glyph: '✓',
    vibration: [40],
    assertive: false
  },
  duplicate: {
    state: 'duplicate',
    label: 'Already checked in',
    tone: 'warning',
    glyph: '!',
    // Two pulses: present, but nothing new was written.
    vibration: [40, 60, 40],
    assertive: false
  },
  refused: {
    state: 'refused',
    label: 'Not recorded',
    tone: 'danger',
    glyph: '×',
    // Three heavy pulses: stop and read.
    vibration: [120, 60, 120, 60, 120],
    assertive: true
  },
  queued: {
    state: 'queued',
    label: 'Saved on this phone',
    tone: 'info',
    glyph: '↓',
    // Three light pulses: kept locally, not sent yet.
    vibration: [25, 40, 25, 40, 25],
    assertive: false
  },
  error: {
    state: 'error',
    label: 'Scan failed',
    tone: 'danger',
    glyph: '⚠',
    // One long pulse: the tool, not the student, needs attention.
    vibration: [250],
    assertive: true
  }
}

/** The one feedback record for an outcome. */
export function feedbackFor(state: ScanFeedbackState): ScanFeedback {
  return SCAN_FEEDBACK[state]
}

export interface ScanFailureLike {
  /** HTTP status; 0 means the request never reached the server. */
  status?: number
  message?: string
}

/**
 * Classifies a thrown scan failure. The server answers "already checked in"
 * with a 403 and that exact sentence, and there is no separate error code, so
 * the sentence is the only truthful duplicate signal. Any other 4xx is a
 * refusal; a missing status or a 5xx is a broken scan.
 */
export function scanFailureState(error: ScanFailureLike): 'duplicate' | 'refused' | 'error' {
  const message = error.message ?? ''
  if (/already checked in/i.test(message)) return 'duplicate'
  const status = typeof error.status === 'number' ? error.status : 0
  if (status >= 400 && status < 500) return 'refused'
  return 'error'
}

/** The smallest surface `navigator.vibrate` needs; missing entirely on iOS. */
export interface VibrationTarget {
  vibrate?: (pattern: Iterable<number>) => boolean
}

/**
 * Buzzes once for an outcome. A browser without the Vibration API, or one that
 * throws (some require a user gesture), simply does not buzz: a scan must never
 * fail because a phone cannot vibrate.
 */
export function vibrateFeedback(
  state: ScanFeedbackState,
  target: VibrationTarget | null = typeof navigator === 'undefined'
    ? null
    : navigator as unknown as VibrationTarget
): boolean {
  const pattern = feedbackFor(state).vibration
  if (!target || typeof target.vibrate !== 'function') return false
  try {
    target.vibrate.call(target, [...pattern])
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Torch (T-0012)
//
// Android Chrome reports `torch` on the live video track; iOS Safari does not
// expose it at all. The control is rendered only when the platform says yes,
// and a track that refuses the constraint is treated as "no torch" instead of
// an error over the camera.
// ---------------------------------------------------------------------------

/** True only when the platform explicitly reports a controllable torch. */
export function torchReported(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== 'object') return false
  return (capabilities as { torch?: unknown }).torch === true
}

/**
 * Reads torch support through a callback that may throw (an ended track does).
 * A thrown read is "not supported", never an exception the page has to handle.
 */
export function detectTorch(read: () => unknown): boolean {
  try {
    return torchReported(read())
  } catch {
    return false
  }
}

/** The html5-qrcode capability shape, narrowed to what the toggle uses. */
export interface TorchSwitch {
  isSupported: () => boolean
  apply: (value: boolean) => Promise<void>
}

/**
 * Applies a torch state, returning whether it took effect. Refusals are
 * swallowed: the camera keeps scanning with whatever light it already had.
 */
export async function applyTorchMode(feature: TorchSwitch | null | undefined, on: boolean): Promise<boolean> {
  if (!feature) return false
  try {
    if (!feature.isSupported()) return false
    await feature.apply(on)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export interface ScannerHandle {
  stop: () => Promise<void>
  /** True only when the live camera track reports a torch. */
  readonly torchSupported: boolean
  /**
   * Tries to switch the torch. Resolves to whether it took effect; a failure is
   * silent and never blocks or interrupts a scan.
   */
  setTorch: (on: boolean) => Promise<boolean>
}

export async function startStudentScanner(
  elementId: string,
  onDecoded: (text: string) => void
): Promise<ScannerHandle> {
  const { Html5Qrcode: Scanner, Html5QrcodeSupportedFormats } = await import('html5-qrcode')

  // D-03: iOS officers do QR-only duty. Reading 1D barcodes on iOS Safari leans
  // on a polyfill we cannot verify from here, so the supported split is QR
  // everywhere and ID barcodes on Chromium — with the number search as the
  // fallback on any phone.
  const isAppleMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const formats = [
    Html5QrcodeSupportedFormats.QR_CODE,
    ...(isAppleMobile
      ? []
      : [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ])
  ]

  const scanner: Html5Qrcode = new Scanner(elementId, {
    verbose: false,
    formatsToSupport: formats
  })

  await scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText: string) => onDecoded(decodedText),
    () => {} // per-frame decode misses are normal; ignore them
  )

  return {
    stop: async () => {
      await scanner.stop().catch(() => {})
      scanner.clear()
    },
    torchSupported: detectTorch(() => scanner.getRunningTrackCapabilities()),
    setTorch: (on: boolean) => {
      try {
        return applyTorchMode(scanner.getRunningTrackCameraCapabilities().torchFeature(), on)
      } catch {
        // The rendered camera went away between the tap and the constraint.
        return Promise.resolve(false)
      }
    }
  }
}
