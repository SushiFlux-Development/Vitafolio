import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import type { BackupEntry } from '../../api/types'
import { ErrorDialogProvider } from '../../components/ui/ErrorDialog'
import { BackupList } from './BackupList'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const entries: BackupEntry[] = [
  { id: 'b1', file: 'app-1.db', createdAt: '2026-11-04T12:00:00Z', sizeBytes: 1000, kind: 'manual', tier: 'recent' },
  { id: 'b2', file: 'app-2.db', createdAt: '2026-11-03T12:00:00Z', sizeBytes: 1000, kind: 'uploaded', tier: 'recent' },
]

function renderList(over: { desktop?: boolean; twoFactor?: boolean; onChanged?: () => void; entries?: BackupEntry[]; maxUploadBytes?: number } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ErrorDialogProvider>
        <BackupList entries={over.entries ?? entries} maxUploadBytes={over.maxUploadBytes} desktop={over.desktop ?? false} twoFactor={over.twoFactor ?? false} onChanged={over.onChanged ?? (() => undefined)} language="de" />
      </ErrorDialogProvider>
    </QueryClientProvider>,
  )
}

describe('backups of earlier versions (database only)', () => {
  const old: BackupEntry = { id: 'b3', file: 'app-3.db', createdAt: '2026-11-02T12:00:00Z', sizeBytes: 1000, kind: 'manual', tier: 'recent', format: 'database' }
  const full: BackupEntry = { id: 'b4', file: 'app-4.zip', createdAt: '2026-11-03T12:00:00Z', sizeBytes: 1000, kind: 'manual', tier: 'recent', format: 'archive' }

  it('marks only the old ones in the list', () => {
    renderList({ entries: [full, old] })
    expect(screen.getAllByText('Nur Datenbank')).toHaveLength(1)
  })

  it('says in the restore dialog that the files stay as they are', async () => {
    const user = userEvent.setup()
    renderList({ entries: [old] })
    await user.click(screen.getByTestId('restore'))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('bleiben, wie sie jetzt sind')
  })

  it('does not say so for a complete backup', async () => {
    const user = userEvent.setup()
    renderList({ entries: [full] })
    await user.click(screen.getByTestId('restore'))
    expect(await screen.findByRole('alertdialog')).not.toHaveTextContent('bleiben, wie sie jetzt sind')
  })
})

describe('kind of a backup', () => {
  it.each([
    ['pre-update', 'Vor Update'],
    ['pre-restore', 'Vor Wiederherstellung'],
    ['shutdown', 'Vor dem Beenden'],
  ])('names the kind %s in words, never as the raw code', (kind, text) => {
    renderList({ entries: [{ id: 'k1', file: 'app-k.zip', createdAt: '2026-11-04T12:00:00Z', sizeBytes: 1000, kind, tier: 'recent', format: 'archive' }] })
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.queryByText(kind)).toBeNull()
  })
})

describe('the upload limit', () => {
  it('comes from the server', async () => {
    const user = userEvent.setup()
    renderList({ maxUploadBytes: 1024 })
    await user.upload(screen.getByTestId('upload-input'), new File([new Uint8Array(2048)], 'gross.zip'))
    expect(await screen.findByText('Die Datei ist zu groß: 2 KB (erlaubt sind höchstens 1 KB).')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('deleting a backup', () => {
  it('has a red Löschen button per backup', () => {
    renderList()
    const buttons = screen.getAllByTestId('delete-backup')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveClass('btn-danger-outline')
  })

  it('asks in the step-up dialog, names the backup and says it cannot be undone', async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getAllByTestId('delete-backup')[1]!)
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Sicherung löschen')
    expect(dialog).toHaveTextContent('Hochgeladen')
    expect(dialog).toHaveTextContent('Das lässt sich nicht rückgängig machen.')
    expect(within(dialog).getByTestId('reauth-confirm')).toHaveClass('btn-danger')
    expect(within(dialog).getByLabelText('Ihr aktuelles Passwort')).toBeInTheDocument()
  })

  it('sends DELETE for exactly that backup with password and code, then reports and refreshes', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const fetchMock = vi.fn((_path: string, _init?: RequestInit) => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchMock)
    renderList({ twoFactor: true, onChanged })
    await user.click(screen.getAllByTestId('delete-backup')[0]!)
    const dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByLabelText('Ihr aktuelles Passwort'), 'my password')
    await user.type(within(dialog).getByLabelText('Code aus der Authenticator-App'), '123456')
    await user.click(within(dialog).getByTestId('reauth-confirm'))
    // The error dialog's provider also asks for the version once; only the DELETE is of interest here.
    const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')
    await waitFor(() => expect(deletes()).toHaveLength(1))
    const [path, init] = deletes()[0]!
    expect(path).toBe('/api/admin/backups/b1')
    expect(JSON.parse(String(init?.body))).toEqual({ password: 'my password', code: '123456' })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(await screen.findByText('Gelöscht: app-1.db')).toBeInTheDocument()
  })

  it('does not ask for a password in the desktop program (the local owner), but still for the confirmation', async () => {
    const user = userEvent.setup()
    renderList({ desktop: true })
    await user.click(screen.getAllByTestId('delete-backup')[0]!)
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).queryByLabelText('Ihr aktuelles Passwort')).toBeNull()
    expect(within(dialog).getByTestId('reauth-confirm')).toBeInTheDocument()
  })

  it('keeps the dialog open and shows the refusal when the password is wrong', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ code: 'auth.reauth_failed' }), { status: 403, headers: { 'Content-Type': 'application/json' } }))),
    )
    renderList()
    await user.click(screen.getAllByTestId('delete-backup')[0]!)
    const dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByLabelText('Ihr aktuelles Passwort'), 'wrong')
    await user.click(within(dialog).getByTestId('reauth-confirm'))
    expect(await within(dialog).findByText('Passwort oder Code stimmt nicht. Es wurde nichts verändert.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
