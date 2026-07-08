import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const prisma = new PrismaClient()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const usersToSeed = [
  {
    email: 'admin@usc.edu.ph',
    name: 'System Administrator',
    position: 'Secretary General',
    role: 'super_admin',
    password: 'password123'
  },
  {
    email: 'staff@usc.edu.ph',
    name: 'Officer on Duty',
    position: 'Sergeant at Arms',
    role: 'staff',
    password: 'password123'
  },
  {
    email: 'officer@usc.edu.ph',
    name: 'Officer Reyes',
    position: 'Vice President',
    role: 'client',
    password: 'password123'
  }
]

async function main() {
  console.log('Seeding Supabase Auth users and syncing with Prisma DB...')

  for (const u of usersToSeed) {
    let authUserId: string | null = null

    // 1. Check if user already exists in Supabase Auth
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) {
      throw listError
    }

    const existingAuthUser = listData.users.find(user => user.email === u.email)

    if (existingAuthUser) {
      console.log(`User ${u.email} already exists in Supabase Auth with ID: ${existingAuthUser.id}`)
      authUserId = existingAuthUser.id
    } else {
      console.log(`Creating user ${u.email} in Supabase Auth...`)
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true
      })

      if (createError) {
        console.error(`Error creating auth user ${u.email}:`, createError.message)
        continue
      }

      authUserId = createData.user.id
      console.log(`Successfully created auth user ${u.email} with ID: ${authUserId}`)
    }

    if (authUserId) {
      // 2. Clear out any existing user in the public DB with the same email but different ID
      const existingDbUser = await prisma.user.findUnique({
        where: { email: u.email }
      })

      if (existingDbUser && existingDbUser.id !== authUserId) {
        console.log(`Deleting mismatching public DB user record for ${u.email} (ID: ${existingDbUser.id})...`)
        await prisma.user.delete({
          where: { email: u.email }
        })
      }

      // 3. Upsert the public DB record with the correct auth ID
      console.log(`Upserting public DB record for ${u.email} with ID: ${authUserId}...`)
      await prisma.user.upsert({
        where: { id: authUserId },
        update: {
          email: u.email,
          name: u.name,
          position: u.position,
          role: u.role
        },
        create: {
          id: authUserId,
          email: u.email,
          name: u.name,
          position: u.position,
          role: u.role
        }
      })
    }
  }

  console.log('Auth and DB sync completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
