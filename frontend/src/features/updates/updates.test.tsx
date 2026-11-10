import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { publicApi, updatesApi } from '../../api/endpoints'
import { useRegisterUnsaved } from '../../hooks/unsavedRegistry'
import { useAutoSave } from '../../hooks/useAutoSave'
import { ADMIN, MEMBER, offeredStatus, statusOf, versionOf } from '../../test/fixtures'
import { renderInApp } from '../../test/render'
import { UpdateNavItem } from './UpdateNavItem'
import { UpdateProgressDialog } from './UpdateProgressDialog'
import { installTiming } from './useInstallUpdate'

vi.mock('../../api/endpoints', () => ({
  updatesApi: { status: vi.fn(), check: vi.fn(), setChannel: vi.fn(), install: vi.fn() },
  publicApi: { version: vi.fn() },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updatesApi.status).mockResolvedValue(statusOf())
  vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.11.12 (13.557)'))
})

/** A page that holds unsaved input, like a changed draft. */
function Draft() {
  useRegisterUnsaved(true)
  return <p>draft</p>
}

/** A form that saves by itself and has typed input waiting; `save` decides what the server does with it. */
function TypingForm({ save }: { save: () => Promise<unknown> }) {
  const form = useAutoSave<{ text: string }, unknown>({ initial: { text: '' }, save, isSendable: () => true })
  return <button onClick={() => form.setValue({ text: 'getippt' })}>tippen</button>
}

describe('update icon in the navigation', () => {
  it('is shown to an administrator when an update is available', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ host: 'server', canInstall: false }))
    renderInApp(<UpdateNavItem />, { mode: 'server' })
    const item = await screen.findByTestId('update-nav')
    expect(item).toHaveTextContent('Update verfügbar')
    expect(item).toHaveTextContent('v2026.12.1 (4.200)')
    // On a server it leads to the update page, not to an installer.
    expect(item).toHaveAttribute('href', '/admin?tab=updates')
  })

  it('is not shown when there is no update', async () => {
    renderInApp(<UpdateNavItem />)
    await waitFor(() => expect(updatesApi.status).toHaveBeenCalled())
    expect(screen.queryByTestId('update-nav')).toBeNull()
  })

  it('is never shown in a development build, even if the server names a newer version', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ state: 'devBuild', currentChannel: 'dev' }))
    renderInApp(<UpdateNavItem />)
    await waitFor(() => expect(updatesApi.status).toHaveBeenCalled())
    expect(screen.queryByTestId('update-nav')).toBeNull()
  })

  it('is not shown when the running version cannot be compared', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ state: 'unknownVersion' }))
    renderInApp(<UpdateNavItem />)
    await waitFor(() => expect(updatesApi.status).toHaveBeenCalled())
    expect(screen.queryByTestId('update-nav')).toBeNull()
  })

  it('is not shown to somebody who may not manage updates, and the status is not even asked for', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus())
    renderInApp(<UpdateNavItem />, { mode: 'server', user: MEMBER })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByTestId('update-nav')).toBeNull()
    expect(updatesApi.status).not.toHaveBeenCalled()
  })

  it('is shown in the Windows program as a button that installs after the question', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus())
    renderInApp(<UpdateNavItem />, { mode: 'desktop', user: ADMIN })
    const item = await screen.findByTestId('update-nav')
    expect(item.tagName).toBe('BUTTON')
  })

  it('opens the settings page in the Windows program when the copy cannot install itself', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ canInstall: false }))
    renderInApp(<UpdateNavItem />, { mode: 'desktop' })
    expect(await screen.findByTestId('update-nav')).toHaveAttribute('href', '/settings?tab=updates')
  })
})

describe('one-click install in the Windows program', () => {
  beforeEach(() => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus())
  })

  it('asks first, naming the version and what happens, and does nothing when cancelled', async () => {
    renderInApp(<UpdateNavItem />, { mode: 'desktop' })
    fireEvent.click(await screen.findByTestId('update-nav'))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Update auf v2026.12.1 (4.200) installieren?')
    expect(dialog).toHaveTextContent('legt es eine Sicherung Ihrer Daten an, schließt sich und startet in der neuen Version neu')
    expect(within(dialog).queryByTestId('install-unsaved-warning')).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(updatesApi.install).not.toHaveBeenCalled()
  })

  it('starts the run after the confirmation', async () => {
    vi.mocked(updatesApi.install).mockResolvedValue(offeredStatus({ install: { state: 'downloading', progress: 0, targetTag: 'v2026.12.1', targetDisplay: 'v2026.12.1 (4.200)' } }))
    renderInApp(<UpdateNavItem />, { mode: 'desktop' })
    fireEvent.click(await screen.findByTestId('update-nav'))
    fireEvent.click(await screen.findByRole('button', { name: 'Installieren' }))
    await waitFor(() => expect(updatesApi.install).toHaveBeenCalledTimes(1))
  })

  it('says before the restart that there is unsaved input, and offers to stay', async () => {
    renderInApp(
      <>
        <Draft />
        <UpdateNavItem />
      </>,
      { mode: 'desktop' },
    )
    fireEvent.click(await screen.findByTestId('update-nav'))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByTestId('install-unsaved-warning')).toHaveTextContent('nicht gespeichert')
    // The risky answer is named for what it does, and the focus starts on "cancel".
    expect(within(dialog).getByRole('button', { name: 'Trotzdem installieren' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(updatesApi.install).not.toHaveBeenCalled()
  })

  describe('with forms that save by themselves', () => {
    afterEach(() => {
      installTiming.flushWaitMs = 5000
    })

    it('sends what is waiting before it asks, and does not warn when the server took it', async () => {
      const save = vi.fn().mockResolvedValue({})
      renderInApp(
        <>
          <TypingForm save={save} />
          <UpdateNavItem />
        </>,
        { mode: 'desktop' },
      )
      fireEvent.click(screen.getByRole('button', { name: 'tippen' }))
      expect(save).not.toHaveBeenCalled() // still in the quiet period
      fireEvent.click(await screen.findByTestId('update-nav'))

      const dialog = await screen.findByRole('alertdialog')
      expect(save).toHaveBeenCalledTimes(1)
      expect(within(dialog).queryByTestId('install-unsaved-warning')).toBeNull()
      expect(within(dialog).getByRole('button', { name: 'Installieren' })).toBeInTheDocument()
    })

    it('warns when the input could not be sent, and says what happens to it', async () => {
      const save = vi.fn().mockRejectedValue(new ApiError(500, { status: 500, code: 'internal' }))
      renderInApp(
        <>
          <TypingForm save={save} />
          <UpdateNavItem />
        </>,
        { mode: 'desktop' },
      )
      fireEvent.click(screen.getByRole('button', { name: 'tippen' }))
      fireEvent.click(await screen.findByTestId('update-nav'))

      const dialog = await screen.findByRole('alertdialog')
      expect(save).toHaveBeenCalledTimes(1)
      const warning = within(dialog).getByTestId('install-unsaved-warning')
      expect(warning).toHaveTextContent('Eingaben in einem offenen Fenster gehen beim Neustart verloren')
      expect(warning).toHaveTextContent('bleiben als Kopie auf diesem Rechner')
      expect(warning).not.toHaveTextContent('speichern Sie zuerst')
    })

    it('does not wait for ever for a send that hangs: after the waiting time the input counts as not sent', async () => {
      installTiming.flushWaitMs = 300
      const save = vi.fn(() => new Promise<never>(() => undefined))
      renderInApp(
        <>
          <TypingForm save={save} />
          <UpdateNavItem />
        </>,
        { mode: 'desktop' },
      )
      fireEvent.click(screen.getByRole('button', { name: 'tippen' }))
      fireEvent.click(await screen.findByTestId('update-nav'))

      const dialog = await screen.findByRole('alertdialog')
      expect(save).toHaveBeenCalledTimes(1)
      expect(within(dialog).getByTestId('install-unsaved-warning')).toBeInTheDocument()
    })
  })

  it('installs after "Trotzdem installieren" despite unsaved input', async () => {
    vi.mocked(updatesApi.install).mockResolvedValue(offeredStatus())
    renderInApp(
      <>
        <Draft />
        <UpdateNavItem />
      </>,
      { mode: 'desktop' },
    )
    fireEvent.click(await screen.findByTestId('update-nav'))
    fireEvent.click(await screen.findByRole('button', { name: 'Trotzdem installieren' }))
    await waitFor(() => expect(updatesApi.install).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['backup', 'Gerade läuft eine Sicherung. Warten Sie, bis sie fertig ist'],
    ['restore', 'Gerade wird eine Sicherung wiederhergestellt.'],
  ])('shows why a run is refused while a %s is running', async (reason, text) => {
    vi.mocked(updatesApi.install).mockRejectedValue(new ApiError(409, { code: 'updates.busy', detail: 'busy', params: { reason } }))
    renderInApp(<UpdateNavItem />, { mode: 'desktop' })
    fireEvent.click(await screen.findByTestId('update-nav'))
    fireEvent.click(await screen.findByRole('button', { name: 'Installieren' }))

    const error = await screen.findByTestId('error-dialog')
    expect(error).toHaveTextContent(text)
    // The complete technical text can be copied.
    expect(within(error.closest('[role="alertdialog"]') as HTMLElement).getByTestId('copy-button')).toBeInTheDocument()
  })
})

describe('progress dialog', () => {
  it('shows the download with its percentage and cannot be dismissed while the run is under way', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(
      offeredStatus({ install: { state: 'downloading', progress: 42, targetTag: 'v2026.12.1', targetDisplay: 'v2026.12.1 (4.200)' } }),
    )
    renderInApp(<UpdateProgressDialog />, { mode: 'desktop' })

    const bar = await screen.findByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('42 %')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Update auf v2026.12.1 (4.200)')
    expect(screen.queryByRole('button', { name: 'Schließen' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('names the backup and the restart steps', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ install: { state: 'restarting', targetTag: 'v2026.12.1', targetDisplay: 'v2026.12.1 (4.200)', backupFile: 'b.zip' } }))
    renderInApp(<UpdateProgressDialog />, { mode: 'desktop' })
    expect(await screen.findByTestId('update-progress')).toHaveTextContent('Das Programm schließt sich jetzt')
  })

  it('shows a failed run complete and copyable, says nothing was touched, and can be closed', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(
      offeredStatus({
        install: {
          state: 'failed',
          targetTag: 'v2026.12.1',
          errorCode: 'updates.checksum_failed',
          error: 'Checksum mismatch',
          errorDetails: 'System.InvalidOperationException: Checksum mismatch\n   at Package.Verify()\n   at Update.Run()',
          backupFile: null,
        },
      }),
    )
    renderInApp(<UpdateProgressDialog />, { mode: 'desktop' })

    const failed = await screen.findByTestId('update-failed')
    expect(failed).toHaveTextContent('die Prüfsumme stimmt nicht')
    expect(failed).toHaveTextContent('Ihre installierte Version und Ihre Daten sind unverändert.')
    expect(within(failed).getByTestId('copy-button')).toBeInTheDocument()
    // The technical text is complete behind the expander.
    fireEvent.click(within(failed).getByRole('button', { name: 'Details' }))
    expect(failed).toHaveTextContent('at Update.Run()')

    fireEvent.click(screen.getAllByRole('button', { name: 'Schließen' })[0]!)
    await waitFor(() => expect(screen.queryByTestId('update-failed')).toBeNull())
  })

  it('offers another try after a failure while the update is still offered', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ install: { state: 'failed', errorCode: 'updates.download_failed', error: 'x', errorDetails: 'x' } }))
    vi.mocked(updatesApi.install).mockResolvedValue(offeredStatus())
    renderInApp(<UpdateProgressDialog />, { mode: 'desktop' })
    fireEvent.click(await screen.findByRole('button', { name: 'Noch einmal versuchen' }))
    // The question comes again before anything is started.
    expect(await screen.findByRole('alertdialog', { name: /installieren\?/ })).toBeInTheDocument()
  })

  it('draws nothing for somebody who may not manage updates', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ install: { state: 'downloading', progress: 5 } }))
    renderInApp(<UpdateProgressDialog />, { mode: 'server', user: MEMBER })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
