import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const adminPassword = process.env.SEED_ADMIN_PASSWORD
if (!adminPassword) {
  console.error('SEED_ADMIN_PASSWORD env var is required to seed the admin account')
  process.exit(1)
}

const OFFICER_PASSWORDS: Record<string, string> = {
  'admin@usc.edu.ph': adminPassword,
  'jdemonteverde@isufst.edu.ph': 'USC2026!EGKJ3G',
  'kbicodo@isufst.edu.ph':      'USC2026!hwLRTq',
  'ndanugrao@isufst.edu.ph':    'USC2026!EJLFDZ',
  'ddaguro@isufst.edu.ph':      'USC2026!VcKuMB',
  'lparcia@isufst.edu.ph':      'USC2026!Jkcbru',
  'raquino@isufst.edu.ph':      'USC2026!feSSKx',
  'cmanderico@isufst.edu.ph':   'USC2026!NYwzMM',
  'ndeang@isufst.edu.ph':       'USC2026!FgAkpM',
  'jnatalio@isufst.edu.ph':     'USC2026!nmBMAS',
  'jbalinas@isufst.edu.ph':     'USC2026!qU4D2N',
  'jmartinez@isufst.edu.ph':    'USC2026!atwgVf',
  'aperisme@isufst.edu.ph':     'USC2026!qXJWSD',
  'ralmirante@isufst.edu.ph':   'USC2026!QVj3be',
  'jfrial@isufst.edu.ph':       'USC2026!xUcMMf',
}

const officers = [
  { email: 'admin@usc.edu.ph', name: 'USC Admin', position: 'System Administrator', role: 'super_admin' },
  { email: 'jdemonteverde@isufst.edu.ph', name: 'Jared S. Demonteverde', position: 'President', role: 'super_admin' },
  { email: 'kbicodo@isufst.edu.ph', name: 'Katherine Anne B. Bicodo', position: 'Vice President', role: 'staff' },
  { email: 'ndanugrao@isufst.edu.ph', name: 'Nikki Loraine B. Danugrao', position: 'Secretary', role: 'staff' },
  { email: 'ddaguro@isufst.edu.ph', name: 'Dein Andrey D. Daguro', position: 'Senate Press', role: 'staff' },
  { email: 'lparcia@isufst.edu.ph', name: 'Lianne B. Parcia', position: 'Auditor', role: 'staff' },
  { email: 'raquino@isufst.edu.ph', name: 'Rena Grace B. Aquiño', position: 'Spokesperson', role: 'staff' },
  { email: 'cmanderico@isufst.edu.ph', name: 'Chene D. Manderico', position: 'Senator', role: 'client' },
  { email: 'ndeang@isufst.edu.ph', name: 'Nezie Ann A. Deang', position: 'Senator', role: 'client' },
  { email: 'jnatalio@isufst.edu.ph', name: 'John David A. Natalio', position: 'Senator', role: 'client' },
  { email: 'jbalinas@isufst.edu.ph', name: 'John Emiel P. Balinas', position: 'Senator', role: 'client' },
  { email: 'jmartinez@isufst.edu.ph', name: 'Jeff Edrick C. Martinez', position: 'Senator', role: 'client' },
  { email: 'aperisme@isufst.edu.ph', name: 'Andro Renz D. Perisme', position: 'Senator', role: 'client' },
  { email: 'ralmirante@isufst.edu.ph', name: 'Reynald S. Almirante', position: 'Senator', role: 'client' },
  { email: 'jfrial@isufst.edu.ph', name: 'Jona Ross P. Frial', position: 'Senator', role: 'client' },
]

async function main() {
  console.log('Seeding Supabase Auth users and syncing with Prisma DB...\n')

  const credentials: { name: string; email: string; password: string; position: string }[] = []
  const skippedMismatches: { email: string; authId: string; dbId: string }[] = []

  // Fetch all auth users once to avoid repeated API calls
  const { data: authList, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) {
    throw listError
  }

  for (const u of officers) {
    const tempPassword = OFFICER_PASSWORDS[u.email]
    if (!tempPassword) {
      console.error(`  ✗ No password defined for ${u.email} — skipping`)
      continue
    }

    // 1. Resolve Supabase Auth user (reuse cached list)
    const existingAuthUser = authList.users.find(user => user.email === u.email)
    let authUserId: string
    let status: string

    if (existingAuthUser) {
      authUserId = existingAuthUser.id
      status = 'already existed'

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        { password: tempPassword }
      )
      if (updateError) {
        console.error(`  ✗ Error updating password for ${u.email}: ${updateError.message}`)
      }
    } else {
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: tempPassword,
        email_confirm: true
      })

      if (createError) {
        console.error(`  ✗ Error creating ${u.email}: ${createError.message}`)
        continue
      }

      authUserId = createData.user.id
      status = 'created'
      credentials.push({ name: u.name, email: u.email, password: tempPassword, position: u.position })
    }

    // 2. Upsert Prisma user by EMAIL — repair ID if mismatched
    const existingDbUser = await prisma.user.findUnique({
      where: { email: u.email }
    })

    if (existingDbUser) {
      if (existingDbUser.id === authUserId) {
        // IDs match — just update metadata
        await prisma.user.update({
          where: { email: u.email },
          data: {
            name: u.name,
            position: u.position,
            role: u.role,
            mustChangePassword: true,
            active: true,
          }
        })
      } else {
        // IDs mismatch — check for related records before repairing
        const [attendanceCount, dutyCount] = await Promise.all([
          prisma.attendance.count({ where: { userId: existingDbUser.id } }),
          prisma.officeDuty.count({ where: { userId: existingDbUser.id } }),
        ])

        if (attendanceCount > 0 || dutyCount > 0) {
          status = 'SKIPPED (has related records, manual migration needed)'
          skippedMismatches.push({ email: u.email, authId: authUserId, dbId: existingDbUser.id })
          console.error(`  ⚠ ${u.email} — ID mismatch but has ${attendanceCount} attendance + ${dutyCount} duty rows — SKIPPED`)
          console.error(`    auth id: ${authUserId}`)
          console.error(`    db   id: ${existingDbUser.id}`)
        } else {
          // No related rows — safe to repair the ID
          await prisma.user.update({
            where: { email: u.email },
            data: {
              id: authUserId,
              name: u.name,
              position: u.position,
              role: u.role,
              mustChangePassword: true,
              active: true,
            }
          })
          status = 'id repaired'
        }
      }
    } else {
      // No Prisma user exists — create with correct ID
      await prisma.user.create({
        data: {
          id: authUserId,
          email: u.email,
          name: u.name,
          position: u.position,
          role: u.role,
          mustChangePassword: true,
          active: true,
        }
      })
      status = 'created'
    }

    console.log(`  ${u.email} — ${status}`)
  }

  console.log('\n' + '='.repeat(70))
  console.log('AUTH AND DB SYNC COMPLETED')
  console.log('='.repeat(70))

  if (skippedMismatches.length > 0) {
    console.log('\n⚠ SKIPPED RECORDS (manual migration required):')
    for (const s of skippedMismatches) {
      console.log(`  ${s.email}`)
      console.log(`    auth id: ${s.authId}`)
      console.log(`    db   id: ${s.dbId}`)
    }
  }

  if (credentials.length > 0) {
    console.log('\nTEMPORARY CREDENTIALS — Distribute these privately to each officer:\n')
    console.log('-'.repeat(70))
    console.log('Name'.padEnd(30) + 'Email'.padEnd(35) + 'Password')
    console.log('-'.repeat(70))
    for (const c of credentials) {
      console.log(c.name.padEnd(30) + c.email.padEnd(35) + c.password)
    }
    console.log('-'.repeat(70))
    console.log(`\nTotal new accounts: ${credentials.length}`)
  } else {
    console.log('\nAll officers already have accounts. No new credentials generated.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
