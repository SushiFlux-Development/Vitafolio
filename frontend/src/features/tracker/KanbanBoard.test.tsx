import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import type { ApplicationListItem, ApplicationStatus } from '../../api/types'
import { KanbanBoard } from './KanbanBoard'
import { BOARD_COLUMNS, columnOf, STATUS_ORDER, statusTone } from './status'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

function application(id: string, status: ApplicationStatus, extra: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return { id, jobTitle: `Stelle ${id}`, company: `Firma ${id}`, status, isFollowUpDue: false, hasArchivedPdf: false, updatedAt: '2026-11-01T00:00:00Z', ...extra }
}

describe('status columns', () => {
  it('maps all seven states onto six columns; rejection and withdrawal share the last one', () => {
    expect(STATUS_ORDER).toHaveLength(7)
    expect(BOARD_COLUMNS).toHaveLength(6)
    expect(columnOf('rejected')).toBe('closed')
    expect(columnOf('withdrawn')).toBe('closed')
    for (const status of ['draft', 'applied', 'acknowledged', 'interview', 'offer'] as const) expect(columnOf(status)).toBe(status)
  })

  it('does not tell the two closed states apart by shade alone (different tone is not enough: they carry a label and an icon)', () => {
    expect(statusTone('rejected')).toBe('danger')
    expect(statusTone('withdrawn')).toBe('neutral')
  })
})

describe('KanbanBoard', () => {
  const items = [application('a', 'rejected'), application('b', 'withdrawn'), application('c', 'applied'), application('d', 'interview', { isFollowUpDue: true })]

  it('names the last column "Abgeschlossen", explains what is in it, and labels every card in it', () => {
    render(<KanbanBoard applications={items} onSelect={vi.fn()} onPreview={vi.fn()} onDownload={vi.fn()} />)

    const closed = screen.getByRole('region', { name: 'Abgeschlossen' })
    expect(within(closed).getByText('Absagen und zurückgezogene Bewerbungen')).toBeInTheDocument()
    expect(within(closed).getByText('Absage')).toBeInTheDocument()
    expect(within(closed).getByText('Zurückgezogen')).toBeInTheDocument()
    expect(within(closed).getByText('Stelle a')).toBeInTheDocument()
    expect(within(closed).getByText('Stelle b')).toBeInTheDocument()
    // The other columns hold only their own cards and need no extra status badge.
    expect(within(screen.getByRole('region', { name: 'Beworben' })).queryByText('Stelle a')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Beworben' })).queryByText('Beworben', { selector: '.badge' })).toBeNull()
  })

  it('counts the cards per column with a spoken label', () => {
    render(<KanbanBoard applications={items} onSelect={vi.fn()} onPreview={vi.fn()} onDownload={vi.fn()} />)
    expect(within(screen.getByRole('region', { name: 'Abgeschlossen' })).getByLabelText('2 Bewerbungen in dieser Spalte')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Beworben' })).getByLabelText('1 Bewerbung in dieser Spalte')).toBeInTheDocument()
  })

  it('opens a card with the keyboard: the title is a real button', async () => {
    const onSelect = vi.fn()
    render(<KanbanBoard applications={items} onSelect={onSelect} onPreview={vi.fn()} onDownload={vi.fn()} />)

    const title = screen.getByRole('button', { name: 'Stelle c' })
    title.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('keeps the small actions in the page for keyboard and screen reader users, with names', () => {
    const onPreview = vi.fn()
    const onDownload = vi.fn()
    render(<KanbanBoard applications={items} onSelect={vi.fn()} onPreview={onPreview} onDownload={onDownload} />)

    const card = screen.getByRole('button', { name: 'Stelle c' }).closest('li')!
    // Hidden by opacity only until hover or focus: they are focusable and have accessible names.
    fireEvent.click(within(card).getByRole('button', { name: 'Dossier ansehen' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Dossier herunterladen (PDF)' }))
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }))
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }))
    expect(card.querySelector('.group-focus-within\\:opacity-100, [class*="group-focus-within:opacity-100"]')).not.toBeNull()
  })

  it('marks a follow-up in words for screen readers, not only by colour', () => {
    render(<KanbanBoard applications={items} onSelect={vi.fn()} onPreview={vi.fn()} onDownload={vi.fn()} />)
    const card = screen.getByRole('button', { name: 'Stelle d' }).closest('li')!
    expect(within(card).getByText('Nachfassen fällig')).toBeInTheDocument()
  })
})
