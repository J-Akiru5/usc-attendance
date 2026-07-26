export type OfficerTier = 'administration' | 'federated_usc' | 'usc_advisers' | 'usc_executive' | 'student_senate'

export interface Officer {
  name: string
  position: string
  tier: OfficerTier
  email?: string
  photo?: string
}

export const tierLabels: Record<OfficerTier, { label: string; sublabel: string }> = {
  administration: {
    label: 'University Administration',
    sublabel: 'ISUFST Leadership & Campus Administrators',
  },
  federated_usc: {
    label: 'Federated University Student Council',
    sublabel: 'University-Level Student Governance',
  },
  usc_advisers: {
    label: 'USC Advisers',
    sublabel: 'Faculty Advisers & Co-Advisers',
  },
  usc_executive: {
    label: 'USC Executive Officers',
    sublabel: 'Campus-Level Student Leadership',
  },
  student_senate: {
    label: 'Student Senate',
    sublabel: 'Legislative Body',
  },
}

export const officers: Officer[] = [
  // ── Administration ──
  {
    name: 'Dr. Nordy D. Siason, Jr., CESO VI',
    position: 'University President',
    tier: 'administration',
    photo: '/officers/Dr. Nordy D. Siason, Jr., CESO VI.png',
  },
  {
    name: 'Dr. Stephen Raymund T. Jinon',
    position: 'Vice President for Academic Affairs',
    tier: 'administration',
    photo: '/officers/Dr. Stephen Raymund T. Jinon.png',
  },
  {
    name: 'Dr. Dingras E. Balbona',
    position: 'Campus Administrator',
    tier: 'administration',
    photo: '/officers/Dr. Dingras E. Balbona.png',
  },
  {
    name: 'Dr. Febe Jane Ilisan-Sales, RGC',
    position: 'OIC Chairperson, Student Support Center',
    tier: 'administration',
    photo: '/officers/Dr. Febe Jane Ilisan-Sales, RGC.png',
  },
  {
    name: 'Dr. Ledeah R. Baling',
    position: 'Administrative Support Staff, SSC',
    tier: 'administration',
    photo: '/officers/Dr. Ledeah R. Baling.png',
  },
  {
    name: 'Dr. Angeline A. Subang',
    position: 'Coordinator, Recreation & Sports Affairs',
    tier: 'administration',
    photo: '/officers/Dr. Angeline A. Subang.png',
  },
  {
    name: 'Dr. Nancy D. Daguro',
    position: 'Coordinator, Cultural Affairs',
    tier: 'administration',
    photo: '/officers/Dr. Nancy D. Daguro.png',
  },
  {
    name: 'Instr. Jonard V. Verdeflor',
    position: 'Coordinator, Guidance and Testing',
    tier: 'administration',
    photo: '/officers/Instr. Jonard V. Verdeflor.png',
  },
  {
    name: 'Mrs. Kathryn Rose C. Bracamonte',
    position: 'Coordinator, Health Services',
    tier: 'administration',
    photo: '/officers/Mrs. Kathryn Rose C. Bracamonte.png',
  },
  {
    name: 'Dr. Joanne A. Alada',
    position: 'Coordinator, Student Publication',
    tier: 'administration',
    photo: '/officers/Dr. Joanne A. Alada.png',
  },
  {
    name: 'Mr. Jilbert B. Tanquerido',
    position: 'Coordinator, Dormitory & Housing Services',
    tier: 'administration',
    photo: '/officers/Mr. Jilbert B. Tanquerido.png',
  },
  {
    name: 'Ms. Roussel Justinn B. Esmeralda',
    position: 'Coordinator, Student Organization',
    tier: 'administration',
    photo: '/officers/Ms. Roussel Justinn B. Esmeralda.png',
  },
  {
    name: 'Dr. Soceline N. Batisl-Ong',
    position: 'Coordinator, Scholarship',
    tier: 'administration',
    photo: '/officers/Dr. Soceline N. Batisla-ong.png',
  },
  {
    name: 'Mr. Dwight V. Deslate',
    position: 'University Psychometrician',
    tier: 'administration',
    photo: '/officers/Mr. Dwight V. Deslate.png',
  },

  // ── Federated USC ──
  {
    name: 'Armando S. Katalbas',
    position: 'Adviser, Federated University Student Council',
    tier: 'federated_usc',
  },
  {
    name: 'Gerel A. Depositario',
    position: 'President, Federated University Student Council',
    tier: 'federated_usc',
  },

  // ── USC Advisers ──
  {
    name: 'Jonard V. Verdeflor',
    position: 'Adviser, University Student Council',
    tier: 'usc_advisers',
    photo: '/officers/Instr. Jonard V. Verdeflor.png',
  },
  {
    name: 'Rowena S. Borcelo',
    position: 'Co-Adviser, University Student Council',
    tier: 'usc_advisers',
    photo: '/officers/Rowena S. Borcelo.png',
  },

  // ── USC Executive Officers ──
  {
    name: 'Jared S. Demonteverde',
    position: 'President',
    tier: 'usc_executive',
    photo: '/officers/Jared S. Demonteverde.png',
  },
  {
    name: 'Katherine Anne B. Bicodo',
    position: 'Vice President',
    tier: 'usc_executive',
    photo: '/officers/Katherine Anne B. Bicodo.png',
  },
  {
    name: 'Nikki Loraine B. Danugrao',
    position: 'Secretary',
    tier: 'usc_executive',
    photo: '/officers/Nikki Loraine B. Danugrao.png',
  },
  {
    name: 'Lianne B. Parcia',
    position: 'Auditor',
    tier: 'usc_executive',
    photo: '/officers/Lianne B. Parcia.png',
  },
  {
    name: 'Dein Andrey D. Daguro',
    position: 'Senate President',
    tier: 'usc_executive',
    photo: '/officers/Dein Andrey D. Daguro.png',
  },
  {
    name: 'Chene D. Manderico',
    position: 'Treasurer',
    tier: 'usc_executive',
    photo: '/officers/Chene D. Manderico.png',
  },
  {
    name: 'Rena Grace B. Aquiño',
    position: 'Spokesperson',
    tier: 'usc_executive',
    photo: '/officers/Rena Grace B. Aquiño.png',
  },

  // ── Student Senate ──
  {
    name: 'Nezie Ann A. Deang',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/officers/Nezie Ann A. Deang.png',
  },
  {
    name: 'John David A. Natalio',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/officers/John David A. Natalio.png',
  },
  {
    name: 'John Emiel P. Balinas',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/officers/John Emiel P. Balinas.png',
  },
  {
    name: 'Jeff Edrick C. Martinez',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/officers/Jeff Edrick C. Martinez.png',
  },
  {
    name: 'Andro Renz D. Perisme',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/officers/Andro Renz D. Perisme.png',
  },
  {
    name: 'Reynald S. Almirante',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/officers/Reynald S. Almirante.png',
  },
  {
    name: 'Jona Ross P. Frial',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/officers/Jona Ross P. Frial.png',
  },
]
