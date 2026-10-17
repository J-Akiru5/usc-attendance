import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Generate a cryptographically random password (16 bytes → 22-char base64url). */
function generatePassword(): string {
  return randomBytes(16).toString('base64url')
}

// By default, an account that has already completed its first-login password
// change (mustChangePassword: false) is left untouched on subsequent runs —
// no password rotation, no reprinted credential, no mustChangePassword reset.
// Only brand-new accounts get a generated password. Set ROTATE_ALL=true to
// force every account (including already-changed ones) back through rotation,
// e.g. for a deliberate credential-rotation pass:
//   ROTATE_ALL=true npm run db:auth-seed
const ROTATE_ALL = process.env.ROTATE_ALL === 'true'

/** Resolve the admin password lazily — only called when the admin account is actually being (re)seeded. */
function getAdminPassword(): string {
  if (process.env.SEED_ADMIN_PASSWORD) return process.env.SEED_ADMIN_PASSWORD
  const generated = generatePassword()
  console.log(`\n⚠  SEED_ADMIN_PASSWORD not set — generated admin password:\n   ${generated}\n`)
  return generated
}

// 2026 roster (USC org chart). Senate Press is currently vacant.
// Access flags (canDelegate for President/VP/Secretary, canConfigure for the Officer in Charge)
// are set in Manage Users and are not touched by this script.
const officers = [
  { email: 'admin@usc.edu.ph', name: 'USC Admin', position: 'System Administrator', role: 'super_admin' },
  { email: 'staff@usc.edu.ph', name: 'USC Staff Officer', position: 'Officer on Duty', role: 'staff' },
  { email: 'officer@usc.edu.ph', name: 'USC Student Officer', position: 'USC Officer', role: 'client' },
  { email: 'jdemonteverde@isufst.edu.ph', name: 'Jared S. Demonteverde', position: 'President', role: 'super_admin' },
  { email: 'kbicodo@isufst.edu.ph', name: 'Katherine Anne B. Bicodo', position: 'Vice President', role: 'super_admin' },
  { email: 'ndanugrao@isufst.edu.ph', name: 'Nikki Loraine B. Danugrao', position: 'Secretary', role: 'staff' },
  { email: 'ddaguro@isufst.edu.ph', name: 'Dein Andrey D. Daguro', position: 'Senate President', role: 'staff' },
  { email: 'lparcia@isufst.edu.ph', name: 'Lianne B. Parcia', position: 'Auditor', role: 'staff' },
  { email: 'raquino@isufst.edu.ph', name: 'Rena Grace B. Aquiño', position: 'Spokesperson', role: 'staff' },
  { email: 'cmanderico@isufst.edu.ph', name: 'Chene D. Manderico', position: 'Treasurer', role: 'staff' },
  { email: 'ndeang@isufst.edu.ph', name: 'Nezie Ann A. Deang', position: 'Senator', role: 'client' },
  { email: 'jnatalio@isufst.edu.ph', name: 'John David A. Natalio', position: 'Senator', role: 'client' },
  { email: 'jbalinas@isufst.edu.ph', name: 'John Emiel P. Balinas', position: 'Senator', role: 'client' },
  { email: 'jmartinez@isufst.edu.ph', name: 'Jeff Edrick C. Martinez', position: 'Officer in Charge', role: 'staff' },
  { email: 'aperisme@isufst.edu.ph', name: 'Andro Renz D. Perisme', position: 'Senator', role: 'client' },
  { email: 'ralmirante@isufst.edu.ph', name: 'Reynald S. Almirante', position: 'Senator', role: 'client' },
  { email: 'jfrial@isufst.edu.ph', name: 'Jona Ross P. Frial', position: 'Senator', role: 'client' }
]

async function main() {
  console.log('Seeding Supabase Auth users and syncing with Prisma DB...\n')

  const credentials: { name: string, email: string, password: string, position: string }[] = []
  const skippedMismatches: { email: string, authId: string, dbId: string }[] = []
  const skippedAlreadyChanged: string[] = []
  const failedUpdates: { email: string, message: string }[] = []

  // Fetch all auth users once to avoid repeated API calls
  const { data: authList, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) {
    throw listError
  }

  for (const u of officers) {
    // Look up the existing Prisma record first — it decides whether this
    // account gets rotated at all.
    const existingAuthUser = authList.users.find(user => user.email === u.email)
    const existingDbUser = await prisma.user.findUnique({ where: { email: u.email } })

    const isNewAccount = !existingAuthUser || !existingDbUser
    const alreadyChanged = !!existingDbUser && existingDbUser.mustChangePassword === false

    if (!isNewAccount && alreadyChanged && !ROTATE_ALL) {
      console.log(`  ${u.email} — already changed password, left untouched (mustChangePassword=false)`)
      skippedAlreadyChanged.push(u.email)
      continue
    }

    // Generate a fresh random password for every account being (re)seeded.
    // The admin user (first in the list) uses SEED_ADMIN_PASSWORD if set;
    // all others get a runtime-generated random password.
    const tempPassword = u.email === 'admin@usc.edu.ph'
      ? getAdminPassword()
      : generatePassword()

    let authUserId: string
    let status: string

    if (existingAuthUser) {
      authUserId = existingAuthUser.id

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        { password: tempPassword }
      )
      if (updateError) {
        status = `FAILED — password update rejected: ${updateError.message}`
        failedUpdates.push({ email: u.email, message: updateError.message })
      } else {
        status = 'already existed'
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
    }

    // Always push credentials so the table shows every rotated password
    credentials.push({ name: u.name, email: u.email, password: tempPassword, position: u.position })

    // 2. Upsert Prisma user by EMAIL — repair ID if mismatched
    // (existingDbUser was already resolved above, before the rotation-skip check)
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
            active: true
          }
        })
      } else {
        // IDs mismatch — check for related records before repairing
        const [attendanceCount, dutyCount] = await Promise.all([
          prisma.attendance.count({ where: { userId: existingDbUser.id } }),
          prisma.officeDuty.count({ where: { userId: existingDbUser.id } })
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
              active: true
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
          active: true
        }
      })
      status = 'created'
    }

    const failedUpdate = failedUpdates.find(f => f.email === u.email)
    if (failedUpdate) {
      status = `FAILED — password update rejected: ${failedUpdate.message}`
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

  if (skippedAlreadyChanged.length > 0) {
    console.log(`\nUNTOUCHED (already changed their password — ${skippedAlreadyChanged.length}):`)
    for (const email of skippedAlreadyChanged) {
      console.log(`  ${email}`)
    }
    console.log('  Re-run with ROTATE_ALL=true to force-rotate these too.')
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
    console.log(`\nTotal accounts: ${credentials.length}`)
  }

  if (failedUpdates.length > 0) {
    console.log('\nFAILED PASSWORD UPDATES — these accounts still have their previous passwords:')
    console.log('-'.repeat(70))
    for (const f of failedUpdates) {
      console.log(`  ✗ ${f.email} — ${f.message}`)
    }
    console.log('-'.repeat(70))
    console.log(`Total failed password updates: ${failedUpdates.length}`)

    process.exitCode = 1
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
