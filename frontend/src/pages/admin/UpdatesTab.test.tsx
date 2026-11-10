import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { publicApi, updatesApi } from '../../api/endpoints'
import { ABOUT, offeredStatus, statusOf, versionOf } from '../../test/fixtures'
import { renderInApp } from '../../test/render'
import { UpdatesTab } from './UpdatesTab'

vi.mock('../../api/endpoints', () => ({
  updatesApi: { status: vi.fn(), check: vi.fn(), setChannel: vi.fn(), install: vi.fn() },
  publicApi: { version: vi.fn(), about: vi.fn() },
  whatsNewApi: { current: vi.fn(), pending: vi.fn(), markSeen: vi.fn() },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.11.12 (13.557)'))
  vi.mocked(publicApi.about).mockResolvedValue(ABOUT)
  vi.mocked(updatesApi.status).mockResolvedValue(statusOf())
})

describe('update page: channel', () => {
  it('starts on the standard (releases only) and explains it', async () => {
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    const group = await screen.findByRole('radiogroup', { name: 'Update-Kanal' })
    expect(within(group).getByRole('radio', { name: 'Standard' })).toBeChecked()
    expect(screen.getByTestId('update-channel-text')).toHaveTextContent('nur fertige Versionen (Releases)')
    expect(screen.getByText('Noch kein Kanal gewählt: Es gilt der Standard.')).toBeInTheDocument()
  })

  it.each([
    ['Beta', 'beta', 'Beta-Versionen zum Ausprobieren und außerdem alle fertigen Versionen'],
    ['Nightly', 'nightly', 'jede Änderung so schnell wie möglich und außerdem alle fertigen Versionen'],
  ])('saves the %s channel and shows its explanation', async (label, value, explanation) => {
    vi.mocked(updatesApi.setChannel).mockResolvedValue(statusOf({ channel: value as 'beta' | 'nightly', channelSaved: true }))
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    fireEvent.click(await screen.findByRole('radio', { name: label }))

    await waitFor(() => expect(updatesApi.setChannel).toHaveBeenCalledWith(value))
    await waitFor(() => expect(screen.getByTestId('update-channel-text')).toHaveTextContent(explanation))
    expect(screen.getByRole('radio', { name: label })).toBeChecked()
    expect(screen.queryByText('Noch kein Kanal gewählt: Es gilt der Standard.')).toBeNull()
  })

  it('names the image tag Docker and Unraid need for the channel', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(statusOf({ host: 'server', channel: 'beta', channelSaved: true, dockerTag: 'beta', canInstall: false }))
    renderInApp(<UpdatesTab />, { mode: 'server' })
    expect(await screen.findByText(/muss der Container das Image „ghcr.io\/example\/vitafolio:beta“ verwenden/)).toBeInTheDocument()
    expect(screen.getByTestId('docker-command')).toHaveTextContent('docker pull ghcr.io/example/vitafolio:beta')
  })

  it('shows a failed save of the channel in full', async () => {
    vi.mocked(updatesApi.setChannel).mockRejectedValue(new ApiError(500, { code: 'server.error', detail: 'db locked' }))
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    fireEvent.click(await screen.findByRole('radio', { name: 'Nightly' }))
    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Der Update-Kanal konnte nicht gespeichert werden.')
    expect(within(notice).getByTestId('copy-button')).toBeInTheDocument()
  })
})

describe('update page: status', () => {
  it('always lets the user search for updates and shows the answer', async () => {
    vi.mocked(updatesApi.check).mockResolvedValue(offeredStatus())
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    expect(screen.queryByTestId('update-available')).toBeNull()
    fireEvent.click(await screen.findByTestId('updates-check'))

    await waitFor(() => expect(updatesApi.check).toHaveBeenCalledTimes(1))
    const card = await screen.findByTestId('update-available')
    expect(card).toHaveTextContent('v2026.12.1 (4.200)')
  })

  it('can search even in a development build, and says that it offers nothing', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(statusOf({ state: 'devBuild', currentChannel: 'dev', canInstall: false }))
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    expect(await screen.findByText(/Dies ist ein Entwicklungsstand/)).toBeInTheDocument()
    expect(screen.getByTestId('updates-check')).toBeEnabled()
  })

  it('explains a version that cannot be compared instead of offering something', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ state: 'unknownVersion' }))
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    expect(await screen.findByText(/lässt sich nicht mit den veröffentlichten Versionen vergleichen/)).toBeInTheDocument()
    expect(screen.queryByTestId('update-available')).toBeNull()
  })

  it('shows the failure of a check in full and copyable', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(statusOf({ state: 'error', error: 'GitHub answered 403: rate limit exceeded for 203.0.113.9' }))
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('rate limit exceeded for 203.0.113.9')
    expect(within(notice).getByTestId('copy-button')).toBeInTheDocument()
  })

  it('takes the link to all releases from the source address the server names, not from a fixed one', async () => {
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    const link = await screen.findByRole('link', { name: /Alle Veröffentlichungen/ })
    expect(link).toHaveAttribute('href', 'https://example.com/org/vitafolio/releases')
  })

  it('uses the release link for the manual download when the copy cannot install itself', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ canInstall: false }))
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    expect(await screen.findByText(/nicht mit dem Setup-Programm installiert/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Zu den GitHub Releases/ })).toHaveAttribute('href', 'https://example.com/org/vitafolio/releases')
  })

  it('does not turn a foreign address in the release data into a link', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ available: { tag: 'v1', display: 'v1', channel: 'release', htmlUrl: 'javascript:alert(1)', notes: '<img src=x onerror=alert(1)>' } }))
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    const card = await screen.findByTestId('update-available')
    expect(within(card).queryByRole('link')).toBeNull()
    // The notes are text, never markup.
    expect(card.querySelector('img')).toBeNull()
    expect(card).toHaveTextContent('<img src=x onerror=alert(1)>')
  })

  it('shows a failed install run that is still in the status, complete and copyable', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(
      offeredStatus({ install: { state: 'failed', errorCode: 'updates.no_package', error: 'No package', errorDetails: 'No package for channel nightly' } }),
    )
    renderInApp(<UpdatesTab />, { mode: 'desktop' })
    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('kein Installationspaket für den gewählten Kanal')
  })
})
