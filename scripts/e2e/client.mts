// Shared HTTP client for the e2e suites.
//
// The suites no longer import the legacy handlers and call them in-process:
// every call goes over HTTP to a running Nuxt dev server (started by
// scripts/e2e/run.mts), so they exercise the real Nitro routes exactly as a
// browser would. Results keep the shape the suites used before (`_s`, `_b`,
// `_h`) so check labels and counts stay identical.
import 'dotenv/config'

export const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3300').replace(/\/+$/, '')

export interface ApiResult {
  _s: number
  // Bodies arrive already decoded: parsed JSON, text for CSV, Buffer for xlsx/pdf.
  _b: any
  _h: Record<string, string>
}

export interface ApiCall {
  token?: string | null
  method?: string
  body?: any
  query?: Record<string, unknown>
  headers?: Record<string, string>
}

export async function api(path: string, call: ApiCall = {}): Promise<ApiResult> {
  const { token = null, method = 'GET', body, query, headers = {} } = call

  const url = new URL(BASE_URL + path)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
  }

  const requestHeaders: Record<string, string> = { ...headers }
  if (token) requestHeaders.authorization = `Bearer ${token}`
  if (body !== undefined) requestHeaders['content-type'] = 'application/json'

  const init: RequestInit = { method, headers: requestHeaders }
  if (body !== undefined) init.body = JSON.stringify(body)

  let response: Response
  try {
    response = await fetch(url, init)
  } catch (err) {
    throw new Error(`Cannot reach ${url.toString()} — start the stack with \`npx tsx scripts/e2e/run.mts\` first (${String(err)})`, { cause: err })
  }

  const _h: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    _h[key.toLowerCase()] = value
  })

  const contentType = _h['content-type'] ?? ''
  let _b: unknown
  if (response.status === 204) {
    _b = undefined
  } else if (contentType.includes('json')) {
    _b = await response.json().catch(() => undefined)
  } else if (contentType.startsWith('text/')) {
    _b = await response.text()
  } else {
    _b = Buffer.from(await response.arrayBuffer())
  }

  return { _s: response.status, _b, _h }
}

// ---------------------------------------------------------------------------
// Local email capture (see scripts/e2e/run.mts): the dev server's Resend SDK
// is pointed at this inbox with RESEND_BASE_URL, so nothing is ever sent for
// real — the suites read the captured messages over HTTP instead of stubbing
// the sender in-process.
// ---------------------------------------------------------------------------
export interface CapturedEmail {
  to: string
  subject: string
  html: string
}

function captureUrl(): string {
  const url = process.env.EMAIL_CAPTURE_URL
  if (!url) throw new Error('EMAIL_CAPTURE_URL is not set — run the suites through scripts/e2e/run.mts')
  return url
}

export async function capturedEmails(): Promise<CapturedEmail[]> {
  const res = await fetch(`${captureUrl()}/emails`)
  if (!res.ok) throw new Error(`email capture server answered ${res.status}`)
  return await res.json() as CapturedEmail[]
}

export async function clearCapturedEmails(): Promise<void> {
  await fetch(`${captureUrl()}/emails`, { method: 'DELETE' })
}
