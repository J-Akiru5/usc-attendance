export interface PublicEvent {
  title: string
  date: string
  description: string
  location: string
  icon: string
}

export const publicEvents: PublicEvent[] = [
  {
    title: 'General Assembly',
    date: 'July 2026',
    description: 'Quarterly gathering of all USC officers to discuss council business, review accomplishments, and plan upcoming initiatives.',
    location: 'ISUFST Dingle Campus',
    icon: '🏛️',
  },
  {
    title: 'Freshmen Orientation',
    date: 'August 2026',
    description: 'Welcome program for incoming freshmen students introducing them to campus life, student organizations, and university resources.',
    location: 'ISUFST Dingle Campus',
    icon: '🎒',
  },
  {
    title: 'Tree Planting Activity',
    date: 'September 2026',
    description: 'Community tree planting drive in partnership with local government units as part of the USC environmental advocacy program.',
    location: 'Dingle, Iloilo',
    icon: '🌳',
  },
  {
    title: 'Leadership Seminar',
    date: 'October 2026',
    description: 'Annual leadership development seminar for student officers featuring guest speakers, workshops, and team-building activities.',
    location: 'ISUFST Dingle Campus',
    icon: '🎤',
  },
]
