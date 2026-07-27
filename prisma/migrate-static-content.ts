import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { officers } from '../src/data/officers.js'

const prisma = new PrismaClient()

const academicYear = process.argv[2] || '2026-2027'

interface EventJson {
  id: string
  title: string
  date: string
  endDate?: string
  description: string
  location: string
  venue?: string
  status: string
  featured: boolean
  coverImage?: string
  gallery?: string[]
  trailerUrl?: string
  tags?: string[]
  icon?: string
}

async function main() {
  console.log(`Migrating static content → DB with academicYear = "${academicYear}"\n`)

  // ── Officers ──
  let officerInserted = 0
  let officerSkipped = 0
  for (const o of officers) {
    const existing = await prisma.officer.findFirst({
      where: { name: o.name, academicYear },
    })
    if (existing) {
      console.log(`  ✗ Officer SKIPPED (already exists): ${o.name}`)
      officerSkipped++
      continue
    }
    await prisma.officer.create({
      data: {
        name: o.name,
        position: o.position,
        tier: o.tier,
        email: o.email,
        photo: o.photo,
        academicYear,
      },
    })
    console.log(`  ✓ Officer inserted: ${o.name}`)
    officerInserted++
  }

  // ── Public Events ──
  const eventsRaw = readFileSync('public/data/events.json', 'utf-8')
  const events: EventJson[] = JSON.parse(eventsRaw)

  let eventInserted = 0
  let eventSkipped = 0
  for (const e of events) {
    const existing = await prisma.publicEvent.findUnique({ where: { id: e.id } })
    if (existing) {
      console.log(`  ✗ Event SKIPPED (already exists): ${e.id}`)
      eventSkipped++
      continue
    }
    await prisma.publicEvent.create({
      data: {
        id: e.id,
        title: e.title,
        date: new Date(e.date),
        endDate: e.endDate ? new Date(e.endDate) : null,
        description: e.description,
        location: e.location,
        venue: e.venue ?? null,
        status: e.status,
        featured: e.featured,
        coverImage: e.coverImage ?? null,
        gallery: e.gallery ?? null,
        trailerUrl: e.trailerUrl ?? null,
        tags: e.tags ?? null,
        icon: e.icon ?? null,
        academicYear,
      },
    })
    console.log(`  ✓ Event inserted: ${e.id}`)
    eventInserted++
  }

  console.log('\n' + '='.repeat(60))
  console.log('MIGRATION COMPLETE')
  console.log('='.repeat(60))
  console.log(`  Officers: ${officerInserted} inserted, ${officerSkipped} skipped`)
  console.log(`  Events:   ${eventInserted} inserted, ${eventSkipped} skipped`)
  console.log(`  Academic Year: "${academicYear}"`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
