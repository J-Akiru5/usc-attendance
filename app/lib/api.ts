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

export function getSupabaseClient(): SupabaseClient | null {
  return supabaseClient
}

const API_BASE = '/api'

/**
 * An API failure with its HTTP status attached. `status === 0` means the
 * request never reached the server (the offline scanner queue relies on that
 * distinction: 0 is retried later, anything else is a real refusal).
 */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = supabaseClient ? (await supabaseClient.auth.getSession()).data.session : null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  }

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    })
  } catch {
    // DNS, no signal, server unreachable — the caller decides what to do.
    throw new ApiError('You appear to be offline. This will be recorded when the connection is back.', 0)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(body.error || `API error: ${res.status}`, res.status)
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
