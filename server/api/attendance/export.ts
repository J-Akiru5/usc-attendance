import { getMethod, getQuery, setResponseHeader } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, notFound, respond } from '../../utils/http'
import { auditDelegationUse, requireEventScope } from '../../utils/delegation'
import { buildReport, fileStem, formatManila, parseFormat, type ReportModel } from '../../utils/report'
import { signatureRef } from '../../utils/signature'
import { signatureStore, readSignaturePng } from '../../utils/signature-storage'

// ---------------------------------------------------------------------------
// GET /api/attendance/export?eventId=&format=csv|xlsx|pdf   (default csv)
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const user = await authenticate(event)

  const query = getQuery(event)
  const eventId = query.eventId as string
  if (!eventId) {
    throw badRequest('eventId is required')
  }

  const { viaDelegation } = await requireEventScope(prisma, user, eventId, 'export')

  const eventRow = await prisma.event.findUnique({ where: { id: eventId } })
  if (!eventRow) {
    throw notFound('Event not found')
  }
  if (viaDelegation) {
    await auditDelegationUse(prisma, user, eventId, 'export')
  }

  const format = parseFormat(query.format)
  if (!format) {
    throw badRequest('format must be one of: csv, xlsx, pdf')
  }

  const records = await prisma.attendance.findMany({
    where: { eventId },
    include: {
      user: { select: { name: true, position: true } },
      recorder: { select: { name: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  const sigs = await prisma.attendanceSignature.findMany({
    where: { attendanceId: { in: records.map(r => r.id) } },
    select: { attendanceId: true, png: true, sha256: true, storageKey: true }
  })
  const sigById = new Map(sigs.map(s => [s.attendanceId, s]))

  // Signature images may live in Postgres or in R2, depending on the row.
  const store = signatureStore()
  const signaturePngById = new Map<string, Uint8Array | null>()
  for (const sig of sigs) {
    signaturePngById.set(sig.attendanceId, await readSignaturePng(store, sig))
  }

  const METHOD_LABEL: Record<string, string> = { self: 'Self', qr: 'QR', manual: 'Manual' }
  const model: ReportModel = {
    title: eventRow.title,
    eventDate: formatManila(eventRow.date).slice(0, 10),
    venue: `${eventRow.lat.toFixed(5)}, ${eventRow.lng.toFixed(5)} (${eventRow.radiusMeters} m radius)`,
    generatedAt: formatManila(new Date()),
    generatedBy: user.name,
    rows: records.map((r, i) => ({
      no: i + 1,
      name: r.user.name,
      position: r.user.position,
      timeIn: formatManila(r.createdAt),
      timeOut: r.checkOutAt ? formatManila(r.checkOutAt) : '',
      method: METHOD_LABEL[r.method] ?? r.method,
      recordedBy: r.recorder.name,
      location: r.lat != null && r.lng != null ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : '',
      signatureRef: sigById.has(r.id) ? signatureRef(sigById.get(r.id)!.sha256) : null,
      signaturePng: signaturePngById.get(r.id) ?? null,
      signatureExpired: sigById.has(r.id) && !signaturePngById.get(r.id)
    }))
  }

  const report = await buildReport(model, format)

  // h3 keeps a preset Content-Type, so the CSV/XLSX/PDF type survives the send.
  setResponseHeader(event, 'Content-Type', report.contentType)
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${fileStem(eventRow.title)}.${report.extension}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return report.body
})
