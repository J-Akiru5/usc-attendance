import { getMethod, setResponseHeader } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { auditContext, auditRead } from '../../utils/audit'
import { EXPORT_SECTIONS, buildPrivacyExport } from '../../utils/privacy'

/**
 * GET /api/privacy/export — the caller's own data as a JSON download
 * (plan §8.9, benchmark BC-11).
 *
 * The queries are scoped to the authenticated id, and `buildPrivacyExport`
 * checks every row again. The response is a download and is never cached:
 * `private, no-store` plus `Vary: Authorization` keep a shared cache from
 * serving one student's copy to another.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)

  const [account, attendance, fines, clearances, excuses, privacyRequests] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        position: true,
        role: true,
        createdAt: true,
        consentAt: true,
        consentVersion: true,
        consentSource: true,
        studentProfile: {
          select: {
            studentNo: true,
            program: true,
            yearLevel: true,
            contactNumber: true,
            college: { select: { code: true, name: true } },
            programRef: { select: { code: true, name: true } },
            section: { select: { name: true, yearLevel: true } }
          }
        }
      }
    }),
    prisma.attendance.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        type: true,
        method: true,
        createdAt: true,
        checkOutAt: true,
        dutyDate: true,
        event: { select: { title: true, date: true } },
        signature: { select: { signedAt: true, purgedAt: true } }
      }
    }),
    prisma.fine.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        kind: true,
        sanctionType: true,
        amountCentavos: true,
        status: true,
        issuedAt: true,
        paidAt: true,
        paymentRef: true,
        waivedAt: true,
        servedAt: true,
        event: { select: { title: true, date: true } }
      }
    }),
    prisma.clearance.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        code: true,
        coveredCentavos: true,
        issuedAt: true,
        revokedAt: true
      }
    }),
    prisma.excuse.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        category: true,
        reason: true,
        status: true,
        createdAt: true,
        reviewedAt: true
      }
    }),
    prisma.privacyRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        kind: true,
        field: true,
        proposedValue: true,
        note: true,
        status: true,
        reason: true,
        createdAt: true,
        decidedAt: true
      }
    })
  ])

  const bundle = buildPrivacyExport({
    user: account,
    profile: account.studentProfile,
    attendance,
    fines,
    clearances,
    excuses,
    privacyRequests
  })

  await auditRead(prisma, {
    actor: user,
    targetType: 'privacy_export',
    targetId: user.id,
    userId: user.id,
    details: { sections: EXPORT_SECTIONS, schemaVersion: bundle.schemaVersion },
    ...auditContext(event)
  })

  setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Vary', 'Authorization')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(
    event,
    'Content-Disposition',
    `attachment; filename="usc-privacy-export-${new Date().toISOString().slice(0, 10)}.json"`
  )

  return bundle
})
