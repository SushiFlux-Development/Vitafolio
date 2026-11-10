import { describe, expect, it } from 'vitest'
import type { ApplicationListItem } from '../../api/types'
import { dueFollowUps } from './model'

function application(id: string, overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return { id, jobTitle: `Stelle ${id}`, company: `Firma ${id}`, status: 'applied', isFollowUpDue: false, hasArchivedPdf: false, updatedAt: '2026-11-01T00:00:00Z', ...overrides }
}

describe('dueFollowUps', () => {
  it('lists only the applications whose follow-up is due, the longest waiting first', () => {
    const items = [
      application('late', { isFollowUpDue: true, followUpAt: '2026-10-20T00:00:00Z' }),
      application('quiet'),
      application('early', { isFollowUpDue: true, followUpAt: '2026-10-10T00:00:00Z' }),
      application('interview', { status: 'interview' }),
    ]
    expect(dueFollowUps(items).map((entry) => entry.id)).toEqual(['early', 'late'])
  })

  it('puts one without a date after the dated ones and cuts the list at the limit', () => {
    const items = [application('none', { isFollowUpDue: true }), application('dated', { isFollowUpDue: true, followUpAt: '2026-10-10T00:00:00Z' })]
    expect(dueFollowUps(items).map((entry) => entry.id)).toEqual(['dated', 'none'])
    expect(dueFollowUps(items, 1)).toHaveLength(1)
  })

  it('is empty when nothing is due, and does not change the list it was given', () => {
    const items = [application('a'), application('b', { isFollowUpDue: true, followUpAt: '2026-10-10T00:00:00Z' }), application('c', { isFollowUpDue: true, followUpAt: '2026-09-10T00:00:00Z' })]
    expect(dueFollowUps([application('a')])).toEqual([])
    dueFollowUps(items)
    expect(items.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })
})
