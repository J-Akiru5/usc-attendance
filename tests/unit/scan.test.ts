import { describe, expect, it } from 'vitest'
import { classifyScan, findExactStudent, normaliseStudentNo } from '../../app/utils/scan'

describe('classifyScan', () => {
  it('recognises the signed QR token', () => {
    expect(classifyScan('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-DEF_123')).toBe('qr')
  })

  it('recognises a student number off an ID barcode', () => {
    expect(classifyScan('2024-00123')).toBe('student-number')
    expect(classifyScan('ISUFST0001')).toBe('student-number')
    expect(classifyScan('  21-0456  ')).toBe('student-number')
  })

  it('treats anything else as unknown rather than guessing', () => {
    expect(classifyScan('')).toBe('unknown')
    expect(classifyScan('https://example.invalid/x')).toBe('unknown')
    expect(classifyScan('ab')).toBe('unknown')
    expect(classifyScan('x'.repeat(40))).toBe('unknown')
  })
})

describe('normaliseStudentNo', () => {
  it('ignores case and spacing', () => {
    expect(normaliseStudentNo(' 20 24-001 23 ')).toBe('2024-00123')
  })
})

describe('findExactStudent', () => {
  const rows = [
    { id: 'a', studentNo: '2024-00123' },
    { id: 'b', studentNo: '2024-00124' },
    { id: 'c', studentNo: null }
  ]

  it('finds the one exact match however it was typed', () => {
    expect(findExactStudent(rows, '2024-00123')?.id).toBe('a')
    expect(findExactStudent(rows, '  2024-00123 ')?.id).toBe('a')
  })

  it('refuses to guess when nothing or several things match', () => {
    expect(findExactStudent(rows, '2024-001')).toBeNull()
    expect(findExactStudent(rows, '')).toBeNull()
    expect(findExactStudent(rows, 'someone else')).toBeNull()
  })
})
