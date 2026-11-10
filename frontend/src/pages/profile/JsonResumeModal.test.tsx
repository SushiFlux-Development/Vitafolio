import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { profileApi } from '../../api/endpoints'
import type { Profile } from '../../api/types'
import { ConfirmProvider } from '../../components/ui/ConfirmDialog'
import { ErrorDialogProvider } from '../../components/ui/ErrorDialog'
import { JsonResumeModal } from './JsonResumeModal'

vi.mock('../../api/endpoints', () => ({
  profileApi: { getJsonResume: vi.fn(), importJsonResume: vi.fn() },
  publicApi: { version: vi.fn().mockResolvedValue({ version: 'v2026.11.7 (1.2-dev)', short: 'v2026.11.7', channel: 'dev' }) },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const imported = { id: 'p1', firstName: 'Neu' } as Profile

function renderModal(props: { hasUnsavedPersonalData?: boolean; onImportSuccess?: (profile: Profile) => void } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ErrorDialogProvider>
      <ConfirmProvider>
        <JsonResumeModal open onClose={vi.fn()} onImportSuccess={props.onImportSuccess ?? vi.fn()} hasUnsavedPersonalData={props.hasUnsavedPersonalData ?? false} />
      </ConfirmProvider>
      </ErrorDialogProvider>
    </QueryClientProvider>,
  )
}

async function switchToImport() {
  await userEvent.click(screen.getByRole('radio', { name: 'Importieren' }))
}

// user-event's typing treats "{" as a key command, so JSON is entered through a change event.
const paste = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } })

describe('JsonResumeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock')
    global.URL.revokeObjectURL = vi.fn()
  })

  it('tells that text which is no JSON is wrong, before anything is sent', async () => {
    renderModal()
    await switchToImport()
    const field = screen.getByLabelText('Oder den JSON-Inhalt direkt einfügen')
    paste(field, '{ kaputt')
    fireEvent.blur(field)

    expect(screen.getByText('Das ist kein gültiges JSON-Objekt. Bitte den Inhalt prüfen.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Importieren' }))
    expect(profileApi.importJsonResume).not.toHaveBeenCalled()
  })

  it('imports without a question when nothing is replaced and nothing typed would be lost', async () => {
    vi.mocked(profileApi.importJsonResume).mockResolvedValue(imported)
    const onImportSuccess = vi.fn()
    renderModal({ onImportSuccess })
    await switchToImport()
    paste(screen.getByLabelText('Oder den JSON-Inhalt direkt einfügen'), '{"basics":{}}')
    fireEvent.click(screen.getByRole('button', { name: 'Importieren' }))

    await waitFor(() => expect(profileApi.importJsonResume).toHaveBeenCalledWith({ basics: {} }, false))
    expect(onImportSuccess).toHaveBeenCalledWith(imported)
    expect(await screen.findByText('Das Profil wurde aus der Datei übernommen.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks before the existing profile is replaced, and does nothing when the user says no', async () => {
    vi.mocked(profileApi.importJsonResume).mockResolvedValue(imported)
    renderModal()
    await switchToImport()
    paste(screen.getByLabelText('Oder den JSON-Inhalt direkt einfügen'), '{"basics":{}}')
    await userEvent.click(screen.getByRole('switch', { name: 'Bestehende Stationen und Kenntnisse ersetzen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Importieren' }))

    const question = await screen.findByRole('alertdialog')
    expect(question).toHaveTextContent('werden durch den Inhalt der Datei ersetzt')
    expect(profileApi.importJsonResume).not.toHaveBeenCalled()

    fireEvent.click(within(question).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(profileApi.importJsonResume).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Importieren' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Importieren' }))
    await waitFor(() => expect(profileApi.importJsonResume).toHaveBeenCalledWith({ basics: {} }, true))
  })

  it('warns that typed personal data is lost, even when nothing is replaced', async () => {
    renderModal({ hasUnsavedPersonalData: true })
    await switchToImport()
    paste(screen.getByLabelText('Oder den JSON-Inhalt direkt einfügen'), '{"basics":{}}')
    fireEvent.click(screen.getByRole('button', { name: 'Importieren' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Ihre ungespeicherten Änderungen bei den persönlichen Daten gehen dabei verloren.')
  })

  it('shows the real reason of a failed import, complete, in the dialog', async () => {
    vi.mocked(profileApi.importJsonResume).mockRejectedValue(new ApiError(422, { status: 422, code: 'validation.failed', detail: 'work[0].startDate fehlt' }))
    renderModal()
    await switchToImport()
    paste(screen.getByLabelText('Oder den JSON-Inhalt direkt einfügen'), '{"basics":{}}')
    fireEvent.click(screen.getByRole('button', { name: 'Importieren' }))

    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Der Import ist fehlgeschlagen.')
    // The server's own words are behind "Details" - complete, not shortened.
    fireEvent.click(within(notice).getByRole('button', { name: 'Details' }))
    expect(notice).toHaveTextContent('work[0].startDate fehlt')
  })

  it('shows a failed export with its reason in the error dialog, so nothing is laid over the buttons', async () => {
    vi.mocked(profileApi.getJsonResume).mockRejectedValue(new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank gesperrt' }))
    renderModal()
    await userEvent.click(screen.getByRole('button', { name: 'resume.json herunterladen' }))

    const dialog = await screen.findByTestId('error-dialog')
    expect(dialog).toHaveTextContent('Datenbank gesperrt')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Der Export ist fehlgeschlagen.')
    expect(screen.queryByTestId('alert-overlay')).toBeNull()
  })
})
