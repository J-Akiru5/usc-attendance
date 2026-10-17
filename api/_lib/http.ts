import type { VercelRequest, VercelResponse } from '@vercel/node'

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

export function sendError(res: VercelResponse, err: unknown): VercelResponse {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  console.error('[api] unhandled error:', err)
  return res.status(500).json({ error: 'Internal server error' })
}

export function handle<Args extends unknown[]>(
  fn: (req: VercelRequest, res: VercelResponse, ...args: Args) => Promise<unknown>
) {
  return (req: VercelRequest, res: VercelResponse, ...args: Args) =>
    fn(req, res, ...args).catch((err: unknown) => sendError(res, err))
}
