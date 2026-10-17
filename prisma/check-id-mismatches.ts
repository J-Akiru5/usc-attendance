/**
 * Read-only diagnostic: checks every account for Supabase Auth ↔ Prisma ID
 * mismatches and reports related-record counts.
 *
 * Usage:  npx tsx prisma/check-id-mismatches.ts
 *
 * This script does NOT modify any data.
 */
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const allEmails = [
  'admin@usc.edu.ph',
  'staff@usc.edu.ph',
  'officer@usc.edu.ph',
  'jdemonteverde@isufst.edu.ph',
  'kbicodo@isufst.edu.ph',
  'ndanugrao@isufst.edu.ph',
  'ddaguro@isufst.edu.ph',
  'lparcia@isufst.edu.ph',
  'raquino@isufst.edu.ph',
  'cmanderico@isufst.edu.ph',
  'ndeang@isufst.edu.ph',
  'jnatalio@isufst.edu.ph',
  'jbalinas@isufst.edu.ph',
  'jmartinez@isufst.edu.ph',
  'aperisme@isufst.edu.ph',
  'ralmirante@isufst.edu.ph',
  'jfrial@isufst.edu.ph',
]

async function main() {
  console.log('Checking for Supabase Auth ↔ Prisma ID mismatches...\n')

  const { data: authList, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) throw listError

  const mismatches: {
    email: string
    authId: string
    dbId: string | null
    attendanceCount: number
    dutyCount: number
  }[] = []

  const missing: string[] = []

  for (const email of allEmails) {
    const authUser = authList.users.find(u => u.email === email)
    if (!authUser) {
      missing.push(email)
      continue
    }

    const dbUser = await prisma.user.findUnique({ where: { email } })

    if (!dbUser) {
      console.log(`  ${email} — exists in Auth but NOT in Prisma DB`)
      mismatches.push({
        email,
        authId: authUser.id,
        dbId: null,
        attendanceCount: 0,
        dutyCount: 0,
      })
      continue
    }

    if (authUser.id === dbUser.id) {
      console.log(`  ${email} — IDs match ✓`)
    } else {
      const [attendanceCount, dutyCount] = await Promise.all([
        prisma.attendance.count({ where: { userId: dbUser.id } }),
        prisma.officeDuty.count({ where: { userId: dbUser.id } }),
      ])

      const safe = attendanceCount === 0 && dutyCount === 0
      console.log(
        `  ${email} — MISMATCH ${safe ? '(safe to repair)' : '(BLOCKED — has records)'}` +
        `\n    auth id: ${authUser.id}` +
        `\n    db   id: ${dbId(dbUser.id)}` +
        `\n    attendance: ${attendanceCount}, duties: ${dutyCount}`
      )

      mismatches.push({
        email,
        authId: authUser.id,
        dbId: dbUser.id,
        attendanceCount,
        dutyCount,
      })
    }
  }

  if (missing.length > 0) {
    console.log(`\n⚠ Accounts in our list but NOT in Supabase Auth (${missing.length}):`)
    for (const m of missing) {
      console.log(`  ${m}`)
    }
  }

  if (mismatches.length === 0) {
    console.log('\n✅ No mismatches found. All 17 accounts have consistent IDs.')
  } else {
    const safe = mismatches.filter(m => m.attendanceCount === 0 && m.dutyCount === 0)
    const blocked = mismatches.filter(m => m.attendanceCount > 0 || m.dutyCount > 0)

    console.log(`\n${'='.repeat(70)}`)
    console.log(`MISMATCHES: ${mismatches.length} total (${safe.length} safe, ${blocked.length} blocked)`)
    console.log('='.repeat(70))

    if (safe.length > 0) {
      console.log('\nSAFE TO REPAIR (no related records):')
      for (const s of safe) {
        console.log(`  ${s.email}`)
        console.log(`    auth id: ${s.authId}`)
        console.log(`    db   id: ${s.dbId}`)
      }
    }

    if (blocked.length > 0) {
      console.log('\n⚠ BLOCKED (has related records — needs data migration):')
      for (const b of blocked) {
        console.log(`  ${b.email}`)
        console.log(`    auth id:     ${b.authId}`)
        console.log(`    db   id:     ${b.dbId}`)
        console.log(`    attendance:  ${b.attendanceCount}`)
        console.log(`    duties:      ${b.dutyCount}`)
      }
    }
  }
}

function dbId(id: string | null): string {
  return id ?? '(missing)'
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
