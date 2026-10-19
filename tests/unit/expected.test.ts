import { describe, expect, it } from 'vitest'
import type { AudienceSpec, AudienceType } from '../../server/utils/audience'
import {
  expectedAudience,
  expectedRows,
  frozenAt,
  frozenAudience,
  planSnapshot,
  snapshotDue,
  type ExistingExpectedRow,
  type ExpectedMember
} from '../../server/utils/expected'

const spec = (type: AudienceType, extra: Partial<AudienceSpec> = {}): AudienceSpec => ({
  type,
  collegeId: null,
  yearLevel: null,
  sectionId: null,
  ...extra
})

const member = (
  userId: string,
  collegeId: string | null = null,
  yearLevel: number | null = null,
  sectionId: string | null = null
): ExpectedMember => ({ userId, collegeId, yearLevel, sectionId })

const NOW = new Date('2026-10-20T09:00:00Z')

describe('snapshotDue', () => {
  const base = { date: new Date('2026-10-20T08:00:00Z'), checkInClosesAt: new Date('2026-10-20T10:00:00Z') }

  it('is not due before the window closes', () => {
    expect(snapshotDue(base, new Date('2026-10-20T09:59:59Z'))).toBe(false)
  })

  it('is due at the close and after it', () => {
    expect(snapshotDue(base, new Date('2026-10-20T10:00:00Z'))).toBe(true)
    expect(snapshotDue(base, new Date('2026-10-21T10:00:00Z'))).toBe(true)
  })

  it('falls back to six hours after the start when no close is set', () => {
    const noClose = { date: new Date('2026-10-20T08:00:00Z'), checkInClosesAt: null }
    expect(snapshotDue(noClose, new Date('2026-10-20T13:59:59Z'))).toBe(false)
    expect(snapshotDue(noClose, new Date('2026-10-20T14:00:00Z'))).toBe(true)
    expect(snapshotDue(noClose, new Date('2026-10-20T09:00:00Z'), 1)).toBe(true)
  })

  it('never freezes a cancelled event', () => {
    expect(snapshotDue({ ...base, status: 'cancelled' }, new Date('2026-11-01T00:00:00Z'))).toBe(false)
    expect(snapshotDue({ ...base, status: 'scheduled' }, new Date('2026-11-01T00:00:00Z'))).toBe(true)
  })
})

describe('expectedRows', () => {
  it('selects every member for "all", including the unplaced', () => {
    const rows = expectedRows({
      eventId: 'e1',
      spec: spec('all'),
      members: [member('u2', 'c1', 2, 's1'), member('u1'), member('u2', 'c1', 2, 's1')],
      snapshotAt: NOW
    })

    expect(rows.map(row => row.userId)).toEqual(['u1', 'u2'])
    expect(rows.every(row => row.source === 'all')).toBe(true)
    expect(rows.every(row => row.snapshotAt.getTime() === NOW.getTime())).toBe(true)
  })

  it('matches a college audience and keeps the placement that explained it', () => {
    const rows = expectedRows({
      eventId: 'e1',
      spec: spec('college', { collegeId: 'c1' }),
      members: [member('u1', 'c1', 2, 's1'), member('u2', 'c2', 2, 's2'), member('u3')],
      snapshotAt: NOW
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ eventId: 'e1', userId: 'u1', source: 'college', collegeId: 'c1', yearLevel: 2, sectionId: 's1' })
  })

  it('matches a year level and a section, never an unplaced student', () => {
    const members = [member('u1', 'c1', 2, 's1'), member('u2', 'c1', 3, 's2'), member('u3')]

    expect(expectedRows({ eventId: 'e', spec: spec('yearLevel', { yearLevel: 2 }), members, snapshotAt: NOW }).map(r => r.userId)).toEqual(['u1'])
    expect(expectedRows({ eventId: 'e', spec: spec('section', { sectionId: 's2' }), members, snapshotAt: NOW }).map(r => r.userId)).toEqual(['u2'])
  })

  it('refuses to widen an incomplete narrowed spec', () => {
    const members = [member('u1', 'c1', 2, 's1')]
    expect(expectedRows({ eventId: 'e', spec: spec('college'), members, snapshotAt: NOW })).toEqual([])
    expect(expectedRows({ eventId: 'e', spec: spec('yearLevel'), members, snapshotAt: NOW })).toEqual([])
  })
})

describe('frozenAudience / frozenAt', () => {
  const rows: ExistingExpectedRow[] = [
    { userId: 'b', source: 'college', collegeId: 'c1', yearLevel: 2, sectionId: 's1', snapshotAt: new Date('2026-10-20T10:00:00Z') },
    { userId: 'a', source: 'college', collegeId: 'c1', yearLevel: 2, sectionId: 's1', snapshotAt: new Date('2026-10-20T10:00:00Z') }
  ]

  it('returns the ids in a stable order, or null when nothing is frozen', () => {
    expect(frozenAudience([])).toBeNull()
    expect(frozenAudience(rows)).toEqual(['a', 'b'])
  })

  it('names the latest freeze time, or null', () => {
    expect(frozenAt([])).toBeNull()
    expect(frozenAt(rows)?.toISOString()).toBe('2026-10-20T10:00:00.000Z')
    expect(frozenAt([...rows, { ...rows[0]!, userId: 'c', snapshotAt: new Date('2026-10-21T10:00:00Z') }])?.toISOString())
      .toBe('2026-10-21T10:00:00.000Z')
  })
})

describe('expectedAudience', () => {
  const frozen: ExistingExpectedRow[] = [
    { userId: 'frozen', source: 'all', collegeId: null, yearLevel: null, sectionId: null, snapshotAt: NOW }
  ]

  it('lets a frozen snapshot win over a live resolve', () => {
    expect(expectedAudience(frozen, ['live-a', 'live-b'])).toEqual(['frozen'])
  })

  it('falls back to a deduplicated live resolve when nothing is frozen', () => {
    expect(expectedAudience([], ['b', 'a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('planSnapshot', () => {
  const members = [member('u2', 'c1', 2, 's1'), member('u1', 'c1', 2, 's1')]

  it('freezes the whole audience on the first run', () => {
    const plan = planSnapshot({ eventId: 'e1', spec: spec('college', { collegeId: 'c1' }), members, existing: [], now: NOW })

    expect(plan.unchanged).toBe(false)
    expect(plan.audienceIds).toEqual(['u1', 'u2'])
    expect(plan.created).toEqual(['u1', 'u2'])
    expect(plan.removed).toEqual([])
    expect(plan.changed).toEqual([])
    expect(plan.snapshotAt.toISOString()).toBe(NOW.toISOString())
    expect(plan.rows.every(row => row.collegeId === 'c1' && row.source === 'college')).toBe(true)
  })

  it('is unchanged when the same population and placements are frozen again', () => {
    const first = planSnapshot({ eventId: 'e1', spec: spec('college', { collegeId: 'c1' }), members, existing: [], now: NOW })
    const second = planSnapshot({
      eventId: 'e1',
      spec: spec('college', { collegeId: 'c1' }),
      members,
      existing: first.rows,
      now: new Date('2026-10-22T09:00:00Z')
    })

    expect(second.unchanged).toBe(true)
    expect(second.created).toEqual([])
    expect(second.removed).toEqual([])
    expect(second.changed).toEqual([])
    expect(second.snapshotAt.toISOString()).toBe(NOW.toISOString())
    expect(second.audienceIds).toEqual(['u1', 'u2'])
  })

  it('notices a placement change and carries the new placement', () => {
    const existing: ExistingExpectedRow[] = [
      { userId: 'u1', source: 'college', collegeId: 'c1', yearLevel: 2, sectionId: 's1', snapshotAt: NOW }
    ]
    const plan = planSnapshot({
      eventId: 'e1',
      spec: spec('college', { collegeId: 'c1' }),
      members: [member('u1', 'c1', 3, 's2')],
      existing,
      now: new Date('2026-10-21T09:00:00Z')
    })

    expect(plan.unchanged).toBe(false)
    expect(plan.changed).toEqual(['u1'])
    expect(plan.rows[0]).toMatchObject({ userId: 'u1', yearLevel: 3, sectionId: 's2' })
    expect(plan.snapshotAt.toISOString()).toBe('2026-10-21T09:00:00.000Z')
  })

  it('reports joiners and leavers separately', () => {
    const existing: ExistingExpectedRow[] = [
      { userId: 'u1', source: 'college', collegeId: 'c1', yearLevel: 2, sectionId: 's1', snapshotAt: NOW },
      { userId: 'gone', source: 'college', collegeId: 'c1', yearLevel: 2, sectionId: 's1', snapshotAt: NOW }
    ]
    const plan = planSnapshot({
      eventId: 'e1',
      spec: spec('college', { collegeId: 'c1' }),
      members: [member('u1', 'c1', 2, 's1'), member('new', 'c1', 2, 's1')],
      existing,
      now: NOW
    })

    expect(plan.created).toEqual(['new'])
    expect(plan.removed).toEqual(['gone'])
    expect(plan.changed).toEqual([])
    expect(plan.audienceIds).toEqual(['new', 'u1'])
  })

  it('treats a different audience type as a change even when the people are the same', () => {
    const existing: ExistingExpectedRow[] = [
      { userId: 'u1', source: 'college', collegeId: 'c1', yearLevel: 2, sectionId: 's1', snapshotAt: NOW }
    ]
    const plan = planSnapshot({
      eventId: 'e1',
      spec: spec('yearLevel', { yearLevel: 2 }),
      members: [member('u1', 'c1', 2, 's1')],
      existing,
      now: NOW
    })

    expect(plan.unchanged).toBe(false)
    expect(plan.changed).toEqual(['u1'])
    expect(plan.rows[0]?.source).toBe('yearLevel')
  })

  it('a first freeze of an empty audience is still a first freeze', () => {
    const plan = planSnapshot({ eventId: 'e1', spec: spec('college', { collegeId: 'c1' }), members: [], existing: [], now: NOW })

    expect(plan.unchanged).toBe(false)
    expect(plan.rows).toEqual([])
    expect(plan.snapshotAt.toISOString()).toBe(NOW.toISOString())
  })

  it('removes everyone when the audience no longer matches anyone', () => {
    const existing: ExistingExpectedRow[] = [
      { userId: 'u1', source: 'college', collegeId: 'c1', yearLevel: 2, sectionId: 's1', snapshotAt: NOW }
    ]
    const plan = planSnapshot({
      eventId: 'e1',
      spec: spec('college', { collegeId: 'c2' }),
      members: [member('u1', 'c1', 2, 's1')],
      existing,
      now: NOW
    })

    expect(plan.removed).toEqual(['u1'])
    expect(plan.audienceIds).toEqual([])
    expect(plan.unchanged).toBe(false)
  })
})
