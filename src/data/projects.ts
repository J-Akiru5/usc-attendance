export interface Project {
  title: string
  description: string
  icon: string
  category: string
}

export const projects: Project[] = [
  {
    title: 'Environmental Campaign',
    description: 'Campus-wide initiatives promoting environmental awareness, tree planting drives, and sustainable practices within the ISUFST community.',
    icon: '🌱',
    category: 'Environment',
  },
  {
    title: 'Student Leadership Seminar',
    description: 'Workshops and seminars designed to develop leadership skills, governance knowledge, and civic responsibility among student officers.',
    icon: '🎓',
    category: 'Leadership',
  },
  {
    title: 'Community Outreach Program',
    description: 'Extension services and outreach activities connecting ISUFST students with local communities in Dingle and nearby municipalities.',
    icon: '🤝',
    category: 'Outreach',
  },
  {
    title: 'Academic Support Initiatives',
    description: 'Programs supporting student academic success including tutoring sessions, review workshops, and academic recognition events.',
    icon: '📚',
    category: 'Academics',
  },
  {
    title: 'Sports and Wellness',
    description: 'Intramural leagues, fitness activities, and wellness programs promoting physical health and sportsmanship among students.',
    icon: '🏆',
    category: 'Sports',
  },
  {
    title: 'Cultural and Arts Festival',
    description: 'Events celebrating Filipino culture, arts, and heritage through performances, exhibits, and cultural competitions.',
    icon: '🎭',
    category: 'Culture',
  },
]
