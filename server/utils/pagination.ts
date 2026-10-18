import { badRequest } from './http'

/**
 * Shared table query parsing (plan §8.1, `useDataTable`): page / pageSize /
 * sort / dir plus free-text `q`, clamped so a stray query string cannot ask the
 * database for everything.
 */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export interface TableQuery {
  page: number
  pageSize: number
  sort: string | null
  dir: 'asc' | 'desc'
  q: string
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseTableQuery(
  query: Record<string, unknown>,
  options: { allowedSort?: readonly string[], defaultSort?: string, defaultDir?: 'asc' | 'desc', maxPageSize?: number } = {}
): TableQuery {
  const page = Math.max(1, Number.parseInt(str(query.page) || '1', 10) || 1)
  const maxSize = options.maxPageSize ?? MAX_PAGE_SIZE
  const requestedSize = Number.parseInt(str(query.pageSize), 10)
  const pageSize = Number.isNaN(requestedSize)
    ? Math.min(DEFAULT_PAGE_SIZE, maxSize)
    : Math.min(Math.max(1, requestedSize), maxSize)

  const requestedSort = str(query.sort)
  let sort: string | null = null
  if (requestedSort) {
    if (options.allowedSort && !options.allowedSort.includes(requestedSort)) {
      throw badRequest(`Cannot sort by ${requestedSort}`)
    }
    sort = requestedSort
  } else if (options.defaultSort) {
    sort = options.defaultSort
  }

  const dir = str(query.dir).toLowerCase() === 'desc' ? 'desc' : (options.defaultDir ?? 'asc')

  return { page, pageSize, sort, dir, q: str(query.q).slice(0, 60) }
}

export function skipTake(table: TableQuery): { skip: number, take: number } {
  return { skip: (table.page - 1) * table.pageSize, take: table.pageSize }
}

/** `orderBy` for Prisma from the parsed query, falling back to a stable key. */
export function orderBy(table: TableQuery, fallback: Record<string, 'asc' | 'desc'>): Record<string, 'asc' | 'desc'> {
  if (!table.sort) return fallback
  return { [table.sort]: table.dir }
}

export interface Paged<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export function pageOf<T>(rows: T[], total: number, table: TableQuery): Paged<T> {
  return { rows, total, page: table.page, pageSize: table.pageSize }
}
