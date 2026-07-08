import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- USC Attendance Database Scratchpad ---')
  
  // 1. Fetch count of users
  const userCount = await prisma.user.count()
  console.log(`Total users in database: ${userCount}`)

  // 2. Fetch all users and display them
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      position: true,
    }
  })
  console.log('\nUsers List:')
  console.table(users)

  // 3. Fetch count of events
  const eventCount = await prisma.event.count()
  console.log(`\nTotal events in database: ${eventCount}`)
}

main()
  .catch((e) => {
    console.error('Error running scratchpad:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
