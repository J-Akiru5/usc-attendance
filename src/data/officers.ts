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
  },
  {
    name: 'Dr. Stephen Raymund T. Jinon',
    position: 'Vice President for Academic Affairs',
    tier: 'administration',
  },
  {
    name: 'Dr. Dingras E. Balbona',
    position: 'Campus Administrator',
    tier: 'administration',
  },
  {
    name: 'Dr. Febe Jane Ilisan-Sales, RGC',
    position: 'OIC Chairperson, Student Support Center',
    tier: 'administration',
  },
  {
    name: 'Dr. Ledeah R. Baling',
    position: 'Administrative Support Staff, SSC',
    tier: 'administration',
  },
  {
    name: 'Dr. Angeline A. Subang',
    position: 'Coordinator, Recreation & Sports Affairs',
    tier: 'administration',
  },
  {
    name: 'Dr. Nancy D. Daguro',
    position: 'Coordinator, Cultural Affairs',
    tier: 'administration',
  },
  {
    name: 'Instr. Jonard V. Verdeflor',
    position: 'Coordinator, Guidance and Testing',
    tier: 'administration',
  },
  {
    name: 'Mrs. Kathryn Rose C. Bracamonte',
    position: 'Coordinator, Health Services',
    tier: 'administration',
  },
  {
    name: 'Dr. Joanne A. Alada',
    position: 'Coordinator, Student Publication',
    tier: 'administration',
  },
  {
    name: 'Mr. Jilbert B. Tanquerido',
    position: 'Coordinator, Dormitory & Housing Services',
    tier: 'administration',
  },
  {
    name: 'Ms. Roussel Justinn B. Esmeralda',
    position: 'Coordinator, Student Organization',
    tier: 'administration',
  },
  {
    name: 'Dr. Soceline N. Batisl-Ong',
    position: 'Coordinator, Scholarship',
    tier: 'administration',
  },
  {
    name: 'Mr. Dwight V. Deslate',
    position: 'University Psychometrician',
    tier: 'administration',
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
  },
  {
    name: 'Rowena S. Borcelo',
    position: 'Co-Adviser, University Student Council',
    tier: 'usc_advisers',
  },

  // ── USC Executive Officers ──
  {
    name: 'Jared S. Demonteverde',
    position: 'President',
    tier: 'usc_executive',
  },
  {
    name: 'Katherine Anne B. Bicodo',
    position: 'Vice President',
    tier: 'usc_executive',
  },
  {
    name: 'Nikki Loraine B. Danugrao',
    position: 'Secretary',
    tier: 'usc_executive',
  },
  {
    name: 'Lianne B. Parcia',
    position: 'Auditor',
    tier: 'usc_executive',
  },
  {
    name: 'Dein Andrey D. Daguro',
    position: 'Senate President',
    tier: 'usc_executive',
  },
  {
    name: 'Chene D. Manderico',
    position: 'Treasurer',
    tier: 'usc_executive',
  },
  {
    name: 'Rena Grace B. Aquiño',
    position: 'Spokesperson',
    tier: 'usc_executive',
  },

  // ── Student Senate ──
  {
    name: 'Nezie Ann A. Deang',
    position: 'Senator',
    tier: 'student_senate',
  },
  {
    name: 'John David A. Natalio',
    position: 'Senator',
    tier: 'student_senate',
  },
  {
    name: 'John Emiel P. Balinas',
    position: 'Senator',
    tier: 'student_senate',
  },
  {
    name: 'Jeff Edrick C. Martinez',
    position: 'Senator',
    tier: 'student_senate',
  },
  {
    name: 'Andro Renz D. Perisme',
    position: 'Senator',
    tier: 'student_senate',
  },
  {
    name: 'Reynald S. Almirante',
    position: 'Senator',
    tier: 'student_senate',
  },
  {
    name: 'Jona Ross P. Frial',
    position: 'Senator',
    tier: 'student_senate',
  },
]
