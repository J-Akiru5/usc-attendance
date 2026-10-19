import { describe, expect, it } from 'vitest'
import {
  EXTERNAL_STEPS,
  NOTE_SIGNATORIES,
  PROPOSAL_STEPS,
  SIGNATORY_LABELS,
  entriesMissingReceipt,
  budgetTotals,
  lineShortfall,
  lineTotals,
  liquidationBlockedReason,
  liquidationModel,
  missingNoteSignatories,
  nextSteps,
  parseCentavos,
  planExpense,
  proposalStatus,
  requireFinanceManager,
  requireFinanceReader,
  statusCounts,
  stepBlockedReason,
  totalsOf
} from '../../server/utils/finance'
import { HttpError } from '../../server/utils/http'

const allNotes = ['noted_president', 'noted_adviser', 'noted_university_accountant']

/** Every subset of the three notes, as the plan wants them proven. */
function noteSubsets(): string[][] {
  const out: string[][] = []
  for (let mask = 0; mask < 8; mask++) {
    out.push(allNotes.filter((_, index) => (mask & (1 << index)) !== 0))
  }
  return out
}

describe('money in centavos', () => {
  it('computes a line as allocated + income − expenses', () => {
    const totals = lineTotals(500_000, [
      { kind: 'expense', amountCentavos: 12_000 },
      { kind: 'expense', amountCentavos: 8_000 },
      { kind: 'income', amountCentavos: 5_000 }
    ])
    expect(totals).toEqual({ incomeCentavos: 5_000, expenseCentavos: 20_000, remainingCentavos: 485_000 })
  })

  it('lets a line go negative when the income does not cover it', () => {
    expect(lineTotals(10_000, [{ kind: 'expense', amountCentavos: 15_000 }]).remainingCentavos).toBe(-5_000)
  })

  it('adds a whole budget up from its lines', () => {
    const totals = budgetTotals([
      { allocatedCentavos: 100_000, entries: [{ kind: 'expense', amountCentavos: 40_000 }] },
      { allocatedCentavos: 50_000, entries: [{ kind: 'income', amountCentavos: 20_000 }, { kind: 'expense', amountCentavos: 5_000 }] }
    ])
    expect(totals).toEqual({
      allocatedCentavos: 150_000,
      incomeCentavos: 20_000,
      expenseCentavos: 45_000,
      remainingCentavos: 125_000
    })
  })

  it('refuses money that is not a whole number of centavos', () => {
    expect(parseCentavos(5_000, 'The amount')).toBe(5_000)
    expect(parseCentavos('2500', 'The amount')).toBe(2_500)
    expect(() => parseCentavos(12.5, 'The amount')).toThrow(/whole number of centavos/)
    expect(() => parseCentavos(-1, 'The amount')).toThrow(HttpError)
    expect(() => parseCentavos(0, 'The amount')).toThrow(/more than zero/)
    expect(parseCentavos(0, 'The allocation', { allowZero: true })).toBe(0)
  })

  it('totals a mixed ledger', () => {
    expect(totalsOf([
      { kind: 'income', amountCentavos: 3_000 },
      { kind: 'expense', amountCentavos: 1_000 }
    ])).toEqual({ incomeCentavos: 3_000, expenseCentavos: 1_000, netCentavos: 2_000 })
  })
})

describe('the over-budget rule (§8.7 acceptance)', () => {
  it('allows an expense that fits the remaining budget', () => {
    expect(planExpense({ remainingCentavos: 50_000, amountCentavos: 50_000 })).toEqual({ overrideReason: null, shortfallCentavos: 0 })
  })

  it('refuses an expense past the remaining budget with 409 and says by how much', () => {
    try {
      planExpense({ remainingCentavos: 20_000, amountCentavos: 25_000 })
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).status).toBe(409)
      expect((error as HttpError).message).toContain('₱50.00')
      expect((error as HttpError).message).toContain('remaining ₱200.00')
    }
  })

  it('refuses any expense on a line that is already overspent', () => {
    expect(() => planExpense({ remainingCentavos: -1_000, amountCentavos: 100 })).toThrow(HttpError)
    expect(lineShortfall(-1_000, 100)).toBe(1_100)
  })

  it('lets an explicit override through, keeping the reason', () => {
    const plan = planExpense({
      remainingCentavos: 20_000,
      amountCentavos: 25_000,
      override: true,
      overrideReason: 'The venue raised its fee after the budget was approved'
    })
    expect(plan.shortfallCentavos).toBe(5_000)
    expect(plan.overrideReason).toMatch(/venue raised its fee/)
  })

  it('refuses an override without a real reason (it is what the audit reads)', () => {
    expect(() => planExpense({ remainingCentavos: 0, amountCentavos: 100, override: true })).toThrow(/reason of at least 10 characters/)
    expect(() => planExpense({ remainingCentavos: 0, amountCentavos: 100, override: true, overrideReason: 'urgent' })).toThrow(HttpError)
  })

  it('records no override when the expense fits even if one was offered', () => {
    expect(planExpense({ remainingCentavos: 10_000, amountCentavos: 100, override: true }).overrideReason).toBeNull()
  })
})

describe('the proposal state machine (§8.7)', () => {
  it('starts at "decided" and walks the diagram', () => {
    expect(proposalStatus(['decided'])).toBe('decided')
    expect(proposalStatus(['decided', 'noted_president'])).toBe('decided')
    expect(proposalStatus(['decided', ...allNotes])).toBe('noted')
    expect(proposalStatus(['decided', ...allNotes, 'approved'])).toBe('approved')
    expect(proposalStatus(['decided', ...allNotes, 'approved', 'released'])).toBe('released')
    expect(proposalStatus(['decided', ...allNotes, 'approved', 'released', 'liquidated'])).toBe('liquidated')
    expect(proposalStatus(['decided', 'rejected'])).toBe('rejected')
  })

  it('cannot reach "approved" without every noted step — for every subset of the notes', () => {
    for (const notes of noteSubsets()) {
      const steps = ['decided', ...notes]
      const reason = stepBlockedReason(steps, 'approved')
      if (notes.length === NOTE_SIGNATORIES.length) {
        expect(reason).toBeNull()
      } else {
        expect(reason, `approved with notes ${JSON.stringify(notes)}`).toMatch(/cannot be approved yet/)
        expect(nextSteps(steps)).not.toContain('approved')
        // …and the missing parties are named, so the Treasurer knows who to chase.
        for (const missing of missingNoteSignatories(steps)) {
          expect(reason).toContain(SIGNATORY_LABELS[missing])
        }
      }
    }
  })

  it('names exactly the signatories still to note', () => {
    expect(missingNoteSignatories(['decided'])).toEqual(['president', 'adviser', 'university_accountant'])
    expect(missingNoteSignatories(['decided', 'noted_adviser'])).toEqual(['president', 'university_accountant'])
    expect(missingNoteSignatories(['decided', ...allNotes])).toEqual([])
  })

  it('will not skip a note even when its own step is attempted twice', () => {
    const steps = ['decided', 'noted_president', ...allNotes.slice(1), 'approved']
    expect(stepBlockedReason(steps, 'noted_president')).toMatch(/already noted/)
    expect(stepBlockedReason(steps, 'approved')).toMatch(/already approved/)
  })

  it('refuses a note that arrives after approval', () => {
    const steps = ['decided', 'noted_president', 'noted_adviser', 'approved']
    expect(stepBlockedReason(steps, 'noted_university_accountant')).toMatch(/already approved/)
  })

  it('release waits for approval, liquidation waits for release', () => {
    expect(stepBlockedReason(['decided'], 'released')).toMatch(/before the Campus Administrator approves/)
    expect(stepBlockedReason(['decided', ...allNotes, 'approved'], 'released')).toBeNull()
    expect(stepBlockedReason(['decided', ...allNotes], 'liquidated')).toMatch(/before its release/)
    expect(stepBlockedReason(['decided', ...allNotes, 'approved', 'released'], 'liquidated')).toBeNull()
  })

  it('cannot release, liquidate or reject a rejected proposal', () => {
    for (const step of PROPOSAL_STEPS) {
      if (step === 'decided') continue
      expect(stepBlockedReason(['decided', 'rejected'], step)).toMatch(/was rejected/)
    }
  })

  it('treats release as the point of no return', () => {
    const released = ['decided', 'noted_president', 'noted_adviser', 'approved', 'released']
    expect(stepBlockedReason(released, 'rejected')).toMatch(/already released/)
    expect(stepBlockedReason(released, 'noted_university_accountant')).toMatch(/already approved/)
    expect(stepBlockedReason([...released, 'liquidated'], 'released')).toMatch(/already liquidated/)
    expect(nextSteps(released)).toEqual(['liquidated'])
  })

  it('lists what can happen next, in order, and never "decided"', () => {
    expect(nextSteps(['decided'])).toEqual(allNotes)
    expect(nextSteps(['decided', ...allNotes])).toEqual(['approved'])
    expect(nextSteps(['decided', ...allNotes, 'approved'])).toEqual(['released'])
    expect(nextSteps(['decided', ...allNotes, 'approved', 'released'])).toEqual(['liquidated'])
    expect(nextSteps(['decided', 'rejected'])).toEqual([])
  })

  it('marks the University Accountant and the Campus Administrator as external signatories', () => {
    expect(EXTERNAL_STEPS).toContain('noted_university_accountant')
    expect(EXTERNAL_STEPS).toContain('approved')
    expect(EXTERNAL_STEPS).not.toContain('noted_president')
  })

  it('refuses an unknown step name', () => {
    expect(stepBlockedReason(['decided'], 'noted_the_pope' as never)).toMatch(/Unknown step/)
  })
})

describe('liquidation', () => {
  const entries = [
    { kind: 'expense', amountCentavos: 12_500, description: 'Tarp printing', spentAt: new Date('2026-11-02T02:00:00Z'), lineName: 'Events', receiptName: 'tarp.jpg', receiptKey: 'finance/receipt/a.png' },
    { kind: 'expense', amountCentavos: 3_000, description: 'Tricycle fare', spentAt: new Date('2026-11-02T03:00:00Z'), lineName: 'Travel', receiptName: null, receiptKey: null },
    { kind: 'income', amountCentavos: 1_000, description: 'Sticker sales', spentAt: new Date('2026-11-03T02:00:00Z'), lineName: 'Events', receiptName: null, receiptKey: null }
  ]

  it('refuses to liquidate while an expense has no receipt', () => {
    expect(entriesMissingReceipt(entries)).toBe(1)
    expect(liquidationBlockedReason(entries)).toMatch(/1 expense.*no receipt/)
    expect(liquidationBlockedReason([entries[0]!])).toBeNull()
    expect(liquidationBlockedReason([])).toBeNull()
  })

  it('ties the approvals, the expenses and the lines together', () => {
    const model = liquidationModel({
      proposal: {
        id: 'prop-1',
        title: 'Pag-abi-abi 2026',
        description: 'Sound system and tarps',
        amountCentavos: 20_000,
        status: 'released',
        projectName: null
      },
      event: { title: 'Pag-abi-abi', date: new Date('2026-11-02T01:00:00Z') },
      line: { name: 'Events', allocatedCentavos: 100_000 },
      steps: [
        { step: 'decided', actedAt: new Date('2026-10-01T02:00:00Z'), note: 'Minutes 2026-10-01 item 4', actorName: 'Treasurer' },
        { step: 'noted_university_accountant', actedAt: new Date('2026-10-05T02:00:00Z'), signatoryName: 'A. Cruz', signatoryRole: 'University Accountant', hasAttachment: true, actorName: 'Treasurer' },
        { step: 'approved', actedAt: new Date('2026-10-08T02:00:00Z'), signatoryName: 'B. Reyes', signatoryRole: 'Campus Administrator', hasAttachment: true },
        { step: 'released', actedAt: new Date('2026-10-09T02:00:00Z'), note: 'Voucher 2026-014', actorName: 'Treasurer' }
      ],
      entries,
      lines: [
        { name: 'Events', allocatedCentavos: 100_000, incomeCentavos: 1_000, expenseCentavos: 12_500, remainingCentavos: 88_500 }
      ],
      preparedBy: 'Chene Manderico',
      generatedAt: new Date('2026-11-10T01:05:00Z')
    })

    expect(model.title).toContain('Pag-abi-abi 2026')
    expect(model.stem).toBe('liquidation-Pag-abi-abi-2026')

    // The approval trail names the external signatories and their signed copies.
    const trail = model.sections[0]!
    expect(trail.rows).toHaveLength(4)
    expect(trail.rows[1]!.join(' | ')).toContain('A. Cruz (University Accountant)')
    expect(trail.rows[1]!.join(' | ')).toContain('signed copy on file')

    // The money section: one row per entry, the receipt called out, the total
    // equal to the sum of the expenses (which is what "reconcile" means).
    const money = model.sections[1]!
    expect(money.rows).toHaveLength(3)
    expect(money.rows[0]!.join(' | ')).toContain('tarp.jpg')
    expect(money.rows[1]!.join(' | ')).toContain('NO RECEIPT')
    expect(money.totals![4]).toBe('₱155.00')
    expect(money.totals![5]).toBe('income ₱10.00')

    // The reconciliation note ties the approved amount to what was spent.
    const notes = model.notes!.join(' · ')
    expect(notes).toContain('Proposed ₱200.00')
    expect(notes).toContain('Spent ₱155.00')
    expect(notes).toContain('Variance ₱45.00')
    expect(notes).toContain('underspent')
    expect(notes).toContain('1 of 2 expense(s)')

    // Line totals come from the same helper the UI uses.
    expect(model.sections[2]!.rows[0]).toEqual(['Events', '₱1,000.00', '₱125.00', '₱10.00', '₱885.00'])
  })

  it('says when the proposal was overspent or exactly liquidated', () => {
    const base = {
      proposal: { id: 'p', title: 'X', description: 'd', amountCentavos: 100, status: 'liquidated', projectName: null },
      event: null,
      line: null,
      steps: [],
      lines: [],
      preparedBy: 'T',
      generatedAt: new Date('2026-11-10T01:05:00Z')
    }
    const exact = liquidationModel({ ...base, entries: [{ kind: 'expense', amountCentavos: 100, description: 'x', spentAt: new Date(), lineName: 'L', receiptKey: 'k' }] })
    expect(exact.notes!.join(' ')).toContain('fully liquidated')

    const over = liquidationModel({ ...base, entries: [{ kind: 'expense', amountCentavos: 150, description: 'x', spentAt: new Date(), lineName: 'L', receiptKey: 'k' }] })
    expect(over.notes!.join(' ')).toContain('overspent')
  })

  it('counts proposals per status for the public summary', () => {
    expect(statusCounts(['released', 'released', 'decided'])).toEqual({ released: 2, decided: 1 })
    expect(statusCounts([])).toEqual({})
  })
})

describe('capability guards', () => {
  it('lets the Treasurer, the noters and the Auditor read', () => {
    expect(() => requireFinanceReader({ capabilities: ['finance.manage'] })).not.toThrow()
    expect(() => requireFinanceReader({ capabilities: ['finance.note'] })).not.toThrow()
    expect(() => requireFinanceReader({ capabilities: ['finance.audit'] })).not.toThrow()
    expect(() => requireFinanceReader({ capabilities: ['admin.all'] })).not.toThrow()
  })

  it('keeps everyone else out, and only the manager writes', () => {
    for (const capabilities of [[], ['staff.access'], ['attendance.roster']]) {
      expect(() => requireFinanceReader({ capabilities })).toThrow(HttpError)
    }
    expect(() => requireFinanceManager({ capabilities: ['finance.audit'] })).toThrow(/finance.manage/)
    expect(() => requireFinanceManager({ capabilities: ['finance.note'] })).toThrow(HttpError)
    expect(() => requireFinanceManager({ capabilities: ['finance.manage'] })).not.toThrow()
  })
})
