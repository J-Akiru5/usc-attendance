import { api } from '@/lib/api'
import type { DelegationScope, EventDelegate, User } from '@/types'

type Candidate = Pick<User, 'id' | 'name' | 'position'>

/** Ported from the legacy Pinia store — same API, `useState`-backed, `reactive()`-unwrapped. */
export function useDelegationStore() {
  const grants = useState<EventDelegate[]>('delegations:grants', () => [])
  const mine = useState<EventDelegate[]>('delegations:mine', () => [])
  const candidates = useState<Candidate[]>('delegations:candidates', () => [])
  const loading = useState('delegations:loading', () => false)

  async function fetchForEvent(eventId: string) {
    loading.value = true
    try {
      grants.value = await api.get<EventDelegate[]>(`/delegations?eventId=${encodeURIComponent(eventId)}`)
    } finally {
      loading.value = false
    }
  }

  async function fetchCandidates() {
    candidates.value = await api.get<Candidate[]>('/delegations/candidates')
  }

  async function fetchMine() {
    mine.value = await api.get<EventDelegate[]>('/delegations/mine')
  }

  async function grant(input: {
    eventId: string
    userId: string
    scopes: DelegationScope[]
    expiresAt?: string
  }) {
    const created = await api.post<EventDelegate>('/delegations', input)
    await fetchForEvent(input.eventId)
    return created
  }

  async function revoke(grantId: string, eventId: string) {
    await api.delete(`/delegations/${grantId}`)
    await fetchForEvent(eventId)
  }

  return reactive({
    grants,
    mine,
    candidates,
    loading,
    fetchForEvent,
    fetchCandidates,
    fetchMine,
    grant,
    revoke
  })
}
