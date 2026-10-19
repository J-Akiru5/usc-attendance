import { formatPeso } from './fines'
import { badRequest, HttpError } from './http'
import { requireAnyCapability, requireCapability, type Capability } from './rbac'
import type { TableReportModel } from './report'
import { manilaStamp } from './time'

/**
 * Finance, budget & liquidation (plan §8.7). Everything here is pure: the
 * proposal state machine, the money arithmetic and the shapes handed to the
 * routes and to the liquidation report, so all of it is unit-tested without a
 * database.
 *
 * Money is always an integer number of **centavos** (see `formatPeso`), never a
 * float. A line's remaining budget is `allocated + income − expenses`; an
 * expense may only pass it with an explicit, audited override.
 */

// ---------------------------------------------------------------------------
// Capabilities (plan §7.2: Treasurer requests, President/Adviser note, Auditor
// reads; the University Accountant and Campus Administrator stay external)
// ---------------------------------------------------------------------------

export const FINANCE_READ_CAPABILITIES: readonly Capability[] = ['finance.manage', 'finance.note', 'finance.audit']

/** Anything finance touches: the Treasurer, the noters and the Auditor. */
export function requireFinanceReader(actor: { capabilities?: readonly string[] }): void {
  requireAnyCapability(actor, FINANCE_READ_CAPABILITIES)
}

/** Writing the budget, holding the money, recording external steps, releases. */
export function requireFinanceManager(actor: { capabilities?: readonly string[] }): void {
  requireCapability(actor, 'finance.manage')
}

// ---------------------------------------------------------------------------
// The proposal state machine
// ---------------------------------------------------------------------------

/**
 * The three "noted by" parties (plan §8.7). The University Accountant has no
 * account: the Treasurer records that step with the signing date and the signed
 * copy. The order in which the three notes arrive is not fixed.
 */
export const NOTE_SIGNATORIES = ['president', 'adviser', 'university_accountant'] as const
export type NoteSignatory = (typeof NOTE_SIGNATORIES)[number]

export const SIGNATORY_LABELS: Record<NoteSignatory | 'campus_administrator', string> = {
  president: 'President',
  adviser: 'Adviser',
  university_accountant: 'University Accountant',
  campus_administrator: 'Campus Administrator'
}

/** The step a signatory's note is recorded under. */
export const NOTE_STEPS: Record<NoteSignatory, string> = {
  president: 'noted_president',
  adviser: 'noted_adviser',
  university_accountant: 'noted_university_accountant'
}

export const PROPOSAL_STEPS = [
  'decided',
  'noted_president',
  'noted_adviser',
  'noted_university_accountant',
  'approved',
  'released',
  'liquidated',
  'rejected'
] as const
export type ProposalStep = (typeof PROPOSAL_STEPS)[number]

export const STEP_LABELS: Record<ProposalStep, string> = {
  decided: 'Decided by the body',
  noted_president: 'Noted by the President',
  noted_adviser: 'Noted by the Adviser',
  noted_university_accountant: 'Noted by the University Accountant',
  approved: 'Approved by the Campus Administrator',
  released: 'Released',
  liquidated: 'Liquidated',
  rejected: 'Rejected by the body'
}

/** Steps signed by someone without an account: the Treasurer records them. */
export const EXTERNAL_STEPS: readonly ProposalStep[] = ['noted_university_accountant', 'approved']

export const PROPOSAL_STATUSES = ['decided', 'noted', 'approved', 'released', 'liquidated', 'rejected'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  decided: 'Decided by the body',
  noted: 'Noted — awaiting approval',
  approved: 'Approved by the Campus Administrator',
  released: 'Released',
  liquidated: 'Liquidated',
  rejected: 'Rejected'
}

/** The step names a proposal currently has, in the order they happened. */
export function hasStep(steps: readonly string[], step: ProposalStep): boolean {
  return steps.includes(step)
}

export function parseStep(input: unknown): ProposalStep {
  const step = String(input ?? '')
  if (!(PROPOSAL_STEPS as readonly string[]).includes(step)) {
    throw badRequest(`step must be one of ${PROPOSAL_STEPS.join(', ')}`)
  }
  return step as ProposalStep
}

/** Which of the three notes the proposal is still waiting for. */
export function missingNoteSignatories(steps: readonly string[]): NoteSignatory[] {
  return NOTE_SIGNATORIES.filter(signatory => !hasStep(steps, noteStep(signatory) as ProposalStep))
}

export function noteStep(signatory: NoteSignatory): string {
  return NOTE_STEPS[signatory]
}

/**
 * Where the proposal stands, derived from its steps — never stored as a guess.
 * "approved" means every noted step exists, because the only way in is through
 * `stepBlockedReason`, which refuses approval while any is missing.
 */
export function proposalStatus(steps: readonly string[]): ProposalStatus {
  if (hasStep(steps, 'rejected')) return 'rejected'
  if (hasStep(steps, 'liquidated')) return 'liquidated'
  if (hasStep(steps, 'released')) return 'released'
  if (hasStep(steps, 'approved')) return 'approved'
  if (missingNoteSignatories(steps).length === 0) return 'noted'
  return 'decided'
}

/** Why a step cannot be recorded right now, or null when it can. */
export function stepBlockedReason(steps: readonly string[], step: ProposalStep): string | null {
  if (hasStep(steps, 'rejected')) {
    return 'This proposal was rejected by the body — nothing further can be recorded against it'
  }
  if (hasStep(steps, 'liquidated')) {
    return 'This proposal is already liquidated'
  }

  switch (step) {
    case 'decided':
      return hasStep(steps, 'decided') ? 'This proposal is already on the record as decided' : null

    case 'noted_president':
    case 'noted_adviser':
    case 'noted_university_accountant': {
      const label = STEP_LABELS[step].replace('Noted by the ', '')
      if (hasStep(steps, step)) return `${label} has already noted this proposal`
      if (hasStep(steps, 'approved')) return 'This proposal is already approved — notes can no longer be added'
      return null
    }

    case 'approved': {
      if (hasStep(steps, 'approved')) return 'This proposal is already approved'
      const missing = missingNoteSignatories(steps)
      if (missing.length > 0) {
        return `It cannot be approved yet: ${missing.map(s => SIGNATORY_LABELS[s]).join(', ')} must note it first`
      }
      return null
    }

    case 'released': {
      if (hasStep(steps, 'released')) return 'This proposal is already released'
      if (!hasStep(steps, 'approved')) return 'It cannot be released before the Campus Administrator approves it'
      return null
    }

    case 'liquidated': {
      if (!hasStep(steps, 'released')) return 'It cannot be liquidated before its release'
      return null
    }

    case 'rejected': {
      if (hasStep(steps, 'released')) return 'The money is already released — record the liquidation instead of rejecting'
      if (hasStep(steps, 'approved')) return 'This proposal is already approved — the body would have to withdraw it in a resolution'
      return null
    }

    default:
      return 'Unknown step'
  }
}

/** The steps the council can record next, in the order the buttons should show. */
export function nextSteps(steps: readonly string[]): ProposalStep[] {
  // "rejected" is deliberately not advertised: it is an escape hatch the API
  // accepts while nothing has been released, shown as its own action in the UI
  // rather than as the next step of the diagram.
  return PROPOSAL_STEPS.filter(
    step => step !== 'decided' && step !== 'rejected' && stepBlockedReason(steps, step) === null
  )
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** ₱10,000,000 — far above any council budget, and a typo guard. */
export const MAX_CENTAVOS = 1_000_000_000

export interface MoneyRow {
  kind: string
  amountCentavos: number
  receiptKey?: string | null
}

export interface LineTotals {
  incomeCentavos: number
  expenseCentavos: number
  remainingCentavos: number
}

export const LINE_CATEGORIES = ['supplies', 'events', 'travel', 'communication', 'other'] as const
export type LineCategory = (typeof LINE_CATEGORIES)[number]

export const INCOME_SOURCES = ['fines', 'fees', 'donation', 'other'] as const
export type IncomeSource = (typeof INCOME_SOURCES)[number]

export function parseCentavos(input: unknown, label: string, options: { allowZero?: boolean } = {}): number {
  const value = Number(input)
  if (!Number.isInteger(value) || value < 0 || value > MAX_CENTAVOS) {
    throw badRequest(`${label} must be a whole number of centavos between 0 and ${MAX_CENTAVOS}`)
  }
  if (!options.allowZero && value === 0) throw badRequest(`${label} must be more than zero`)
  return value
}

export function requireText(input: unknown, label: string, min = 2, max = 500): string {
  const value = String(input ?? '').trim()
  if (value.length < min || value.length > max) {
    throw badRequest(`${label} must be between ${min} and ${max} characters`)
  }
  return value
}

export function optionalText(input: unknown, label: string, max = 2000): string | null {
  if (input === undefined || input === null || input === '') return null
  const value = String(input).trim()
  if (value.length > max) throw badRequest(`${label} must be at most ${max} characters`)
  return value.length > 0 ? value : null
}

/** A date the caller sent ("2026-11-02" or an ISO instant); defaults to now. */
export function parseDate(input: unknown, label: string, fallback: Date = new Date()): Date {
  if (input === undefined || input === null || input === '') return fallback
  const date = new Date(String(input))
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} is not a valid date`)
  return date
}

export function parseEnum<T extends string>(input: unknown, allowed: readonly T[], label: string, fallback?: T): T {
  const value = String(input ?? fallback ?? '')
  if (!(allowed as readonly string[]).includes(value)) {
    throw badRequest(`${label} must be one of ${allowed.join(', ')}`)
  }
  return value as T
}

/** What a line has taken in, paid out, and has left. */
export function lineTotals(allocatedCentavos: number, entries: readonly MoneyRow[]): LineTotals {
  let incomeCentavos = 0
  let expenseCentavos = 0
  for (const entry of entries) {
    if (entry.kind === 'income') incomeCentavos += entry.amountCentavos
    else expenseCentavos += entry.amountCentavos
  }
  return {
    incomeCentavos,
    expenseCentavos,
    remainingCentavos: allocatedCentavos + incomeCentavos - expenseCentavos
  }
}

export interface BudgetTotals extends LineTotals {
  allocatedCentavos: number
}

export function budgetTotals(lines: ReadonlyArray<{ allocatedCentavos: number, entries: readonly MoneyRow[] }>): BudgetTotals {
  let allocatedCentavos = 0
  let incomeCentavos = 0
  let expenseCentavos = 0
  for (const line of lines) {
    const totals = lineTotals(line.allocatedCentavos, line.entries)
    allocatedCentavos += line.allocatedCentavos
    incomeCentavos += totals.incomeCentavos
    expenseCentavos += totals.expenseCentavos
  }
  return {
    allocatedCentavos,
    incomeCentavos,
    expenseCentavos,
    remainingCentavos: allocatedCentavos + incomeCentavos - expenseCentavos
  }
}

/** How far past the line's remaining budget an expense goes (0 when it fits). */
export function lineShortfall(remainingCentavos: number, amountCentavos: number): number {
  return Math.max(0, amountCentavos - remainingCentavos)
}

/**
 * The acceptance rule of §8.7: an expense may not exceed what is left on the
 * line. The only way through is an explicit override — `override: true` plus a
 * reason — which the route audits with the numbers that made it necessary.
 *
 * Throws 409 when the line is short and no override was asked for, and 400 when
 * an override was asked for without a reason.
 */
export function planExpense(input: {
  remainingCentavos: number
  amountCentavos: number
  override?: unknown
  overrideReason?: unknown
}): { overrideReason: string | null, shortfallCentavos: number } {
  const shortfall = lineShortfall(input.remainingCentavos, input.amountCentavos)
  if (shortfall === 0) {
    return { overrideReason: input.override === true ? optionalText(input.overrideReason, 'The override reason', 500) : null, shortfallCentavos: 0 }
  }

  if (input.override !== true) {
    throw new HttpError(
      409,
      `That expense is ${formatPeso(shortfall)} more than the line has left (remaining ${formatPeso(input.remainingCentavos)}). `
      + 'Record a smaller amount, or override the line with a reason.'
    )
  }

  const reason = optionalText(input.overrideReason, 'The override reason', 500)
  if (!reason || reason.length < 10) {
    throw badRequest('An override needs a reason of at least 10 characters (it is kept in the audit trail)')
  }
  return { overrideReason: reason, shortfallCentavos: shortfall }
}

/** Expenses on a proposal that still have no receipt uploaded. */
export function entriesMissingReceipt(entries: readonly MoneyRow[]): number {
  return entries.filter(entry => entry.kind === 'expense' && !entry.receiptKey).length
}

/**
 * Liquidation (plan §8.7 diagram, last box): the money is accounted for when
 * every expense has its receipt and the report's totals reconcile with them.
 * The step is refused while anything is missing.
 */
export function liquidationBlockedReason(entries: readonly MoneyRow[]): string | null {
  const missing = entriesMissingReceipt(entries)
  if (missing > 0) {
    return `${missing} expense${missing === 1 ? '' : 's'} on this proposal still ${missing === 1 ? 'has' : 'have'} no receipt — upload ${missing === 1 ? 'it' : 'them'} before liquidating`
  }
  return null
}

// ---------------------------------------------------------------------------
// The liquidation report (rendered by server/utils/report.ts)
// ---------------------------------------------------------------------------

export interface LiquidationStep {
  step: string
  actedAt: Date
  /** The officer who recorded it (the Treasurer for external signatories). */
  actorName?: string | null
  signatoryName?: string | null
  signatoryRole?: string | null
  note?: string | null
  hasAttachment?: boolean
}

export interface LiquidationEntry {
  kind: string
  amountCentavos: number
  description: string
  spentAt: Date
  lineName: string
  receiptName?: string | null
  receiptKey?: string | null
}

export interface LiquidationLine {
  name: string
  allocatedCentavos: number
  incomeCentavos: number
  expenseCentavos: number
  remainingCentavos: number
}

export interface LiquidationInput {
  proposal: {
    id: string
    title: string
    description: string
    /** What the body approved. */
    amountCentavos: number
    status: string
    projectName?: string | null
  }
  event?: { title: string, date: Date } | null
  line?: { name: string, allocatedCentavos: number } | null
  steps: LiquidationStep[]
  entries: LiquidationEntry[]
  lines: LiquidationLine[]
  preparedBy: string
  generatedAt?: Date
}

const peso = (centavos: number) => formatPeso(centavos)

/**
 * Builds the liquidation document: the step history (who did what, when), the
 * expenses with their receipts, the line totals, and the reconciliation line
 * that ties the two together. Pure — the route only renders it.
 */
export function liquidationModel(input: LiquidationInput): TableReportModel {
  const generatedAt = input.generatedAt ?? new Date()
  const spentCentavos = input.entries.filter(e => e.kind === 'expense').reduce((sum, e) => sum + e.amountCentavos, 0)
  const receivedCentavos = input.entries.filter(e => e.kind === 'income').reduce((sum, e) => sum + e.amountCentavos, 0)
  const variance = input.proposal.amountCentavos - spentCentavos

  const stepRows = [...input.steps]
    .sort((a, b) => a.actedAt.getTime() - b.actedAt.getTime())
    .map(step => [
      STEP_LABELS[step.step as ProposalStep] ?? step.step,
      step.signatoryName
        ? `${step.signatoryName}${step.signatoryRole ? ` (${step.signatoryRole})` : ''}`
        : (step.actorName ?? '—'),
      manilaStamp(step.actedAt),
      step.hasAttachment ? 'signed copy on file' : '—',
      step.note ?? ''
    ])

  const entryRows = [...input.entries]
    .sort((a, b) => a.spentAt.getTime() - b.spentAt.getTime())
    .map(entry => [
      manilaStamp(entry.spentAt).slice(0, 10),
      entry.kind === 'income' ? 'Income' : 'Expense',
      entry.description,
      entry.lineName,
      peso(entry.amountCentavos),
      entry.receiptKey ? (entry.receiptName ?? 'receipt on file') : (entry.kind === 'income' ? '—' : 'NO RECEIPT')
    ])

  const lineRows = input.lines.map(line => [
    line.name,
    peso(line.allocatedCentavos),
    peso(line.expenseCentavos),
    peso(line.incomeCentavos),
    peso(line.remainingCentavos)
  ])

  const notes = [
    `Proposed ${peso(input.proposal.amountCentavos)} · Spent ${peso(spentCentavos)} · `
    + `Variance ${peso(variance)} (${variance === 0 ? 'fully liquidated' : variance > 0 ? 'underspent' : 'overspent'})`,
    `Receipts on file: ${input.entries.filter(e => e.kind === 'expense' && e.receiptKey).length} of ${input.entries.filter(e => e.kind === 'expense').length} expense(s)`,
    `Prepared by ${input.preparedBy}`
  ]

  return {
    title: `Liquidation report — ${input.proposal.title}`,
    subtitle: input.event
      ? `Event: ${input.event.title} (${manilaStamp(input.event.date).slice(0, 10)})`
      : input.proposal.projectName
        ? `Project: ${input.proposal.projectName}`
        : 'Council project',
    meta: [
      `Status: ${STATUS_LABELS[input.proposal.status as ProposalStatus] ?? input.proposal.status}`,
      input.line ? `Budget line: ${input.line.name} (allocated ${peso(input.line.allocatedCentavos)})` : 'Budget line: unassigned',
      `Proposal ${input.proposal.id}`
    ],
    sections: [
      {
        heading: 'Approval trail',
        columns: [
          { label: 'Step', width: 190 },
          { label: 'Signatory / recorded by', width: 150 },
          { label: 'When (Asia/Manila)', width: 110 },
          { label: 'Signed copy', width: 110 },
          { label: 'Note', width: 140 }
        ],
        rows: stepRows
      },
      {
        heading: 'Expenses, income and receipts',
        columns: [
          { label: 'Date', width: 70 },
          { label: 'Kind', width: 60 },
          { label: 'Description', width: 200 },
          { label: 'Line', width: 130 },
          { label: 'Amount', width: 90, align: 'right' },
          { label: 'Receipt', width: 150 }
        ],
        rows: entryRows,
        totals: ['', '', 'Total expenses', '', peso(spentCentavos), receivedCentavos ? `income ${peso(receivedCentavos)}` : '']
      },
      {
        heading: 'Budget lines involved',
        columns: [
          { label: 'Line', width: 200 },
          { label: 'Allocated', width: 110, align: 'right' },
          { label: 'Expenses', width: 110, align: 'right' },
          { label: 'Income', width: 110, align: 'right' },
          { label: 'Remaining', width: 110, align: 'right' }
        ],
        rows: lineRows
      }
    ],
    notes,
    generatedAt: manilaStamp(generatedAt),
    generatedBy: input.preparedBy,
    stem: `liquidation-${slug(input.proposal.title)}`
  }
}

/** Filename-safe slug. */
export function slug(text: string, fallback = 'report'): string {
  const cleaned = text.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || fallback
}

/** The peso total of a set of entries, for the totals a route returns. */
export function totalsOf(entries: readonly MoneyRow[]): { incomeCentavos: number, expenseCentavos: number, netCentavos: number } {
  const incomeCentavos = entries.filter(e => e.kind === 'income').reduce((sum, e) => sum + e.amountCentavos, 0)
  const expenseCentavos = entries.filter(e => e.kind === 'expense').reduce((sum, e) => sum + e.amountCentavos, 0)
  return { incomeCentavos, expenseCentavos, netCentavos: incomeCentavos - expenseCentavos }
}

/** How many proposals sit in each status — the only proposal figure the public
 * summary board shows. */
export function statusCounts(statuses: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const status of statuses) counts[status] = (counts[status] ?? 0) + 1
  return counts
}
