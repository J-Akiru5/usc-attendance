import { describe, expect, it } from 'vitest'
import { ALL_STUDENTS, describeAudience, matchesAudience, specFromEvent } from '../../server/utils/audience'

describe('specFromEvent', () => {
  it('reads each kind of audience', () => {
    expect(specFromEvent({ audienceType: 'college', audienceCollegeId: 'c1' })).toEqual({ type: 'college', collegeId: 'c1', yearLevel: null, sectionId: null })
    expect(specFromEvent({ audienceType: 'yearLevel', audienceYearLevel: 3 })).toEqual({ type: 'yearLevel', collegeId: null, yearLevel: 3, sectionId: null })
    expect(specFromEvent({ audienceType: 'section', audienceSectionId: 's1' })).toEqual({ type: 'section', collegeId: null, yearLevel: null, sectionId: 's1' })
  })

  it('treats anything unexpected as everyone', () => {
    expect(specFromEvent({})).toEqual(ALL_STUDENTS)
    expect(specFromEvent({ audienceType: 'faculty', audienceCollegeId: 'c1' })).toEqual(ALL_STUDENTS)
    expect(specFromEvent({ audienceType: null })).toEqual(ALL_STUDENTS)
  })

  it('drops targets that do not belong to the chosen type', () => {
    expect(specFromEvent({ audienceType: 'yearLevel', audienceCollegeId: 'c1', audienceYearLevel: 2, audienceSectionId: 's1' }))
      .toEqual({ type: 'yearLevel', collegeId: null, yearLevel: 2, sectionId: null })
  })
})

describe('matchesAudience', () => {
  const member = { userId: 'u1', collegeId: 'c1', yearLevel: 2, sectionId: 's1' }

  it('everyone belongs to "all"', () => {
    expect(matchesAudience(member, ALL_STUDENTS)).toBe(true)
    expect(matchesAudience({ userId: 'u2', collegeId: null, yearLevel: null, sectionId: null }, ALL_STUDENTS)).toBe(true)
  })

  it('matches the chosen college, year or section', () => {
    expect(matchesAudience(member, { type: 'college', collegeId: 'c1', yearLevel: null, sectionId: null })).toBe(true)
    expect(matchesAudience(member, { type: 'college', collegeId: 'c2', yearLevel: null, sectionId: null })).toBe(false)
    expect(matchesAudience(member, { type: 'yearLevel', collegeId: null, yearLevel: 2, sectionId: null })).toBe(true)
    expect(matchesAudience(member, { type: 'yearLevel', collegeId: null, yearLevel: 3, sectionId: null })).toBe(false)
    expect(matchesAudience(member, { type: 'section', collegeId: null, yearLevel: null, sectionId: 's1' })).toBe(true)
    expect(matchesAudience(member, { type: 'section', collegeId: null, yearLevel: null, sectionId: 's2' })).toBe(false)
  })

  it('never lets an unplaced student match a narrowed audience', () => {
    const unplaced = { userId: 'u2', collegeId: null, yearLevel: null, sectionId: null }
    expect(matchesAudience(unplaced, { type: 'college', collegeId: 'c1', yearLevel: null, sectionId: null })).toBe(false)
    expect(matchesAudience(unplaced, { type: 'yearLevel', collegeId: null, yearLevel: 1, sectionId: null })).toBe(false)
    expect(matchesAudience(unplaced, { type: 'section', collegeId: null, yearLevel: null, sectionId: 's1' })).toBe(false)
  })

  it('refuses to match when the narrowed target is missing', () => {
    expect(matchesAudience(member, { type: 'college', collegeId: null, yearLevel: null, sectionId: null })).toBe(false)
    expect(matchesAudience(member, { type: 'yearLevel', collegeId: null, yearLevel: null, sectionId: null })).toBe(false)
    expect(matchesAudience(member, { type: 'section', collegeId: null, yearLevel: null, sectionId: null })).toBe(false)
  })
})

describe('describeAudience', () => {
  it('reads like a sentence', () => {
    expect(describeAudience(ALL_STUDENTS)).toBe('All students')
    expect(describeAudience({ type: 'college', collegeId: 'c1', yearLevel: null, sectionId: null }, { college: 'College of Education' }))
      .toBe('Everyone in College of Education')
    expect(describeAudience({ type: 'yearLevel', collegeId: null, yearLevel: 4, sectionId: null })).toBe('Everyone in year 4')
    expect(describeAudience({ type: 'section', collegeId: null, yearLevel: null, sectionId: 's1' }, { section: 'BSED 1-A' }))
      .toBe('Everyone in BSED 1-A')
  })
})
