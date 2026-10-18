import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, orderBy, parseTableQuery, skipTake } from '../../server/utils/pagination'
import { HttpError } from '../../server/utils/http'

describe('parseTableQuery', () => {
  it('uses page 1 and the default size when nothing is asked', () => {
    const table = parseTableQuery({})
    expect(table).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null, dir: 'asc', q: '' })
  })

  it('clamps the page size and the page number', () => {
    expect(parseTableQuery({ pageSize: '1000' }).pageSize).toBe(MAX_PAGE_SIZE)
    expect(parseTableQuery({ pageSize: '0' }).pageSize).toBe(1)
    expect(parseTableQuery({ page: '-5' }).page).toBe(1)
    expect(parseTableQuery({ page: 'nope' }).page).toBe(1)
  })

  it('honours a custom maximum', () => {
    expect(parseTableQuery({ pageSize: '80' }, { maxPageSize: 50 }).pageSize).toBe(50)
  })

  it('accepts an allowed sort and rejects anything else', () => {
    const table = parseTableQuery({ sort: 'name', dir: 'DESC' }, { allowedSort: ['name', 'email'] })
    expect(table.sort).toBe('name')
    expect(table.dir).toBe('desc')

    expect(() => parseTableQuery({ sort: 'password' }, { allowedSort: ['name'] })).toThrow(HttpError)
  })

  it('falls back to the default sort and direction', () => {
    const table = parseTableQuery({}, { defaultSort: 'createdAt', defaultDir: 'desc' })
    expect(table.sort).toBe('createdAt')
    expect(table.dir).toBe('desc')
  })

  it('trims and caps the free-text query', () => {
    expect(parseTableQuery({ q: '  juan  ' }).q).toBe('juan')
    expect(parseTableQuery({ q: 'x'.repeat(200) }).q).toHaveLength(60)
  })
})

describe('skipTake / orderBy', () => {
  it('translates a page into skip/take', () => {
    expect(skipTake({ page: 3, pageSize: 25, sort: null, dir: 'asc', q: '' })).toEqual({ skip: 50, take: 25 })
  })

  it('uses the sort when present and the fallback otherwise', () => {
    expect(orderBy({ page: 1, pageSize: 25, sort: 'name', dir: 'desc', q: '' }, { name: 'asc' })).toEqual({ name: 'desc' })
    expect(orderBy({ page: 1, pageSize: 25, sort: null, dir: 'asc', q: '' }, { createdAt: 'desc' })).toEqual({ createdAt: 'desc' })
  })
})
