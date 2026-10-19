import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import {
  buildCsv,
  buildPdf,
  buildTableCsv,
  buildTablePdf,
  buildTableXlsx,
  buildXlsx,
  fileStem,
  formatManila,
  parseFormat,
  safeCell,
  type ReportModel,
  type ReportRow,
  type TableReportModel
} from '../../server/utils/report'

// 1x1 transparent PNG
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  )
)

function row(over: Partial<ReportRow> = {}): ReportRow {
  return {
    no: 1,
    name: 'Rena Grace B. Aquiño',
    position: 'Spokesperson',
    timeIn: '2026-11-10 09:00:00',
    timeOut: '',
    method: 'QR',
    recordedBy: 'Jared S. Demonteverde',
    location: '',
    signatureRef: null,
    signaturePng: null,
    ...over
  }
}

function model(rows: ReportRow[]): ReportModel {
  return {
    title: 'General Assembly',
    eventDate: '2026-11-10',
    venue: 'Main Gym',
    generatedAt: '2026-11-10 12:00:00',
    generatedBy: 'Jared S. Demonteverde',
    rows
  }
}

describe('helpers', () => {
  it('parseFormat defaults to csv and rejects unknown formats', () => {
    expect(parseFormat(undefined)).toBe('csv')
    expect(parseFormat('xlsx')).toBe('xlsx')
    expect(parseFormat('pdf')).toBe('pdf')
    expect(parseFormat('docx')).toBeNull()
  })
  it('safeCell neutralises formula injection', () => {
    for (const bad of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx']) {
      expect(safeCell(bad).startsWith('\'')).toBe(true)
    }
    expect(safeCell('Normal Name')).toBe('Normal Name')
  })
  it('fileStem makes a safe filename', () => {
    expect(fileStem('Gen. Assembly / 2026!')).toBe('Gen-Assembly-2026-attendance')
    expect(fileStem('!!!')).toBe('attendance-attendance')
  })
  it('formatManila renders Asia/Manila time', () => {
    expect(formatManila(new Date('2026-11-10T01:05:09Z'))).toBe('2026-11-10 09:05:09')
  })
})

describe('buildCsv', () => {
  it('has a header, BOM, quoting, and an E-Signature column', () => {
    const csv = buildCsv(model([row({ name: 'Doe, "Jay"', signatureRef: 'SIG-AB12CD' })]))
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.replace(/\r\n$/, '').split('\r\n')
    expect(lines[0]).toBe('\uFEFFNo.,Name,Position,Time In,Time Out,Method,Recorded By,Location,E-Signature')
    expect(lines[1]).toContain('"Doe, ""Jay"""')
    expect(lines[1].endsWith('SIG-AB12CD')).toBe(true)
  })
  it('escapes formula-looking names', () => {
    const csv = buildCsv(model([row({ name: '=HYPERLINK("x")' })]))
    expect(csv).toContain(`'=HYPERLINK`)
  })
  it('keeps UTF-8 names intact', () => {
    expect(buildCsv(model([row()]))).toContain('Aquiño')
  })
})

describe('buildXlsx', () => {
  it('writes a worksheet with headers, rows, and embedded signature images', async () => {
    const buf = await buildXlsx(model([row({ signaturePng: PNG }), row({ no: 2, name: 'Second Person' })]))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer)
    const ws = wb.getWorksheet('Attendance')!
    expect(ws.getRow(5).getCell(9).value).toBe('E-Signature')
    expect(ws.getRow(6).getCell(2).value).toBe('Rena Grace B. Aquiño')
    expect(ws.getRow(7).getCell(2).value).toBe('Second Person')
    expect(ws.getImages().length).toBe(1)
  })
  it('handles an empty roster', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await buildXlsx(model([]))) as unknown as ExcelJS.Buffer)
    expect(wb.getWorksheet('Attendance')).toBeTruthy()
  })
})

describe('buildPdf', () => {
  it('produces a valid PDF', async () => {
    const buf = await buildPdf(model([row({ signaturePng: PNG })]))
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    const doc = await PDFDocument.load(buf)
    expect(doc.getPageCount()).toBe(1)
  })
  it('paginates large rosters', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row({ no: i + 1, name: `Person ${i + 1}` }))
    const doc = await PDFDocument.load(await buildPdf(model(rows)))
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })
  it('survives characters outside WinAnsi and an unreadable signature', async () => {
    const buf = await buildPdf(model([row({ name: '山田 太郎 ✓', signaturePng: Uint8Array.from([1, 2, 3]) })]))
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
  it('handles an empty roster', async () => {
    const buf = await buildPdf(model([]))
    expect((await PDFDocument.load(buf)).getPageCount()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Generic table reports (plan §8.7's liquidation document)
// ---------------------------------------------------------------------------
function tableModel(): TableReportModel {
  return {
    title: 'Liquidation report — Pag-abi-abi 2026',
    subtitle: 'Event: Pag-abi-abi (2026-11-02)',
    meta: ['Status: released', 'Budget line: Events'],
    sections: [
      {
        heading: 'Expenses, income and receipts',
        columns: [
          { label: 'Date', width: 70 },
          { label: 'Description', width: 200 },
          { label: 'Amount', width: 90, align: 'right' as const },
          { label: 'Receipt', width: 150 }
        ],
        rows: [
          ['2026-11-02', 'Tarp printing', '₱125.00', 'tarp.jpg'],
          ['2026-11-02', 'Tricycle fare', '₱30.00', 'NO RECEIPT']
        ],
        totals: ['', 'Total expenses', '₱155.00', '']
      }
    ],
    notes: ['Proposed ₱200.00 · Spent ₱155.00 · Variance ₱45.00 (underspent)'],
    generatedAt: '2026-11-10 09:05',
    generatedBy: 'Chene Manderico',
    stem: 'liquidation-Pag-abi-abi-2026'
  }
}

describe('buildTableReport', () => {
  it('writes a CSV with the heading, the columns, every row and the totals', () => {
    const csv = buildTableCsv(tableModel())
    const text = csv.replace(/^\uFEFF/, '')
    const lines = text.replace(/\r\n$/, '').split('\r\n')
    expect(lines[0]).toContain('Liquidation report')
    // A heading with a comma is quoted, exactly like any other CSV field.
    expect(text).toContain('"Expenses, income and receipts"')
    expect(lines).toContain('Date,Description,Amount,Receipt')
    expect(lines).toContain('2026-11-02,Tarp printing,₱125.00,tarp.jpg')
    expect(lines).toContain(',Total expenses,₱155.00,')
    expect(text).toContain('Variance ₱45.00')
    expect(lines.at(-1)).toContain('Generated 2026-11-10 09:05 by Chene Manderico')
  })

  it('neutralises formula-looking cells in the CSV', () => {
    const model = tableModel()
    model.sections[0]!.rows = [['2026-11-02', '=SUM(A1:A9)', '₱1.00', '']]
    expect(buildTableCsv(model)).toContain('\'=SUM(A1:A9)')
  })

  it('writes an Excel workbook with one sheet per section and a notes sheet', async () => {
    const buf = await buildTableXlsx(tableModel())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer)
    expect(wb.worksheets.map(ws => ws.name)).toEqual(['Expenses, income and receipts', 'Notes'])
    const sheet = wb.getWorksheet('Expenses, income and receipts')!
    const values = sheet.getSheetValues().flat()
    expect(values).toContain('Description')
    expect(values).toContain('Tarp printing')
    expect(values).toContain('Total expenses')
  })

  it('produces a valid PDF, paginating a long table', async () => {
    const model = tableModel()
    model.sections[0]!.rows = Array.from({ length: 80 }, (_, i) => [`2026-11-${String((i % 28) + 1).padStart(2, '0')}`, `Item ${i + 1}`, '₱1.00', ''])
    const buf = await buildTablePdf(model)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect((await PDFDocument.load(buf)).getPageCount()).toBeGreaterThan(1)
  })

  it('renders an empty section without failing', async () => {
    const model = tableModel()
    model.sections[0]!.rows = []
    expect(buildTableCsv(model)).toContain('Expenses, income and receipts')
    expect((await buildTablePdf(model)).subarray(0, 5).toString()).toBe('%PDF-')
  })
})
