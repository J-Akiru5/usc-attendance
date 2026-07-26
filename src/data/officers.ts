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
    photo: '/usc officers/Dr. Nordy D. Siason, Jr., CESO VI.webp',
  },
  {
    name: 'Dr. Stephen Raymund T. Jinon',
    position: 'Vice President for Academic Affairs',
    tier: 'administration',
    photo: '/usc officers/Dr. Stephen Raymund T. Jinon.webp',
  },
  {
    name: 'Dr. Dingras E. Balbona',
    position: 'Campus Administrator',
    tier: 'administration',
    photo: '/usc officers/Dr. Dingras E. Balbona.webp',
  },
  {
    name: 'Dr. Febe Jane Ilisan-Sales, RGC',
    position: 'OIC Chairperson, Student Support Center',
    tier: 'administration',
    photo: '/usc officers/Dr. Febe Jane Ilisan-Sales, RGC.webp',
  },
  {
    name: 'Dr. Ledeah R. Baling',
    position: 'Administrative Support Staff, SSC',
    tier: 'administration',
    photo: '/usc officers/Dr. Ledeah R. Baling.webp',
  },
  {
    name: 'Dr. Angeline A. Subang',
    position: 'Coordinator, Recreation & Sports Affairs',
    tier: 'administration',
    photo: '/usc officers/Dr. Angeline A. Subang.webp',
  },
  {
    name: 'Dr. Nancy D. Daguro',
    position: 'Coordinator, Cultural Affairs',
    tier: 'administration',
    photo: '/usc officers/Dr. Nancy D. Daguro.webp',
  },
  {
    name: 'Ms. Roussel Justinn B. Esmeralda',
    position: 'Coordinator, Guidance and Testing',
    tier: 'administration',
    photo: '/usc officers/Ms. Roussel Justinn B. Esmeralda.webp',
  },
  {
    name: 'Mrs. Kathryn Rose C. Bracamonte',
    position: 'Coordinator, Health Services',
    tier: 'administration',
    photo: '/usc officers/Mrs. Kathryn Rose C. Bracamonte.webp',
  },
  {
    name: 'Dr. Joanne A. Alada',
    position: 'Coordinator, Student Publication',
    tier: 'administration',
    photo: '/usc officers/Dr. Joanne A. Alada.webp',
  },
  {
    name: 'Mr. Jilbert B. Tanquerido',
    position: 'Coordinator, Dormitory & Housing Services',
    tier: 'administration',
    photo: '/usc officers/Mr. Jilbert B. Tanquerido.webp',
  },
  {
    name: 'Instr. Jonard V. Verdeflor',
    position: 'Coordinator, Student Organization and Equity Target Group',
    tier: 'administration',
    photo: '/usc officers/Instr. Jonard V. Verdeflor.webp',
  },
  {
    name: 'Dr. Soceline N. Batisla-ong',
    position: 'Coordinator, Scholarship',
    tier: 'administration',
    photo: '/usc officers/Dr. Soceline N. Batisla-ong.webp',
  },
  {
    name: 'Mr. Dwight V. Deslate',
    position: 'University Psychometrician',
    tier: 'administration',
    photo: '/usc officers/Mr. Dwight V. Deslate.webp',
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
    photo: '/usc officers/Instr. Jonard V. Verdeflor.webp',
  },
  {
    name: 'Rowena S. Borcelo',
    position: 'Co-Adviser, University Student Council',
    tier: 'usc_advisers',
    photo: '/usc officers/Rowena S. Borcelo.webp',
  },

  // ── USC Executive Officers ──
  {
    name: 'Jared S. Demonteverde',
    position: 'President',
    tier: 'usc_executive',
    photo: '/usc officers/Jared S. Demonteverde.webp',
  },
  {
    name: 'Katherine Anne B. Bicodo',
    position: 'Vice President',
    tier: 'usc_executive',
    photo: '/usc officers/Katherine Anne B. Bicodo.webp',
  },
  {
    name: 'Nikki Loraine B. Danugrao',
    position: 'Secretary',
    tier: 'usc_executive',
    photo: '/usc officers/Nikki Loraine B. Danugrao.webp',
  },
  {
    name: 'Lianne B. Parcia',
    position: 'Auditor',
    tier: 'usc_executive',
    photo: '/usc officers/Lianne B. Parcia.webp',
  },
  {
    name: 'Dein Andrey D. Daguro',
    position: 'Senate President',
    tier: 'usc_executive',
    photo: '/usc officers/Dein Andrey D. Daguro.webp',
  },
  {
    name: 'Chene D. Manderico',
    position: 'Treasurer',
    tier: 'usc_executive',
    photo: '/usc officers/Chene D. Manderico.webp',
  },
  {
    name: 'Rena Grace B. Aquiño',
    position: 'Spokesperson',
    tier: 'usc_executive',
    photo: '/usc officers/Rena Grace B. Aquiño.webp',
  },

  // ── Student Senate ──
  {
    name: 'Nezie Ann A. Deang',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/usc officers/Nezie Ann A. Deang.webp',
  },
  {
    name: 'John David A. Natalio',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/usc officers/John David A. Natalio.webp',
  },
  {
    name: 'John Emiel P. Balinas',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/usc officers/John Emiel P. Balinas.webp',
  },
  {
    name: 'Jeff Edrick C. Martinez',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/usc officers/Jeff Edrick C. Martinez.webp',
  },
  {
    name: 'Andro Renz D. Perisme',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/usc officers/Andro Renz D. Perisme.webp',
  },
  {
    name: 'Reynald S. Almirante',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/usc officers/Reynald S. Almirante.webp',
  },
  {
    name: 'Jona Ross P. Frial',
    position: 'Senator',
    tier: 'student_senate',
    photo: '/usc officers/Jona Ross P. Frial.webp',
  },
]
