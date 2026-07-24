export interface PublicEvent {
  title: string
  date: string
  description: string
  location: string
  icon: string
}

export const publicEvents: PublicEvent[] = [
  {
    title: 'Pag Abi Abi 2026',
    date: 'July 2026',
    description: 'Welcome program for all students introducing them to campus life, student organizations, and the USC. A day of cultural festivities, performances, and community building to open the new academic year.',
    location: 'ISUFST Dingle Campus',
    icon: '🎉',
  },
  {
    title: 'Organizations Day',
    date: 'July 2026',
    description: 'A two-day celebration of student organizations showcasing their programs, recruitment drives, and interactive activities.',
    location: 'ISUFST Dingle Campus',
    icon: '🏫',
  },
]
