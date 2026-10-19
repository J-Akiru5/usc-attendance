import { describe, expect, it } from 'vitest'
import {
  CORRECTABLE_FIELDS,
  EXPORT_EXCLUSIONS,
  EXPORT_SCHEMA_VERSION,
  buildPrivacyExport,
  isCorrectableField,
  parseDecision,
  parseRectificationRequest,
  type PrivacyExportInput
} from '../../server/utils/privacy'

const owner = {
  id: 'user-a',
  email: 'alice@example.invalid',
  name: 'Alice Student',
  position: 'Student',
  role: 'student',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  consentAt: new Date('2026-08-01T00:00:00Z'),
  consentVersion: '2026-10',
  consentSource: 'register'
}

function fixture(): PrivacyExportInput {
  return {
    user: owner,
    profile: {
      studentNo: '22-0001',
      program: 'BSIT',
      yearLevel: 2,
      contactNumber: '+63 900 000 0000',
      college: { code: 'CCS', name: 'College of Computer Studies' },
      programRef: { code: 'BSIT', name: 'Information Technology' },
      section: { name: 'BSIT 2-A', yearLevel: 2 }
    },
    attendance: [
      {
        id: 'att-a',
        userId: owner.id,
        type: 'event',
        method: 'qr',
        createdAt: new Date('2026-09-01T08:00:00Z'),
        checkOutAt: null,
        dutyDate: null,
        event: { title: 'Assembly', date: new Date('2026-09-01T07:00:00Z') },
        signature: { signedAt: new Date('2026-09-01T08:01:00Z'), purgedAt: null }
      },
      {
        id: 'att-b',
        userId: 'user-b',
        type: 'event',
        method: 'manual',
        createdAt: new Date('2026-09-01T08:00:00Z'),
        checkOutAt: null,
        dutyDate: null,
        event: { title: 'Assembly', date: new Date('2026-09-01T07:00:00Z') },
        signature: null
      }
    ],
    fines: [
      {
        id: 'fine-a',
        userId: owner.id,
        kind: 'absent',
        sanctionType: 'monetary',
        amountCentavos: 5000,
        status: 'unpaid',
        issuedAt: new Date('2026-09-02T00:00:00Z'),
        paidAt: null,
        paymentRef: null,
        waivedAt: null,
        servedAt: null,
        event: { title: 'Assembly', date: new Date('2026-09-01T07:00:00Z') }
      },
      {
        id: 'fine-b',
        userId: 'user-b',
        kind: 'late',
        sanctionType: 'monetary',
        amountCentavos: 2500,
        status: 'paid',
        issuedAt: new Date('2026-09-02T00:00:00Z'),
        paidAt: new Date('2026-09-03T00:00:00Z'),
        paymentRef: 'OR-B-1',
        waivedAt: null,
        servedAt: null,
        event: { title: 'Assembly', date: new Date('2026-09-01T07:00:00Z') }
      }
    ],
    clearances: [
      {
        id: 'clear-a',
        userId: owner.id,
        code: 'CLR-A',
        coveredCentavos: 5000,
        issuedAt: new Date('2026-09-04T00:00:00Z'),
        revokedAt: null
      },
      {
        id: 'clear-b',
        userId: 'user-b',
        code: 'CLR-B',
        coveredCentavos: 2500,
        issuedAt: new Date('2026-09-04T00:00:00Z'),
        revokedAt: null
      }
    ],
    excuses: [
      {
        id: 'exc-a',
        userId: owner.id,
        category: 'medical',
        reason: 'Fever, with a clinic note.',
        status: 'approved',
        createdAt: new Date('2026-09-03T00:00:00Z'),
        reviewedAt: new Date('2026-09-04T00:00:00Z')
      },
      {
        id: 'exc-b',
        userId: 'user-b',
        category: 'other',
        reason: 'Someone else',
        status: 'pending',
        createdAt: new Date('2026-09-03T00:00:00Z'),
        reviewedAt: null
      }
    ],
    privacyRequests: [
      {
        id: 'req-a',
        userId: owner.id,
        kind: 'rectification',
        field: 'name',
        proposedValue: 'Alice A. Student',
        note: 'Middle initial missing',
        status: 'accepted',
        reason: 'Confirmed against the registrar list.',
        createdAt: new Date('2026-09-05T00:00:00Z'),
        decidedAt: new Date('2026-09-06T00:00:00Z')
      },
      {
        id: 'req-b',
        userId: 'user-b',
        kind: 'rectification',
        field: 'name',
        proposedValue: 'Bob Student',
        note: 'Someone else',
        status: 'pending',
        reason: null,
        createdAt: new Date('2026-09-05T00:00:00Z'),
        decidedAt: null
      }
    ]
  }
}

describe('privacy export contents', () => {
  it('contains the caller profile, consents and own records', () => {
    const bundle = buildPrivacyExport(fixture(), new Date('2026-10-20T00:00:00Z'))
    expect(bundle.schemaVersion).toBe(EXPORT_SCHEMA_VERSION)
    expect(bundle.subject).toMatchObject({ id: owner.id, email: owner.email, name: owner.name })
    expect(bundle.consents.coreAttendance.noticeVersion).toBe('2026-10')
    expect(bundle.profile?.studentNo).toBe('22-0001')
    expect(bundle.attendance).toHaveLength(1)
    expect(bundle.fines).toHaveLength(1)
    expect(bundle.clearances).toHaveLength(1)
    expect(bundle.excuses).toHaveLength(1)
    expect(bundle.privacyRequests).toHaveLength(1)
  })

  it('never includes another student, even if a query hands one over', () => {
    const bundle = buildPrivacyExport(fixture())
    expect(bundle.attendance.map(row => row.id)).toEqual(['att-a'])
    expect(bundle.fines.map(row => row.id)).toEqual(['fine-a'])
    expect(bundle.clearances.map(row => row.id)).toEqual(['clear-a'])
    expect(bundle.excuses.map(row => row.id)).toEqual(['exc-a'])
    expect(bundle.privacyRequests.map(row => row.id)).toEqual(['req-a'])

    const serialised = JSON.stringify(bundle)
    for (const foreign of ['user-b', 'fine-b', 'att-b', 'CLR-B', 'exc-b', 'req-b', 'Someone else', 'OR-B-1']) {
      expect(serialised).not.toContain(foreign)
    }
  })

  it('drops internal notes, staff ids, raw coordinates and storage keys', () => {
    const input = fixture()
    const fine = input.fines[0]!
    const fineWithNotes = {
      ...fine,
      waiveReason: 'internal note about the waiver',
      servedNote: 'internal note about service',
      paidBy: 'staff-1',
      waivedBy: 'staff-1'
    }
    input.fines[0] = fineWithNotes
    const excuse = input.excuses[0]!
    const excuseWithNotes = { ...excuse, reviewNote: 'internal note about the excuse', attachmentKey: 'r2/private/key' }
    input.excuses[0] = excuseWithNotes
    const attendance = input.attendance[0]!
    const attendanceWithLocation = { ...attendance, lat: 10.72, lng: 122.56, recordedBy: 'staff-1' }
    input.attendance[0] = attendanceWithLocation
    const clearance = input.clearances[0]!
    const clearanceWithNote = { ...clearance, note: 'internal note about the clearance', issuedBy: 'staff-1' }
    input.clearances[0] = clearanceWithNote

    const serialised = JSON.stringify(buildPrivacyExport(input))
    for (const excluded of [
      'internal note about the waiver',
      'internal note about service',
      'internal note about the excuse',
      'internal note about the clearance',
      'staff-1',
      'r2/private/key',
      '10.72',
      '122.56'
    ]) {
      expect(serialised).not.toContain(excluded)
    }
    expect(serialised).not.toMatch(/"lat"|"lng"|"reviewNote"|"waiveReason"|"servedNote"/)
  })

  it('says what it excludes so the UI can explain the copy', () => {
    expect(EXPORT_EXCLUSIONS.join(' ')).toMatch(/other students/i)
    expect(EXPORT_EXCLUSIONS.join(' ')).toMatch(/internal notes/i)
    expect(EXPORT_EXCLUSIONS.join(' ')).toMatch(/geolocation/i)
  })
})

describe('rectification request rules', () => {
  it('accepts exactly the four stored fields and normalises the value', () => {
    expect(CORRECTABLE_FIELDS).toEqual(['name', 'studentNo', 'yearLevel', 'section'])
    expect(parseRectificationRequest({ field: 'name', proposedValue: '  Alice   A.  Student ' }))
      .toEqual({ field: 'name', proposedValue: 'Alice A. Student', note: null })
    expect(parseRectificationRequest({ field: 'STUDENTNO', proposedValue: '22-0001' }).proposedValue).toBe('22-0001')
    expect(parseRectificationRequest({ field: 'yearlevel', proposedValue: '3' }))
      .toMatchObject({ field: 'yearLevel', proposedValue: '3' })
    expect(parseRectificationRequest({ field: 'student_number', proposedValue: '22-0001' }).field).toBe('studentNo')
    expect(parseRectificationRequest({ field: 'year_level', proposedValue: '3' }).field).toBe('yearLevel')
    expect(parseRectificationRequest({ field: 'yearLevel', proposedValue: '3' }).proposedValue).toBe('3')
    expect(parseRectificationRequest({ field: 'section', proposedValue: ' BSIT  2-A ' }).proposedValue).toBe('BSIT 2-A')
  })

  it('keeps an optional note and trims it', () => {
    const parsed = parseRectificationRequest({ field: 'name', proposedValue: 'Alice Student', note: '  missing middle initial ' })
    expect(parsed.note).toBe('missing middle initial')
  })

  it('refuses a missing field or an empty proposed value', () => {
    expect(() => parseRectificationRequest({ proposedValue: 'Alice' })).toThrow(/field/i)
    expect(() => parseRectificationRequest({ field: 'name', proposedValue: '   ' })).toThrow(/corrected value/i)
    expect(() => parseRectificationRequest({ field: 'name' })).toThrow(/corrected value/i)
  })

  it('refuses fields that are derived or record a financial event', () => {
    for (const field of ['amountCentavos', 'status', 'email', 'role', 'clearance', 'attendance']) {
      expect(() => parseRectificationRequest({ field, proposedValue: '0' })).toThrow(/cannot be corrected/i)
    }
    expect(isCorrectableField('name')).toBe(true)
    expect(isCorrectableField('amountCentavos')).toBe(false)
  })

  it('refuses a value the student-administration route would refuse', () => {
    expect(() => parseRectificationRequest({ field: 'name', proposedValue: '<b>Alice</b>' })).toThrow()
    expect(() => parseRectificationRequest({ field: 'studentNo', proposedValue: 'x' })).toThrow()
    expect(() => parseRectificationRequest({ field: 'yearLevel', proposedValue: '9' })).toThrow(/year level/i)
  })

  it('refuses an over-long note and a non-text note', () => {
    expect(() => parseRectificationRequest({ field: 'name', proposedValue: 'Alice', note: 'x'.repeat(501) })).toThrow(/500/)
    expect(() => parseRectificationRequest({ field: 'name', proposedValue: 'Alice', note: 42 })).toThrow(/text/i)
  })
})

describe('staff decisions', () => {
  it('accepts or rejects only with a reason', () => {
    expect(parseDecision({ status: 'accepted', reason: 'Matches the registrar list.' }))
      .toEqual({ status: 'accepted', reason: 'Matches the registrar list.' })
    expect(parseDecision({ status: 'rejected', reason: 'The record is already correct.' }).status).toBe('rejected')
  })

  it('refuses an unknown outcome or an empty reason', () => {
    expect(() => parseDecision({ status: 'pending', reason: 'x' })).toThrow(/accepted or rejected/i)
    expect(() => parseDecision({ status: 'accepted' })).toThrow(/reason/i)
    expect(() => parseDecision({ status: 'rejected', reason: '   ' })).toThrow(/reason/i)
  })
})
