export interface Officer {
  name?: string
  position: string
  committee: string
  email?: string
  role: 'executive' | 'senate'
}

export interface OversightNode {
  id: string
  label: string
  name?: string
  isPlaceholder?: boolean
  tier: 'root' | 'fusc-branch' | 'fusc-president' | 'campus-ad' | 'ssc-chain'
}

export const oversight: OversightNode[] = [
  { id: 'suc-president', label: 'SUC President', tier: 'root' },
  { id: 'fusc-adviser', label: 'FUSC Adviser', tier: 'fusc-branch' },
  { id: 'placeholder', label: 'Name to confirm', isPlaceholder: true, tier: 'fusc-branch' },
  { id: 'fusc-president', label: 'FUSC President', tier: 'fusc-president' },
  { id: 'campus-ad', label: 'Campus AD', tier: 'campus-ad' },
  { id: 'ssc-chair', label: 'SSC Chair', tier: 'ssc-chain' },
  { id: 'vice-chair', label: 'Vice Chair', tier: 'ssc-chain' },
  { id: 'usc-adviser', label: 'USC Adviser', tier: 'ssc-chain' },
  { id: 'usc-co-adviser', label: 'USC Co-Adviser', tier: 'ssc-chain' },
]

export const officers: Officer[] = [
  {
    name: 'Jared S. Demonteverde',
    position: 'President',
    committee: 'Executive',
    email: 'jdemonteverde@isufst.edu.ph',
    role: 'executive',
  },
  {
    name: 'Katherine Anne B. Bicodo',
    position: 'Vice President',
    committee: 'Executive',
    email: 'kbicodo@isufst.edu.ph',
    role: 'executive',
  },
  {
    name: 'Nikki Loraine B. Danugrao',
    position: 'Secretary',
    committee: 'Executive',
    email: 'ndanugrao@isufst.edu.ph',
    role: 'executive',
  },
  {
    name: 'Dein Andrey D. Daguro',
    position: 'Senate President',
    committee: 'Executive',
    email: 'ddaguro@isufst.edu.ph',
    role: 'executive',
  },
  {
    name: 'Lianne B. Parcia',
    position: 'Auditor',
    committee: 'Executive',
    email: 'lparcia@isufst.edu.ph',
    role: 'executive',
  },
  {
    name: 'Rena Grace B. Aquiño',
    position: 'Spokesperson',
    committee: 'Executive',
    email: 'raquino@isufst.edu.ph',
    role: 'executive',
  },
  {
    name: 'Chene D. Manderico',
    position: 'Senator',
    committee: 'Senate',
    email: 'cmanderico@isufst.edu.ph',
    role: 'senate',
  },
  {
    name: 'Nezie Ann A. Deang',
    position: 'Senator',
    committee: 'Senate',
    email: 'ndeang@isufst.edu.ph',
    role: 'senate',
  },
  {
    name: 'John David A. Natalio',
    position: 'Senator',
    committee: 'Senate',
    email: 'jnatalio@isufst.edu.ph',
    role: 'senate',
  },
  {
    name: 'John Emiel P. Balinas',
    position: 'Senator',
    committee: 'Senate',
    email: 'jbalinas@isufst.edu.ph',
    role: 'senate',
  },
  {
    name: 'Jeff Edrick C. Martinez',
    position: 'Senator',
    committee: 'Senate',
    email: 'jmartinez@isufst.edu.ph',
    role: 'senate',
  },
  {
    name: 'Andro Renz D. Perisme',
    position: 'Senator',
    committee: 'Senate',
    email: 'aperisme@isufst.edu.ph',
    role: 'senate',
  },
  {
    name: 'Reynald S. Almirante',
    position: 'Senator',
    committee: 'Senate',
    email: 'ralmirante@isufst.edu.ph',
    role: 'senate',
  },
  {
    name: 'Jona Ross P. Frial',
    position: 'Senator',
    committee: 'Senate',
    email: 'jfrial@isufst.edu.ph',
    role: 'senate',
  },
]
