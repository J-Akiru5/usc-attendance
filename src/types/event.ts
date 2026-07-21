export interface USCEvent {
  id: string
  title: string
  date: string
  endDate?: string
  description: string
  location: string
  venue?: string
  status: 'upcoming' | 'ongoing' | 'completed'
  featured: boolean
  coverImage?: string
  gallery?: string[]
  trailerUrl?: string
  tags?: string[]
  icon?: string
}
