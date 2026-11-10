import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { attachmentsApi } from '../../api/endpoints'
import type { Attachment } from '../../api/types'
import { ConfirmProvider } from '../../components/ui/ConfirmDialog'
import { ErrorDialogProvider } from '../../components/ui/ErrorDialog'
import { AttachmentsModal } from './AttachmentsModal'

vi.mock('../../api/endpoints', () => ({
  attachmentsApi: { list: vi.fn(), upload: vi.fn(), delete: vi.fn(), downloadUrl: vi.fn((id: string) => `/api/attachments/${id}/file`) },
  publicApi: { version: vi.fn().mockResolvedValue({ version: 'v2026.11.7 (1.2-dev)', short: 'v2026.11.7', channel: 'dev' }) },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const attachment: Attachment = {
  id: 'att1',
  title: 'Arbeitszeugnis Tech GmbH',
  fileName: 'zeugnis.pdf',
  category: 'Zeugnis',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  sortOrder: 0,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
}

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ConfirmProvider>
        <ErrorDialogProvider>
          <AttachmentsModal open onClose={vi.fn()} />
        </ErrorDialogProvider>
      </ConfirmProvider>
    </QueryClientProvider>,
  )
}

describe('AttachmentsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(attachmentsApi.list).mockResolvedValue([attachment])
  })

  it('translates the stored category and names the buttons after the document', async () => {
    renderModal()
    expect(await screen.findByRole('button', { name: 'Löschen: Arbeitszeugnis Tech GmbH' })).toBeInTheDocument()
    // The word "Arbeitszeugnis" is also an option of the category select; the badge is the one in the list.
    const row = screen.getByText('Arbeitszeugnis Tech GmbH').closest('li')!
    expect(within(row).getByText('Arbeitszeugnis')).toHaveClass('badge')
    expect(screen.getByRole('link', { name: /Ansehen.*Arbeitszeugnis Tech GmbH/ })).toHaveAttribute('href', '/api/attachments/att1/file')
    expect(screen.getByText('2 KB')).toBeInTheDocument()
  })

  it('suggests the file name as title and uploads with the chosen category', async () => {
    vi.mocked(attachmentsApi.upload).mockResolvedValue(attachment)
    renderModal()
    await screen.findByText('Arbeitszeugnis Tech GmbH')

    const file = new File(['%PDF'], 'Diplom 2020.pdf', { type: 'application/pdf' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(screen.getByLabelText('Bezeichnung')).toHaveValue('Diplom 2020')
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'Abschluss' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dokument speichern' }))

    await waitFor(() => expect(attachmentsApi.upload).toHaveBeenCalledWith(file, 'Diplom 2020', 'Abschluss'))
  })

  it('does not let a document be saved before a file is chosen', async () => {
    renderModal()
    await screen.findByText('Arbeitszeugnis Tech GmbH')
    expect(screen.getByRole('button', { name: 'Dokument speichern' })).toBeDisabled()
  })

  it('tells why an upload failed, complete, in the error dialog', async () => {
    vi.mocked(attachmentsApi.upload).mockRejectedValue(new ApiError(413, { status: 413, code: 'file.too_large', detail: 'The file exceeds the 20 MB limit.' }))
    renderModal()
    await screen.findByText('Arbeitszeugnis Tech GmbH')

    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'gross.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Dokument speichern' }))

    const dialog = await screen.findByTestId('error-dialog')
    expect(dialog).toHaveTextContent('20 MB')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Das Dokument konnte nicht hochgeladen werden.')
  })

  it('asks before a document is deleted', async () => {
    vi.mocked(attachmentsApi.delete).mockResolvedValue(undefined)
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: 'Löschen: Arbeitszeugnis Tech GmbH' }))

    const question = await screen.findByRole('alertdialog')
    expect(attachmentsApi.delete).not.toHaveBeenCalled()
    fireEvent.click(within(question).getByRole('button', { name: 'Löschen' }))
    await waitFor(() => expect(attachmentsApi.delete).toHaveBeenCalledWith('att1'))
  })

  it('shows a failed list with its reason instead of an empty list', async () => {
    vi.mocked(attachmentsApi.list).mockRejectedValue(new ApiError(500, { status: 500, code: 'internal' }))
    renderModal()
    expect(await screen.findByTestId('error-notice')).toHaveTextContent('Die Anlagen konnten nicht geladen werden.')
    expect(screen.queryByText(/Noch keine Anlagen hinterlegt/)).toBeNull()
  })
})
