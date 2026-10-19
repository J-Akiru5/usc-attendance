import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { manilaStamp } from './time'

export type ReportFormat = 'csv' | 'xlsx' | 'pdf'

export interface ReportRow {
  no: number
  name: string
  position: string
  timeIn: string
  timeOut: string
  method: string
  recordedBy: string
  location: string
  /** Short reference printed in CSV and next to the image in PDF/Excel. */
  signatureRef: string | null
  /** PNG bytes of the drawn signature, embedded in PDF and Excel. */
  signaturePng: Uint8Array | null
  /** The signature was captured but its image has been deleted under the retention rule. */
  signatureExpired?: boolean
}

export interface ReportModel {
  title: string
  eventDate: string
  venue: string
  generatedAt: string
  generatedBy: string
  rows: ReportRow[]
}

export const REPORT_COLUMNS = [
  'No.',
  'Name',
  'Position',
  'Time In',
  'Time Out',
  'Method',
  'Recorded By',
  'Location',
  'E-Signature'
] as const

export const CONTENT_TYPES: Record<ReportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf'
}

export function parseFormat(input: unknown): ReportFormat | null {
  if (input === undefined || input === null || input === '') return 'csv'
  return input === 'csv' || input === 'xlsx' || input === 'pdf' ? input : null
}

/** "2026-11-10 14:05:09" in Asia/Manila. */
export function formatManila(d: Date): string {
  return manilaStamp(d, true)
}

/** Filename-safe slug of the event title. */
export function fileStem(title: string): string {
  const slug = title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'attendance'}-attendance`
}

/**
 * Neutralise spreadsheet formula injection: a cell that starts with = + - @ (or
 * tab / CR) is prefixed with an apostrophe so Excel/Sheets treat it as text.
 */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function rowValues(r: ReportRow): string[] {
  return [
    String(r.no),
    r.name,
    r.position,
    r.timeIn,
    r.timeOut,
    r.method,
    r.recordedBy,
    r.location,
    r.signatureRef ?? ''
  ]
}

// ---------------------------------------------------------------------------
// CSV  (cannot hold images; the e-signature column carries the reference)
// ---------------------------------------------------------------------------
function csvField(value: string): string {
  const v = safeCell(value)
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function buildCsv(model: ReportModel): string {
  const lines = [
    [...REPORT_COLUMNS].map(csvField).join(','),
    ...model.rows.map(r => rowValues(r).map(csvField).join(','))
  ]
  // BOM so Excel opens UTF-8 names (e.g. "Aquiño") correctly.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Excel  (signature images embedded in the E-Signature column)
// ---------------------------------------------------------------------------
export async function buildXlsx(model: ReportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = model.generatedBy
  wb.created = new Date()
  const ws = wb.addWorksheet('Attendance', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  })

  const widths = [6, 28, 22, 20, 20, 10, 22, 22, 22]
  ws.columns = widths.map(width => ({ width }))

  ws.mergeCells('A1:I1')
  ws.getCell('A1').value = safeCell(model.title)
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.mergeCells('A2:I2')
  ws.getCell('A2').value = `${model.eventDate}${model.venue ? ' · ' + model.venue : ''}`
  ws.mergeCells('A3:I3')
  ws.getCell('A3').value = `Generated ${model.generatedAt} by ${model.generatedBy} · ${model.rows.length} record(s)`
  ws.getCell('A3').font = { color: { argb: 'FF666666' }, size: 9 }

  const header = ws.getRow(5)
  header.values = [...REPORT_COLUMNS]
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } }
  header.alignment = { vertical: 'middle' }
  header.height = 22

  const SIG_COL = REPORT_COLUMNS.length - 1 // zero-based column index of E-Signature
  model.rows.forEach((r, i) => {
    const rowNumber = 6 + i
    const row = ws.getRow(rowNumber)
    const values = rowValues(r).map(safeCell)
    if (r.signatureExpired && r.signatureRef) values[values.length - 1] = `${r.signatureRef} (image removed)`
    // The reference is shown under the image; with no image it is the cell value.
    row.values = values
    row.alignment = { vertical: 'middle', wrapText: true }
    row.height = r.signaturePng ? 42 : 20
    if (r.signaturePng) {
      const imageId = wb.addImage({ buffer: Buffer.from(r.signaturePng) as unknown as ExcelJS.Buffer, extension: 'png' })
      ws.addImage(imageId, {
        tl: { col: SIG_COL + 0.05, row: rowNumber - 1 + 0.08 },
        ext: { width: 120, height: 36 },
        editAs: 'oneCell'
      })
      row.getCell(SIG_COL + 1).value = '' // image sits in the cell; ref stays in the PDF/CSV
    }
  })

  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ---------------------------------------------------------------------------
// PDF  (landscape A4, paginated table with embedded signatures)
// ---------------------------------------------------------------------------
const PAGE_W = 842
const PAGE_H = 595
const MARGIN = 28
const ROW_H = 30
const COL_W = [26, 130, 104, 82, 82, 46, 100, 86, 100] // sums to 756 = PAGE_W - 2*MARGIN

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  // pdf-lib standard fonts only encode WinAnsi; drop anything else instead of throwing.
  let t = text.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?')
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > maxWidth) t = t.slice(0, -1)
  return t + '...'
}

export async function buildPdf(model: ReportModel): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(model.title)
  pdf.setAuthor(model.generatedBy)
  pdf.setCreationDate(new Date())
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.106, 0.165, 0.29)

  let page: PDFPage
  let y = 0
  const total = () => pdf.getPageCount()

  const drawHeader = () => {
    // table header row
    page.drawRectangle({ x: MARGIN, y: y - 20, width: PAGE_W - 2 * MARGIN, height: 20, color: navy })
    let x = MARGIN
    REPORT_COLUMNS.forEach((c, i) => {
      page.drawText(c, { x: x + 4, y: y - 14, size: 8, font: bold, color: rgb(1, 1, 1) })
      x += COL_W[i] ?? 0
    })
    y -= 20
  }

  const newPage = (first: boolean) => {
    page = pdf.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - MARGIN
    if (first) {
      page.drawText(fit(model.title, bold, 16, PAGE_W - 2 * MARGIN), { x: MARGIN, y: y - 14, size: 16, font: bold, color: navy })
      y -= 30
      const sub = `${model.eventDate}${model.venue ? '  |  ' + model.venue : ''}`
      page.drawText(fit(sub, font, 10, PAGE_W - 2 * MARGIN), { x: MARGIN, y: y - 8, size: 10, font, color: rgb(0.3, 0.3, 0.3) })
      y -= 24
    } else {
      page.drawText(fit(model.title + ' (continued)', font, 9, PAGE_W - 2 * MARGIN), { x: MARGIN, y: y - 9, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
      y -= 20
    }
    drawHeader()
  }

  newPage(true)

  if (model.rows.length === 0) {
    page!.drawText('No attendance records.', { x: MARGIN + 4, y: y - 20, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 30
  }

  for (let idx = 0; idx < model.rows.length; idx++) {
    const r = model.rows[idx]!
    if (y - ROW_H < MARGIN + 18) newPage(false)

    if (idx % 2 === 1) {
      page!.drawRectangle({ x: MARGIN, y: y - ROW_H, width: PAGE_W - 2 * MARGIN, height: ROW_H, color: rgb(0.96, 0.97, 0.98) })
    }
    const cells = rowValues(r)
    let x = MARGIN
    for (let i = 0; i < cells.length; i++) {
      const isSig = i === cells.length - 1
      if (isSig) {
        if (r.signaturePng) {
          try {
            const img = await pdf.embedPng(r.signaturePng)
            const maxW = (COL_W[i] ?? 0) - 8
            const maxH = ROW_H - 6
            const scale = Math.min(maxW / img.width, maxH / img.height, 1)
            page!.drawImage(img, { x: x + 4, y: y - ROW_H + 3, width: img.width * scale, height: img.height * scale })
          } catch {
            page!.drawText('(unreadable)', { x: x + 4, y: y - 18, size: 7, font, color: rgb(0.7, 0.2, 0.2) })
          }
        } else if (r.signatureExpired) {
          page!.drawText('image removed', { x: x + 4, y: y - 14, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
          page!.drawText(fit(r.signatureRef ?? '', font, 7, (COL_W[i] ?? 0) - 8), { x: x + 4, y: y - 24, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
        } else {
          page!.drawText('-', { x: x + 4, y: y - 18, size: 8, font, color: rgb(0.6, 0.6, 0.6) })
        }
      } else {
        page!.drawText(fit(cells[i] ?? '', font, 8, (COL_W[i] ?? 0) - 8), { x: x + 4, y: y - 18, size: 8, font, color: rgb(0.1, 0.1, 0.1) })
      }
      x += COL_W[i] ?? 0
    }
    page!.drawLine({ start: { x: MARGIN, y: y - ROW_H }, end: { x: PAGE_W - MARGIN, y: y - ROW_H }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) })
    y -= ROW_H
  }

  // Footer on every page
  const footer = `Generated ${model.generatedAt} by ${model.generatedBy}  |  ${model.rows.length} record(s)`
  pdf.getPages().forEach((p, i) => {
    p.drawText(fit(footer, font, 7, PAGE_W - 2 * MARGIN - 80), { x: MARGIN, y: 14, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
    const label = `Page ${i + 1} of ${total()}`
    p.drawText(label, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 7), y: 14, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
  })

  return Buffer.from(await pdf.save())
}

export async function buildReport(
  model: ReportModel,
  format: ReportFormat
): Promise<{ body: Buffer | string, contentType: string, extension: ReportFormat }> {
  if (format === 'csv') return { body: buildCsv(model), contentType: CONTENT_TYPES.csv, extension: 'csv' }
  if (format === 'xlsx') return { body: await buildXlsx(model), contentType: CONTENT_TYPES.xlsx, extension: 'xlsx' }
  return { body: await buildPdf(model), contentType: CONTENT_TYPES.pdf, extension: 'pdf' }
}

// ---------------------------------------------------------------------------
// Generic table reports (plan §8.7 liquidation, and anything else that is a set
// of tables rather than an attendance roster). Same formats, same CSV-safety and
// page furniture as the attendance report above; the caller describes columns
// and rows.
// ---------------------------------------------------------------------------

export interface TableColumn {
  label: string
  /** Column width in PDF points; the Excel width is derived from it. */
  width: number
  align?: 'left' | 'right'
}

export interface TableSection {
  heading?: string
  columns: TableColumn[]
  rows: string[][]
  /** Optional totals row, printed after the rows. */
  totals?: string[]
}

export interface TableReportModel {
  title: string
  subtitle?: string
  /** Extra context lines under the subtitle (period, status, …). */
  meta?: string[]
  sections: TableSection[]
  /** Signatory lines / footnotes at the end of the document. */
  notes?: string[]
  generatedAt: string
  generatedBy: string
  /** Filename stem, no extension. */
  stem: string
}

function normaliseRow(row: string[], width: number): string[] {
  const out = row.slice(0, width).map(cell => String(cell ?? ''))
  while (out.length < width) out.push('')
  return out
}

export function buildTableCsv(model: TableReportModel): string {
  const header = [model.title, model.subtitle].filter((part): part is string => !!part).map(csvField).join(' — ')
  const blocks: string[] = [[header, ...(model.meta ?? []).map(csvField)].join('\r\n')]

  for (const section of model.sections) {
    const lines: string[] = []
    if (section.heading) lines.push(csvField(section.heading))
    lines.push(section.columns.map(c => csvField(c.label)).join(','))
    for (const row of section.rows) lines.push(normaliseRow(row, section.columns.length).map(csvField).join(','))
    if (section.totals) lines.push(normaliseRow(section.totals, section.columns.length).map(csvField).join(','))
    blocks.push(lines.join('\r\n'))
  }
  if (model.notes?.length) blocks.push(model.notes.map(csvField).join('\r\n'))
  blocks.push(csvField(`Generated ${model.generatedAt} by ${model.generatedBy}`))

  // BOM so Excel opens UTF-8 text (names, "₱") correctly.
  return '﻿' + blocks.join('\r\n\r\n') + '\r\n'
}

export async function buildTableXlsx(model: TableReportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = model.generatedBy
  wb.created = new Date()

  const used = new Set<string>()
  model.sections.forEach((section, index) => {
    // Sheet names: unique, ≤ 31 chars, no characters Excel refuses.
    const base = (section.heading ?? `Table ${index + 1}`).replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || `Table ${index + 1}`
    let name = base
    let suffix = 2
    while (used.has(name)) name = `${base.slice(0, 27)} ${suffix++}`
    used.add(name)

    const ws = wb.addWorksheet(name, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    ws.columns = section.columns.map(c => ({ width: Math.max(10, Math.round(c.width / 6)) }))
    const width = section.columns.length

    const title = ws.addRow([safeCell(model.title)])
    title.font = { bold: true, size: 14 }
    if (model.subtitle) ws.addRow([safeCell(model.subtitle)]).font = { size: 10, color: { argb: 'FF444444' } }
    for (const meta of model.meta ?? []) ws.addRow([safeCell(meta)]).font = { size: 9, color: { argb: 'FF666666' } }
    ws.addRow([])

    const header = ws.addRow(section.columns.map(c => c.label))
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } }
    header.alignment = { vertical: 'middle' }
    header.height = 20

    for (const row of section.rows) {
      const added = ws.addRow(normaliseRow(row, width).map(safeCell))
      added.alignment = { vertical: 'middle', wrapText: true }
      section.columns.forEach((c, i) => {
        if (c.align === 'right') added.getCell(i + 1).alignment = { horizontal: 'right', vertical: 'middle' }
      })
    }

    if (section.totals) {
      const totals = ws.addRow(normaliseRow(section.totals, width).map(safeCell))
      totals.font = { bold: true }
      totals.border = { top: { style: 'thin', color: { argb: 'FF1B2A4A' } } }
    }
  })

  if (model.notes?.length || model.generatedAt) {
    const ws = wb.addWorksheet('Notes')
    ws.columns = [{ width: 100 }]
    for (const note of model.notes ?? []) ws.addRow([safeCell(note)])
    ws.addRow([])
    ws.addRow([`Generated ${model.generatedAt} by ${model.generatedBy}`])
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function buildTablePdf(model: TableReportModel): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(model.title)
  pdf.setAuthor(model.generatedBy)
  pdf.setCreationDate(new Date())
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.106, 0.165, 0.29)
  const grey = rgb(0.4, 0.4, 0.4)

  const MARGIN_X = 28
  const ROW_H = 18

  let page: PDFPage
  let y = 0

  const newPage = (first: boolean) => {
    page = pdf.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - MARGIN_X
    if (first) {
      page.drawText(fit(model.title, bold, 16, PAGE_W - 2 * MARGIN_X), { x: MARGIN_X, y: y - 14, size: 16, font: bold, color: navy })
      y -= 28
      if (model.subtitle) {
        page.drawText(fit(model.subtitle, font, 10, PAGE_W - 2 * MARGIN_X), { x: MARGIN_X, y: y - 8, size: 10, font, color: grey })
        y -= 16
      }
      for (const meta of model.meta ?? []) {
        page.drawText(fit(meta, font, 9, PAGE_W - 2 * MARGIN_X), { x: MARGIN_X, y: y - 7, size: 9, font, color: grey })
        y -= 13
      }
      y -= 6
    } else {
      page.drawText(fit(`${model.title} (continued)`, font, 9, PAGE_W - 2 * MARGIN_X), { x: MARGIN_X, y: y - 9, size: 9, font, color: grey })
      y -= 18
    }
  }

  newPage(true)

  for (const section of model.sections) {
    if (y - 40 < MARGIN_X) newPage(false)
    if (section.heading) {
      page!.drawText(fit(section.heading, bold, 11, PAGE_W - 2 * MARGIN_X), { x: MARGIN_X, y: y - 10, size: 11, font: bold, color: navy })
      y -= 20
    }

    const drawHeaderRow = () => {
      page!.drawRectangle({ x: MARGIN_X, y: y - ROW_H, width: PAGE_W - 2 * MARGIN_X, height: ROW_H, color: navy })
      let x = MARGIN_X
      section.columns.forEach((c) => {
        const label = fit(c.label, bold, 8, c.width - 8)
        const offset = c.align === 'right' ? c.width - 4 - bold.widthOfTextAtSize(label, 8) : 4
        page!.drawText(label, { x: x + offset, y: y - 13, size: 8, font: bold, color: rgb(1, 1, 1) })
        x += c.width
      })
      y -= ROW_H
    }
    drawHeaderRow()

    const drawRow = (cells: string[], emphasise: boolean) => {
      if (y - ROW_H < MARGIN_X + 18) {
        newPage(false)
        if (section.heading) {
          page!.drawText(fit(`${section.heading} (continued)`, bold, 9, PAGE_W - 2 * MARGIN_X), { x: MARGIN_X, y: y - 9, size: 9, font: bold, color: navy })
          y -= 18
        }
        drawHeaderRow()
      }
      let x = MARGIN_X
      const arm = emphasise ? bold : font
      section.columns.forEach((c, i) => {
        const raw = cells[i] ?? ''
        const text = fit(raw, arm, 8, c.width - 8)
        const offset = c.align === 'right' ? c.width - 4 - arm.widthOfTextAtSize(text, 8) : 4
        page!.drawText(text, { x: x + offset, y: y - 13, size: 8, font: arm, color: emphasise ? navy : rgb(0.1, 0.1, 0.1) })
        x += c.width
      })
      page!.drawLine({ start: { x: MARGIN_X, y: y - ROW_H }, end: { x: PAGE_W - MARGIN_X, y: y - ROW_H }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) })
      y -= ROW_H
    }

    if (section.rows.length === 0) {
      page!.drawText('No records.', { x: MARGIN_X + 4, y: y - 13, size: 9, font, color: grey })
      y -= ROW_H
    }
    for (const row of section.rows) drawRow(normaliseRow(row, section.columns.length), false)
    if (section.totals) drawRow(normaliseRow(section.totals, section.columns.length), true)
    y -= 14
  }

  if (model.notes?.length) {
    if (y - (model.notes.length + 2) * 13 < MARGIN_X) newPage(false)
    for (const note of model.notes) {
      page!.drawText(fit(note, font, 9, PAGE_W - 2 * MARGIN_X), { x: MARGIN_X, y: y - 8, size: 9, font, color: rgb(0.2, 0.2, 0.2) })
      y -= 13
    }
  }

  const footer = `Generated ${model.generatedAt} by ${model.generatedBy}`
  pdf.getPages().forEach((p, i) => {
    p.drawText(fit(footer, font, 7, PAGE_W - 2 * MARGIN_X - 80), { x: MARGIN_X, y: 14, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
    const label = `Page ${i + 1} of ${pdf.getPageCount()}`
    p.drawText(label, { x: PAGE_W - MARGIN_X - font.widthOfTextAtSize(label, 7), y: 14, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
  })

  return Buffer.from(await pdf.save())
}

export async function buildTableReport(
  model: TableReportModel,
  format: ReportFormat
): Promise<{ body: Buffer | string, contentType: string, extension: ReportFormat }> {
  if (format === 'csv') return { body: buildTableCsv(model), contentType: CONTENT_TYPES.csv, extension: 'csv' }
  if (format === 'xlsx') return { body: await buildTableXlsx(model), contentType: CONTENT_TYPES.xlsx, extension: 'xlsx' }
  return { body: await buildTablePdf(model), contentType: CONTENT_TYPES.pdf, extension: 'pdf' }
}
