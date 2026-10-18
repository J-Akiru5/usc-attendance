// Removes throwaway e2e data left behind when a suite died before its cleanup
// (a database hiccup mid-run does that). Only `@example.invalid` accounts and
// events titled with the suites' e2e prefixes are touched.
// Run: npx tsx scripts/e2e/clean-stale.mts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const staleUsers = await prisma.user.findMany({
  where: { email: { endsWith: '@example.invalid' } },
  select: { id: true, email: true }
})
const userIds = staleUsers.map(u => u.id)
const staleEvents = await prisma.event.findMany({
  where: { OR: [{ title: { startsWith: 'e2e' } }, { creator: { email: { endsWith: '@example.invalid' } } }] },
  select: { id: true }
})
const eventIds = staleEvents.map(e => e.id)

console.log(`stale users: ${userIds.length}, stale events: ${eventIds.length}`)

if (eventIds.length > 0) {
  await prisma.eventRegistration.deleteMany({ where: { eventId: { in: eventIds } } })
  await prisma.attendanceSignature.deleteMany({ where: { attendance: { eventId: { in: eventIds } } } })
  await prisma.attendance.deleteMany({ where: { eventId: { in: eventIds } } })
  await prisma.eventDelegate.deleteMany({ where: { eventId: { in: eventIds } } })
  await prisma.event.deleteMany({ where: { seriesId: { in: eventIds } } })
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } })
}

if (userIds.length > 0) {
  await prisma.eventRegistration.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.eventDelegate.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { grantedBy: { in: userIds } }] } })
  await prisma.attendanceSignature.deleteMany({ where: { attendance: { userId: { in: userIds } } } })
  await prisma.attendance.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { recordedBy: { in: userIds } }] } })
  await prisma.savedView.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.studentProfile.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { performedBy: { in: userIds } }] } })
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  for (const id of userIds) await admin.auth.admin.deleteUser(id).catch(() => {})
}

console.log('done')
await prisma.$disconnect()
