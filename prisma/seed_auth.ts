import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

// Load environment variables
dotenv.config()

const prisma = new PrismaClient()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateTempPassword(): string {
  const prefix = 'USC2026!'
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return prefix + suffix
}

const officers = [
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

  for (const u of officers) {
    let authUserId: string | null = null
    const tempPassword = generateTempPassword()

    // 1. Check if user already exists in Supabase Auth
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) {
      throw listError
    }

    const existingAuthUser = listData.users.find(user => user.email === u.email)

    if (existingAuthUser) {
      console.log(`  ✓ ${u.email} already exists in Supabase Auth (ID: ${existingAuthUser.id.slice(0, 8)}...)`)
      authUserId = existingAuthUser.id
    } else {
      console.log(`  + Creating ${u.email}...`)
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
      credentials.push({ name: u.name, email: u.email, password: tempPassword, position: u.position })
      console.log(`  ✓ Created ${u.email} (ID: ${authUserId.slice(0, 8)}...)`)
    }

    if (authUserId) {
      // 2. Clear out any existing user in the public DB with the same email but different ID
      const existingDbUser = await prisma.user.findUnique({
        where: { email: u.email }
      })

      if (existingDbUser && existingDbUser.id !== authUserId) {
        console.log(`  → Replacing mismatched DB record for ${u.email}`)
        await prisma.user.delete({
          where: { email: u.email }
        })
      }

      // 3. Upsert the public DB record with the correct auth ID
      await prisma.user.upsert({
        where: { id: authUserId },
        update: {
          email: u.email,
          name: u.name,
          position: u.position,
          role: u.role,
          mustChangePassword: true,
          active: true,
        },
        create: {
          id: authUserId,
          email: u.email,
          name: u.name,
          position: u.position,
          role: u.role,
          mustChangePassword: true,
          active: true,
        }
      })
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('AUTH AND DB SYNC COMPLETED')
  console.log('='.repeat(70))

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
    console.log('Officers will be forced to change their password on first login.')
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
