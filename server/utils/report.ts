import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

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
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`
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
      x += COL_W[i]
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
    const r = model.rows[idx]
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
            const maxW = COL_W[i] - 8
            const maxH = ROW_H - 6
            const scale = Math.min(maxW / img.width, maxH / img.height, 1)
            page!.drawImage(img, { x: x + 4, y: y - ROW_H + 3, width: img.width * scale, height: img.height * scale })
          } catch {
            page!.drawText('(unreadable)', { x: x + 4, y: y - 18, size: 7, font, color: rgb(0.7, 0.2, 0.2) })
          }
        } else if (r.signatureExpired) {
          page!.drawText('image removed', { x: x + 4, y: y - 14, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
          page!.drawText(fit(r.signatureRef ?? '', font, 7, COL_W[i] - 8), { x: x + 4, y: y - 24, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
        } else {
          page!.drawText('-', { x: x + 4, y: y - 18, size: 8, font, color: rgb(0.6, 0.6, 0.6) })
        }
      } else {
        page!.drawText(fit(cells[i], font, 8, COL_W[i] - 8), { x: x + 4, y: y - 18, size: 8, font, color: rgb(0.1, 0.1, 0.1) })
      }
      x += COL_W[i]
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
