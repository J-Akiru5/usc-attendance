import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed a super_admin user
  await prisma.user.upsert({
    where: { email: 'admin@usc.edu.ph' },
    update: {},
    create: {
      email: 'admin@usc.edu.ph',
      name: 'System Administrator',
      position: 'Secretary General',
      role: 'super_admin',
    },
  })

  // Seed a staff user
  await prisma.user.upsert({
    where: { email: 'staff@usc.edu.ph' },
    update: {},
    create: {
      email: 'staff@usc.edu.ph',
      name: 'Officer on Duty',
      position: 'Sergeant at Arms',
      role: 'staff',
    },
  })

  // Seed a client (officer) user
  await prisma.user.upsert({
    where: { email: 'officer@usc.edu.ph' },
    update: {},
    create: {
      email: 'officer@usc.edu.ph',
      name: 'Officer Reyes',
      position: 'Vice President',
      role: 'client',
    },
  })

  console.log('Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
