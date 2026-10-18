import { describe, expect, it } from 'vitest'
import {
  MAX_OCCURRENCES,
  describeRecurrence,
  expandRecurrence,
  formatRrule,
  parseRrule,
  planSeriesChanges
} from '../../server/utils/recurrence'

const at = (text: string) => new Date(text)

describe('parseRrule', () => {
  it('reads a full weekly rule', () => {
    const spec = parseRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
    expect(spec).toMatchObject({ freq: 'WEEKLY', interval: 2, byday: [1, 3], until: null, count: null })
  })

  it('accepts the compact RFC UNTIL form', () => {
    const spec = parseRrule('FREQ=DAILY;UNTIL=20261231T235959Z')
    expect(spec.until?.toISOString()).toBe('2026-12-31T23:59:59.000Z')
  })

  it('refuses what it does not understand', () => {
    expect(() => parseRrule('')).toThrow(/empty/i)
    expect(() => parseRrule('FREQ=HOURLY')).toThrow(/FREQ/)
    expect(() => parseRrule('FREQ=WEEKLY;BYHOUR=9')).toThrow(/Unknown rule part/i)
    expect(() => parseRrule('FREQ=WEEKLY;INTERVAL=0')).toThrow(/INTERVAL/)
    expect(() => parseRrule('FREQ=WEEKLY;BYDAY=XX')).toThrow(/weekday/i)
    expect(() => parseRrule('FREQ=DAILY;BYDAY=MO')).toThrow(/weekly/i)
    expect(() => parseRrule('FREQ=WEEKLY;COUNT=1')).toThrow(/COUNT/)
    expect(() => parseRrule('FREQ=WEEKLY;UNTIL=20260101;COUNT=5')).toThrow(/either UNTIL or COUNT/i)
  })

  it('round-trips through formatRrule', () => {
    const spec = parseRrule('FREQ=WEEKLY;INTERVAL=3;BYDAY=SU,SA')
    expect(formatRrule(parseRrule(formatRrule(spec)))).toBe(formatRrule(spec))
  })
})

describe('expandRecurrence', () => {
  it('lists the start first and honours COUNT', () => {
    const { occurrences, truncated } = expandRecurrence(parseRrule('FREQ=DAILY;COUNT=4'), at('2026-11-02T01:00:00Z'))
    expect(occurrences.map(d => d.toISOString())).toEqual([
      '2026-11-02T01:00:00.000Z',
      '2026-11-03T01:00:00.000Z',
      '2026-11-04T01:00:00.000Z',
      '2026-11-05T01:00:00.000Z'
    ])
    expect(truncated).toBe(false)
  })

  it('keeps the time of day and steps whole weeks', () => {
    const { occurrences } = expandRecurrence(parseRrule('FREQ=WEEKLY;INTERVAL=2;COUNT=3'), at('2026-11-02T23:30:00Z'))
    expect(occurrences.map(d => d.toISOString())).toEqual([
      '2026-11-02T23:30:00.000Z',
      '2026-11-16T23:30:00.000Z',
      '2026-11-30T23:30:00.000Z'
    ])
  })

  it('takes the requested weekdays, including later ones in the first week', () => {
    // Monday master with BYDAY=MO,WE must include that same Wednesday.
    const { occurrences } = expandRecurrence(parseRrule('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4'), at('2026-11-02T01:00:00Z'))
    expect(occurrences.map(d => d.toISOString())).toEqual([
      '2026-11-02T01:00:00.000Z',
      '2026-11-04T01:00:00.000Z',
      '2026-11-09T01:00:00.000Z',
      '2026-11-11T01:00:00.000Z'
    ])
  })

  it('never puts a weekday before the master', () => {
    // Monday master with BYDAY=SU: the first Sunday is the following week.
    const { occurrences } = expandRecurrence(parseRrule('FREQ=WEEKLY;BYDAY=SU;COUNT=2'), at('2026-11-02T01:00:00Z'))
    expect(occurrences.map(d => d.toISOString())).toEqual(['2026-11-02T01:00:00.000Z', '2026-11-08T01:00:00.000Z'])
  })

  it('skips months that are too short for the day of month', () => {
    const { occurrences } = expandRecurrence(parseRrule('FREQ=MONTHLY;COUNT=4'), at('2026-01-31T01:00:00Z'))
    expect(occurrences.map(d => d.toISOString().slice(0, 10))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31'])
  })

  it('includes an occurrence exactly on UNTIL', () => {
    const { occurrences, truncated } = expandRecurrence(parseRrule('FREQ=DAILY;UNTIL=2026-11-04T01:00:00Z'), at('2026-11-02T01:00:00Z'))
    expect(occurrences.map(d => d.toISOString())).toEqual([
      '2026-11-02T01:00:00.000Z',
      '2026-11-03T01:00:00.000Z',
      '2026-11-04T01:00:00.000Z'
    ])
    expect(truncated).toBe(false)
  })

  it('caps an open-ended rule and says so', () => {
    const capped = expandRecurrence(parseRrule('FREQ=DAILY'), at('2026-01-01T01:00:00Z'), { max: 5 })
    expect(capped.occurrences).toHaveLength(5)
    expect(capped.truncated).toBe(true)

    const openEnded = expandRecurrence(parseRrule('FREQ=WEEKLY'), at('2026-01-01T01:00:00Z'))
    expect(openEnded.occurrences).toHaveLength(MAX_OCCURRENCES)
    expect(openEnded.truncated).toBe(true)
  })
})

describe('planSeriesChanges', () => {
  it('keeps matching dates, drops stale ones, spares the ones holding data and adds the new', () => {
    const desired = [at('2026-11-02T01:00:00Z'), at('2026-11-09T01:00:00Z'), at('2026-11-16T01:00:00Z')]
    const plan = planSeriesChanges(desired, [
      { id: 'a', date: at('2026-11-02T01:00:00Z'), locked: false },
      { id: 'b', date: at('2026-11-04T01:00:00Z'), locked: false },
      { id: 'c', date: at('2026-11-05T01:00:00Z'), locked: true }
    ])
    expect(plan.keep).toEqual(['a'])
    expect(plan.remove).toEqual(['b'])
    expect(plan.locked).toEqual(['c'])
    expect(plan.create.map(d => d.toISOString())).toEqual(['2026-11-09T01:00:00.000Z', '2026-11-16T01:00:00.000Z'])
  })

  it('creates nothing when the series already matches', () => {
    const desired = [at('2026-11-02T01:00:00Z')]
    const plan = planSeriesChanges(desired, [{ id: 'a', date: at('2026-11-02T01:00:00Z'), locked: false }])
    expect(plan).toMatchObject({ keep: ['a'], remove: [], locked: [], create: [] })
  })
})

describe('describeRecurrence', () => {
  it('reads like a sentence', () => {
    expect(describeRecurrence(parseRrule('FREQ=WEEKLY;BYDAY=MO;UNTIL=2026-12-14T01:00:00Z'))).toBe('Every week on Monday, until 2026-12-14')
    expect(describeRecurrence(parseRrule('FREQ=DAILY;INTERVAL=2;COUNT=6'))).toBe('Every 2 days, 6 times')
    expect(describeRecurrence(parseRrule('FREQ=WEEKLY;INTERVAL=2'))).toBe('Every 2 weeks')
    expect(describeRecurrence(parseRrule('FREQ=MONTHLY'))).toBe('Every month')
  })
})
