import { describe, expect, it } from 'vitest'
import {
  deriveStatus,
  dueAnnouncements,
  escapeHtml,
  plainAnnouncementBody,
  renderAnnouncementBody,
  safeHref
} from '../../server/utils/announce'

describe('escapeHtml', () => {
  it('neutralises everything that could become a tag', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('it\'s')).toBe('it&#39;s')
  })
})

describe('safeHref', () => {
  it('allows ordinary web links only', () => {
    expect(safeHref('https://usc.edu.ph')).toBe('https://usc.edu.ph')
    expect(safeHref('http://example.invalid/x?y=1')).toBe('http://example.invalid/x?y=1')
  })

  it('refuses anything a browser could execute', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    expect(safeHref('file:///c:/secrets.txt')).toBeNull()
    expect(safeHref('https://example.invalid/"onmouseover="alert(1)')).toBeNull()
  })
})

describe('renderAnnouncementBody', () => {
  it('turns paragraphs and line breaks into tags', () => {
    expect(renderAnnouncementBody('First line\nSecond line\n\nSecond paragraph'))
      .toBe('<p>First line<br>Second line</p>\n<p>Second paragraph</p>')
  })

  it('renders bold, italics and links', () => {
    expect(renderAnnouncementBody('**Assembly** at *3 PM* — see [the memo](https://usc.edu.ph/memo)'))
      .toBe('<p><strong>Assembly</strong> at <em>3 PM</em> — see <a href="https://usc.edu.ph/memo" target="_blank" rel="noopener noreferrer">the memo</a></p>')
  })

  it('renders bullet lists', () => {
    expect(renderAnnouncementBody('- Bring your ID\n- Sign on arrival'))
      .toBe('<ul><li>Bring your ID</li><li>Sign on arrival</li></ul>')
  })

  it('cannot be tricked into emitting a tag from user text', () => {
    const rendered = renderAnnouncementBody('<script>alert(1)</script> and <img src=x onerror=alert(2)>')
    expect(rendered).not.toContain('<script')
    expect(rendered).not.toContain('<img')
    expect(rendered).toContain('&lt;script&gt;')
  })

  it('refuses an executable link but keeps the words', () => {
    expect(renderAnnouncementBody('[click me](javascript:alert(1))')).toBe('<p>[click me](javascript:alert(1))</p>')
  })

  it('handles an empty body', () => {
    expect(renderAnnouncementBody('')).toBe('')
    expect(renderAnnouncementBody('   \n\n  ')).toBe('')
  })
})

describe('plainAnnouncementBody', () => {
  it('strips the markers for the inbox and the email', () => {
    expect(plainAnnouncementBody('**Assembly** tomorrow, see [the memo](https://usc.edu.ph)'))
      .toBe('Assembly tomorrow, see the memo (https://usc.edu.ph)')
  })
})

describe('deriveStatus', () => {
  it('knows a draft from a scheduled send from an immediate one', () => {
    expect(deriveStatus({})).toBe('draft')
    expect(deriveStatus({ scheduledFor: new Date('2026-12-01T01:00:00Z') })).toBe('scheduled')
    expect(deriveStatus({ sendNow: true, scheduledFor: new Date('2026-12-01T01:00:00Z') })).toBe('sent')
  })
})

describe('dueAnnouncements', () => {
  const now = new Date('2026-12-01T12:00:00Z')
  const rows = [
    { id: 'past', status: 'scheduled', scheduledFor: new Date('2026-12-01T10:00:00Z') },
    { id: 'future', status: 'scheduled', scheduledFor: new Date('2026-12-01T14:00:00Z') },
    { id: 'draft', status: 'draft', scheduledFor: null },
    { id: 'sent', status: 'sent', scheduledFor: new Date('2026-11-30T10:00:00Z') }
  ]

  it('picks only what is due', () => {
    expect(dueAnnouncements(rows, now).map(row => row.id)).toEqual(['past'])
  })
})
