import { describe, expect, it } from 'vitest'
import {
  isPlacementEmpty,
  normalizeAcademicCode,
  normalizeAcademicName,
  normalizeContactNumber,
  parsePlacement,
  parseYearLevel,
  parseYearLevels,
  resolvePlacement,
  type AcademicStore
} from '../../server/utils/academic'
import { HttpError } from '../../server/utils/http'

function fakeStore(overrides: Partial<Record<'college' | 'program' | 'section', unknown>> = {}): AcademicStore {
  const college = { id: 'c1', archived: false }
  const program = { id: 'p1', collegeId: 'c1', name: 'BS Information Technology', yearLevels: 4, archived: false }
  const section = { id: 's1', programId: 'p1', yearLevel: 2, archived: false }
  return {
    college: { findUnique: async () => (overrides.college === undefined ? college : overrides.college as never) },
    program: { findUnique: async () => (overrides.program === undefined ? program : overrides.program as never) },
    section: { findUnique: async () => (overrides.section === undefined ? section : overrides.section as never) }
  }
}

async function expectRejects(promise: Promise<unknown>, status: number, messagePart?: string) {
  try {
    await promise
    expect.unreachable('expected the promise to reject')
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(status)
    if (messagePart) expect((err as HttpError).message).toContain(messagePart)
  }
}

describe('academic reference validation', () => {
  it('normalizes codes to upper case and rejects junk', () => {
    expect(normalizeAcademicCode(' cici ', 'College code')).toBe('CICI')
    expect(() => normalizeAcademicCode('C', 'College code')).toThrow()
    expect(() => normalizeAcademicCode('has space', 'College code')).toThrow()
  })

  it('validates names', () => {
    expect(normalizeAcademicName('  College of Education ', 'College name')).toBe('College of Education')
    expect(() => normalizeAcademicName('ab', 'College name')).toThrow()
  })

  it('defaults year levels to 4 and bounds them', () => {
    expect(parseYearLevels(undefined)).toBe(4)
    expect(parseYearLevels('5')).toBe(5)
    expect(() => parseYearLevels(0)).toThrow()
    expect(() => parseYearLevels(7)).toThrow()
  })

  it('bounds a student year level by the program', () => {
    expect(parseYearLevel('3', 4)).toBe(3)
    expect(() => parseYearLevel(5, 4)).toThrow()
  })

  it('passes through empty or well-formed contact numbers', () => {
    expect(normalizeContactNumber('')).toBeNull()
    expect(normalizeContactNumber(' 0917 123 4567 ')).toBe('0917 123 4567')
    expect(() => normalizeContactNumber('call me')).toThrow()
  })

  it('reads a placement out of a body and detects the empty case', () => {
    const empty = parsePlacement({})
    expect(isPlacementEmpty(empty)).toBe(true)

    const full = parsePlacement({ collegeId: 'c1', programId: 'p1', yearLevel: 2, sectionId: 's1' })
    expect(isPlacementEmpty(full)).toBe(false)
    expect(full).toEqual({ collegeId: 'c1', programId: 'p1', yearLevel: 2, sectionId: 's1' })
  })
})

describe('resolvePlacement', () => {
  it('returns null when nothing was submitted', async () => {
    expect(await resolvePlacement(fakeStore(), parsePlacement({}))).toBeNull()
  })

  it('resolves a full, consistent placement', async () => {
    const resolved = await resolvePlacement(fakeStore(), { collegeId: 'c1', programId: 'p1', yearLevel: 2, sectionId: 's1' })
    expect(resolved).toEqual({
      collegeId: 'c1',
      programId: 'p1',
      yearLevel: 2,
      sectionId: 's1',
      programName: 'BS Information Technology'
    })
  })

  it('requires college, program and year level together', async () => {
    await expectRejects(resolvePlacement(fakeStore(), { collegeId: 'c1', programId: null, yearLevel: null, sectionId: null }), 400, 'Program is required')
    await expectRejects(resolvePlacement(fakeStore(), { collegeId: null, programId: 'p1', yearLevel: 1, sectionId: null }), 400, 'College is required')
    await expectRejects(resolvePlacement(fakeStore(), { collegeId: 'c1', programId: 'p1', yearLevel: null, sectionId: null }), 400, 'Year level is required')
  })

  it('rejects unknown or archived reference rows', async () => {
    await expectRejects(resolvePlacement(fakeStore({ college: null }), { collegeId: 'c1', programId: 'p1', yearLevel: 1, sectionId: null }), 400, 'Unknown college')
    await expectRejects(resolvePlacement(fakeStore({ program: null }), { collegeId: 'c1', programId: 'p1', yearLevel: 1, sectionId: null }), 400, 'Unknown program')
    await expectRejects(resolvePlacement(fakeStore({ section: null }), { collegeId: 'c1', programId: 'p1', yearLevel: 2, sectionId: 's1' }), 400, 'Unknown section')

    const archivedProgram = { id: 'p1', collegeId: 'c1', name: 'X', yearLevels: 4, archived: true }
    await expectRejects(resolvePlacement(fakeStore({ program: archivedProgram }), { collegeId: 'c1', programId: 'p1', yearLevel: 1, sectionId: null }), 400, 'archived')
  })

  it('rejects mismatched program/college and section/program/year', async () => {
    const otherCollegeProgram = { id: 'p1', collegeId: 'c9', name: 'X', yearLevels: 4, archived: false }
    await expectRejects(resolvePlacement(fakeStore({ program: otherCollegeProgram }), { collegeId: 'c1', programId: 'p1', yearLevel: 1, sectionId: null }), 400, 'does not belong to the selected college')

    const otherProgramSection = { id: 's1', programId: 'p9', yearLevel: 2, archived: false }
    await expectRejects(resolvePlacement(fakeStore({ section: otherProgramSection }), { collegeId: 'c1', programId: 'p1', yearLevel: 2, sectionId: 's1' }), 400, 'does not belong to the selected program')

    const wrongYearSection = { id: 's1', programId: 'p1', yearLevel: 3, archived: false }
    await expectRejects(resolvePlacement(fakeStore({ section: wrongYearSection }), { collegeId: 'c1', programId: 'p1', yearLevel: 2, sectionId: 's1' }), 400, 'not offered in the selected year level')
  })

  it('bounds the year level by the program length', async () => {
    await expectRejects(resolvePlacement(fakeStore(), { collegeId: 'c1', programId: 'p1', yearLevel: 5, sectionId: null }), 400, 'between 1 and 4')
  })
})
