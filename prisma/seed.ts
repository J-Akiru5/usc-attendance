import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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
  console.log('Seeding USC officers...')

  for (const officer of officers) {
    await prisma.user.upsert({
      where: { email: officer.email },
      update: {
        name: officer.name,
        position: officer.position,
        role: officer.role,
        active: true,
      },
      create: {
        email: officer.email,
        name: officer.name,
        position: officer.position,
        role: officer.role,
        mustChangePassword: true,
        active: true,
      },
    })
    console.log(`  ✓ ${officer.name} (${officer.position})`)
  }

  console.log(`\nSeed complete — ${officers.length} officers created.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
