import type { H3Event } from 'h3'
import { defineEventHandler, getMethod, readBody, setResponseHeader, setResponseStatus } from 'h3'

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export const badRequest = (message: string) => new HttpError(400, message)
export const unauthorized = (message = 'Unauthorized') => new HttpError(401, message)
export const forbidden = (message: string) => new HttpError(403, message)
export const notFound = (message: string) => new HttpError(404, message)

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object'
    && err !== null
    && 'code' in err
    && (err as { code: unknown }).code === 'P2002'
  )
}

/** `res.status(statusCode).json(body)` — set the status and hand the body back to Nitro. */
export function respond<T>(event: H3Event, statusCode: number, body: T): T {
  setResponseStatus(event, statusCode)
  return body
}

/** `res.status(statusCode).end()` — empty body, status kept (204 by default). */
export function noContent(event: H3Event, statusCode = 204): null {
  setResponseStatus(event, statusCode)
  return null
}

/**
 * The parsed JSON body, or `undefined` when the request carries no body — the
 * same shape the Vercel request parser gave the legacy handlers.
 */
export async function readJsonBody<T = Record<string, unknown>>(event: H3Event): Promise<T | undefined> {
  try {
    return await readBody<T>(event)
  } catch {
    throw badRequest('Invalid JSON body')
  }
}

/** CORS pre-flight, answered exactly as the legacy `api/index.ts` router did. */
function preflight(event: H3Event): null {
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return noContent(event, 204)
}

/**
 * Wrap a Nitro route handler with the legacy router's contract:
 * an `HttpError` becomes `{ error }` with its status, anything else is logged
 * and answered with `500 { error: 'Internal server error' }`.
 *
 * `OPTIONS` is answered here (204 + CORS) before the route runs, matching the
 * old catch-all router's behaviour.
 */
export function defineApiHandler(handler: (event: H3Event) => Promise<unknown> | unknown) {
  return defineEventHandler(async (event) => {
    if (getMethod(event) === 'OPTIONS') return preflight(event)

    try {
      const result = await handler(event)
      // A bare `return` means "no body": h3 would reject `undefined`, so send an empty 200.
      return result === undefined ? noContent(event, 200) : result
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return respond(event, err.status, { error: err.message })
      }
      console.error('[api] unhandled error:', err)
      return respond(event, 500, { error: 'Internal server error' })
    }
  })
}
