import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ported from the legacy `src/lib/api.ts` (public-site freeze: same URLs, same
 * headers, same error shape). The Supabase client is injected once by
 * `plugins/api.client.ts` so callers keep using `api.get/post/…` unchanged.
 */
let supabaseClient: SupabaseClient | null = null

export function setSupabaseClient(client: SupabaseClient) {
  supabaseClient = client
}

const API_BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = supabaseClient ? (await supabaseClient.auth.getSession()).data.session : null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  }

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `API error: ${res.status}`)
  }

  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', ...(body !== undefined && { body: JSON.stringify(body) }) })
}
