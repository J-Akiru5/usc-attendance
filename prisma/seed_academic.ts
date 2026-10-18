import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

/**
 * Seeds the academic reference data the plan fixes (docs/PROFESSIONAL-SYSTEM-PLAN.md §8.1):
 * the four ISUFST colleges. Programs and sections are entered by the admin, so
 * this script only touches colleges and is safe to re-run — it matches on the
 * college code and never overwrites a name an admin has edited.
 */
const COLLEGES = [
  { code: 'CICI', name: 'College of Informatics and Computing Innovations' },
  { code: 'CoAg', name: 'College of Agriculture' },
  { code: 'CBMSD', name: 'College of Business Management and Sustainable Development' },
  { code: 'CoEd', name: 'College of Education' }
]

async function main() {
  for (const college of COLLEGES) {
    const existing = await prisma.college.findUnique({ where: { code: college.code } })
    if (existing) {
      console.log(`college ${college.code}: already present (${existing.name})`)
      continue
    }
    const created = await prisma.college.create({ data: college })
    console.log(`college ${created.code}: created (${created.name})`)
  }
}

main()
  .catch((err) => {
    console.error('seed_academic failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
