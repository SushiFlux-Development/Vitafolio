import { render, fireEvent, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { publicApi, whatsNewApi } from '../../api/endpoints'
import { notesOf, versionOf } from '../../test/fixtures'
import { renderInApp } from '../../test/render'
import { renderInlineMarkdown } from './inlineMarkdown'
import { WhatsNewHost } from './WhatsNewHost'
import { WhatsNewViewer } from './WhatsNewViewer'

vi.mock('../../api/endpoints', () => ({
  whatsNewApi: { pending: vi.fn(), current: vi.fn(), markSeen: vi.fn() },
  publicApi: { version: vi.fn() },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.12.1 (4.200)'))
  vi.mocked(whatsNewApi.markSeen).mockResolvedValue(undefined)
})

describe('inline markdown', () => {
  it('renders bold and inline code and nothing else', () => {
    const { container } = render(<p>{renderInlineMarkdown('Das **Neue** und `code` hier')}</p>)
    expect(container.querySelector('strong')).toHaveTextContent('Neue')
    expect(container.querySelector('code')).toHaveTextContent('code')
    expect(container.textContent).toBe('Das Neue und code hier')
  })

  it('keeps HTML as plain text - no element is ever created from the notes', () => {
    const { container } = render(<p>{renderInlineMarkdown('<img src=x onerror=alert(1)> und <script>alert(2)</script> **fett**')}</p>)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelectorAll('strong')).toHaveLength(1)
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(container.textContent).toContain('<script>alert(2)</script>')
  })

  it('shows an unclosed marker as it is', () => {
    const { container } = render(<p>{renderInlineMarkdown('Offen **ohne Ende und `auch so')}</p>)
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('code')).toBeNull()
    expect(container.textContent).toBe('Offen **ohne Ende und `auch so')
  })

  it('does not treat Markdown links or images as such', () => {
    const { container } = render(<p>{renderInlineMarkdown('[klick](javascript:alert(1)) ![x](http://a/b.png)')}</p>)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('"What is new" after an update', () => {
  it('opens by itself when the notes are due: version heading, one block per category, bold rendered', async () => {
    vi.mocked(whatsNewApi.pending).mockResolvedValue(notesOf())
    renderInApp(<WhatsNewHost />)

    const dialog = await screen.findByRole('dialog', { name: 'Neu in v2026.12.1 (4.200)' })
    expect(within(dialog).getByRole('region', { name: 'Neu' })).toHaveTextContent('Der Lebenslauf hat ein neues Design.')
    expect(within(dialog).getByRole('region', { name: 'Behoben' })).toHaveTextContent('Ein Absturz beim Speichern.')
    expect(dialog.querySelector('strong')).toHaveTextContent('Lebenslauf')
    expect(dialog.querySelector('code')).toHaveTextContent('docker pull')
    expect(whatsNewApi.pending).toHaveBeenCalledWith('de')
  })

  it('shows nothing when the server says there is nothing due', async () => {
    vi.mocked(whatsNewApi.pending).mockResolvedValue(notesOf({ show: false, sections: [] }))
    renderInApp(<WhatsNewHost />)
    await waitFor(() => expect(whatsNewApi.pending).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is shown once: closing marks the notes as seen and they do not come back', async () => {
    vi.mocked(whatsNewApi.pending).mockResolvedValue(notesOf())
    const { rerender, queryClient } = renderInApp(<WhatsNewHost />)
    const button = await screen.findByRole('button', { name: 'Verstanden' })
    fireEvent.click(button)

    await waitFor(() => expect(whatsNewApi.markSeen).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(queryClient.getQueryData<{ show: boolean }>(['whats-new', 'pending'])?.show).toBe(false)
    rerender(<div />)
    expect(whatsNewApi.pending).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['a click beside the dialog', () => fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement)],
    ['the close button of the corner', () => fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))],
  ])('closes with %s and marks the notes as seen', async (_name, close) => {
    vi.mocked(whatsNewApi.pending).mockResolvedValue(notesOf())
    renderInApp(<WhatsNewHost />)
    await screen.findByRole('dialog')
    close()
    await waitFor(() => expect(whatsNewApi.markSeen).toHaveBeenCalledTimes(1))
  })

  it('is not even asked for in a development build', async () => {
    vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.12.1 (4.200-dev)', 'dev'))
    vi.mocked(whatsNewApi.pending).mockResolvedValue(notesOf())
    renderInApp(<WhatsNewHost />)
    await waitFor(() => expect(publicApi.version).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(whatsNewApi.pending).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not show notes written as HTML as markup', async () => {
    vi.mocked(whatsNewApi.pending).mockResolvedValue(
      notesOf({ summary: '<b>Zusammenfassung</b>', sections: [{ category: 'new', title: 'Neu', items: ['<img src=x onerror=alert(1)>'] }] }),
    )
    renderInApp(<WhatsNewHost />)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('img')).toBeNull()
    expect(dialog.querySelector('b')).toBeNull()
    expect(dialog).toHaveTextContent('<b>Zusammenfassung</b>')
  })

  it('keeps the notes readable by scrolling inside the dialog (long content stays inside the body)', async () => {
    const items = Array.from({ length: 60 }, (_, index) => `Eintrag ${index}`)
    vi.mocked(whatsNewApi.pending).mockResolvedValue(notesOf({ sections: [{ category: 'new', title: 'Neu', items }] }))
    renderInApp(<WhatsNewHost />)
    const body = await screen.findByTestId('whats-new-body')
    expect(body.parentElement?.className).toContain('overflow-y-auto')
  })
})

describe('"What is new" for reading later', () => {
  it('shows the notes of the running version on request', async () => {
    vi.mocked(whatsNewApi.current).mockResolvedValue(notesOf({ show: false }))
    renderInApp(<WhatsNewViewer open onClose={() => undefined} />)
    expect(await screen.findByRole('dialog', { name: 'Neu in v2026.12.1 (4.200)' })).toBeInTheDocument()
    expect(whatsNewApi.current).toHaveBeenCalledWith('de')
    expect(whatsNewApi.markSeen).not.toHaveBeenCalled()
  })

  it('says calmly that a version has no notes', async () => {
    vi.mocked(whatsNewApi.current).mockRejectedValue(new ApiError(404, { code: 'whats_new.not_available', detail: 'none' }))
    renderInApp(<WhatsNewViewer open onClose={() => undefined} />)
    expect(await screen.findByText('Für diese Version gibt es keine Versionshinweise.')).toBeInTheDocument()
    expect(screen.queryByTestId('error-notice')).toBeNull()
  })

  it('shows any other failure in full and copyable', async () => {
    vi.mocked(whatsNewApi.current).mockRejectedValue(new ApiError(500, { code: 'server.error', detail: 'boom' }))
    renderInApp(<WhatsNewViewer open onClose={() => undefined} />)
    const notice = await screen.findByTestId('error-notice')
    expect(within(notice).getByTestId('copy-button')).toBeInTheDocument()
  })
})
