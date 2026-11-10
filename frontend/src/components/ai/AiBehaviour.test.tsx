import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { aiApi } from '../../api/endpoints'
import type { AiConfig } from '../../api/types'
import { ConfirmProvider } from '../ui/ConfirmDialog'
import { AiAssistantModal } from './AiAssistantModal'
import { AiSettingsModal } from './AiSettingsModal'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const copyPasteConfig: AiConfig = { provider: 'copy_paste', model: '', baseUrl: null, hasApiKey: false, pseudonymize: true }
const openAiConfig: AiConfig = { provider: 'openai', model: 'mein-modell', baseUrl: null, hasApiKey: true, pseudonymize: true }

vi.mock('../../api/endpoints', () => ({
  aiApi: {
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    testConnection: vi.fn(),
    buildPrompt: vi.fn(),
    parseResponse: vi.fn(),
    generate: vi.fn(),
  },
  publicApi: { version: vi.fn().mockResolvedValue({ version: 'v2026.11.7 (1.2-dev)', short: 'v2026.11.7', channel: 'dev' }) },
}))

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  )
}

describe('AiSettingsModal behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(aiApi.getConfig).mockResolvedValue(copyPasteConfig)
  })

  it('does not carry the model name of one provider over to another (no stale IDs are filled in)', async () => {
    vi.mocked(aiApi.getConfig).mockResolvedValue(openAiConfig)
    vi.mocked(aiApi.saveConfig).mockResolvedValue(openAiConfig)
    render(<AiSettingsModal open onClose={vi.fn()} />, { wrapper: wrapper() })

    const select = await screen.findByRole('combobox')
    expect(screen.getByLabelText('Modell')).toHaveValue('mein-modell')
    fireEvent.change(select, { target: { value: 'anthropic' } })

    expect(screen.getByLabelText('Modell')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen speichern' }))
    // An empty model is sent as it is: the server then uses the default of the provider instead of keeping the old name.
    await waitFor(() => expect(aiApi.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', model: '' })))
  })

  it('needs a model name for a local service and says so while typing the address', async () => {
    render(<AiSettingsModal open onClose={vi.fn()} />, { wrapper: wrapper() })
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'ollama' } })

    const address = screen.getByLabelText('Basis-URL / Server-Adresse')
    expect(address).toHaveValue('http://localhost:11434')
    fireEvent.change(address, { target: { value: 'ftp://x' } })
    expect(screen.getByText('Bitte einen Link mit http:// oder https:// eingeben.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen speichern' }))
    expect(aiApi.saveConfig).not.toHaveBeenCalled()
    expect(screen.getByText('Bitte den Modellnamen eingeben.')).toBeInTheDocument()
  })

  it('saves a changed form before it tests, because the server tests what is stored', async () => {
    vi.mocked(aiApi.saveConfig).mockResolvedValue(openAiConfig)
    vi.mocked(aiApi.testConnection).mockResolvedValue({ success: true, message: null })
    render(<AiSettingsModal open onClose={vi.fn()} />, { wrapper: wrapper() })

    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'openai' } })
    fireEvent.change(screen.getByPlaceholderText(/Neuen Schlüssel eingeben/i), { target: { value: 'sk-test' } })
    expect(screen.getByText(/Geänderte Angaben werden vorher gespeichert/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }))

    await waitFor(() => expect(aiApi.testConnection).toHaveBeenCalled())
    expect(vi.mocked(aiApi.saveConfig).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(aiApi.testConnection).mock.invocationCallOrder[0]!)
    expect(await screen.findByText('Verbindung erfolgreich hergestellt!')).toBeInTheDocument()
  })

  it('shows a failed connection test completely and copyable, translated by its code', async () => {
    vi.mocked(aiApi.getConfig).mockResolvedValue(openAiConfig)
    vi.mocked(aiApi.testConnection).mockResolvedValue({ success: false, message: 'Provider said no', code: 'ai.host_not_allowed' })
    render(<AiSettingsModal open onClose={vi.fn()} />, { wrapper: wrapper() })

    fireEvent.click(await screen.findByRole('button', { name: 'Verbindung testen' }))

    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Der Verbindungstest ist fehlgeschlagen.')
    expect(within(notice).getByTestId('copy-button')).toBeInTheDocument()
  })

  it('keeps what was typed when the stored settings are reloaded after a save', async () => {
    vi.mocked(aiApi.getConfig).mockResolvedValue(openAiConfig)
    vi.mocked(aiApi.saveConfig).mockResolvedValue(openAiConfig)
    vi.mocked(aiApi.testConnection).mockResolvedValue({ success: true, message: null })
    render(<AiSettingsModal open onClose={vi.fn()} />, { wrapper: wrapper() })

    fireEvent.change(await screen.findByLabelText('Modell'), { target: { value: 'ein-anderes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }))
    await waitFor(() => expect(aiApi.testConnection).toHaveBeenCalled())

    expect(screen.getByLabelText('Modell')).toHaveValue('ein-anderes')
  })
})

describe('AiAssistantModal behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(aiApi.getConfig).mockResolvedValue(copyPasteConfig)
  })

  it('closes only the settings dialog on Esc when it was opened from the assistant', async () => {
    const onClose = vi.fn()
    render(<AiAssistantModal open onClose={onClose} task="analyze_job" />, { wrapper: wrapper() })

    fireEvent.click(await screen.findByRole('button', { name: 'Ändern' }))
    expect(await screen.findByText('KI-Einstellungen')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('KI-Einstellungen')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('offers the prompt for copying by hand when the clipboard is not available', async () => {
    vi.mocked(aiApi.buildPrompt).mockResolvedValue({ task: 'analyze_job', systemPrompt: 's', userPrompt: 'u', fullCopyPasteText: 'Der ganze Prompt', pseudonymized: true })
    // No clipboard and no way to copy by script: the situation of a plain-http page on a home network.
    Object.assign(navigator, { clipboard: undefined })
    document.execCommand = vi.fn(() => false)
    render(<AiAssistantModal open onClose={vi.fn()} task="analyze_job" />, { wrapper: wrapper() })

    fireEvent.click(await screen.findByRole('button', { name: /1\. Prompt kopieren/i }))

    expect(await screen.findByText(/Das Kopieren in die Zwischenablage hat nicht funktioniert/)).toBeInTheDocument()
    expect(screen.getByLabelText('Vorbereiteter Prompt')).toHaveValue('Der ganze Prompt')
  })

  it('shows a failed request in full instead of doing nothing', async () => {
    vi.mocked(aiApi.getConfig).mockResolvedValue(openAiConfig)
    vi.mocked(aiApi.generate).mockRejectedValue(new ApiError(502, { status: 502, code: 'ai.provider_error', detail: 'Provider returned 401' }))
    render(<AiAssistantModal open onClose={vi.fn()} task="analyze_job" initialJobTitle="Cloud" />, { wrapper: wrapper() })

    fireEvent.click(await screen.findByRole('button', { name: 'Vorschlag generieren' }))

    expect(await screen.findByTestId('error-notice')).toHaveTextContent('Die KI-Anfrage ist fehlgeschlagen.')
  })

  it('tells a failed evaluation of a pasted answer', async () => {
    vi.mocked(aiApi.parseResponse).mockRejectedValue(new ApiError(422, { status: 422, code: 'ai.invalid_response', detail: 'No JSON found' }))
    render(<AiAssistantModal open onClose={vi.fn()} task="analyze_job" />, { wrapper: wrapper() })

    fireEvent.change(await screen.findByPlaceholderText(/Fügen Sie die vollständige Antwort/i), { target: { value: 'kein json' } })
    fireEvent.click(screen.getByRole('button', { name: /3\. Antwort auswerten/i }))

    expect(await screen.findByTestId('error-notice')).toHaveTextContent('Die Antwort konnte nicht ausgewertet werden.')
  })

  it('keeps a pasted answer that is no JSON in the flow, so the button to try again stays free', async () => {
    vi.mocked(aiApi.parseResponse).mockRejectedValue(new ApiError(422, { status: 422, code: 'ai.invalid_json' }))
    render(<AiAssistantModal open onClose={vi.fn()} task="analyze_job" />, { wrapper: wrapper() })

    fireEvent.change(await screen.findByPlaceholderText(/Fügen Sie die vollständige Antwort/i), { target: { value: 'kein json' } })
    fireEvent.click(screen.getByRole('button', { name: /3\. Antwort auswerten/i }))

    expect(await screen.findByTestId('error-notice')).toHaveTextContent('kein gültiges JSON')
    expect(screen.queryByTestId('alert-overlay')).toBeNull()
  })

  it('tells the match level in words next to the percentage, not by colour alone', async () => {
    vi.mocked(aiApi.parseResponse).mockResolvedValue({ matchScore: 55, summary: 'x', matchedRequirements: [], missingRequirements: [], tips: [] })
    render(<AiAssistantModal open onClose={vi.fn()} task="analyze_job" />, { wrapper: wrapper() })

    fireEvent.change(await screen.findByPlaceholderText(/Fügen Sie die vollständige Antwort/i), { target: { value: '{}' } })
    fireEvent.click(screen.getByRole('button', { name: /3\. Antwort auswerten/i }))

    expect(await screen.findByText('55 %')).toBeInTheDocument()
    expect(screen.getByText('Geringe Passung')).toBeInTheDocument()
  })
})

describe('AiAssistantModal reserved room', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(aiApi.getConfig).mockResolvedValue(copyPasteConfig)
  })

  it('keeps the copy button wide enough for both labels and room for both answers, so "copied" moves nothing', async () => {
    vi.mocked(aiApi.buildPrompt).mockResolvedValue({ task: 'analyze_job', systemPrompt: 's', userPrompt: 'u', fullCopyPasteText: 'Prompt', pseudonymized: true })
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    render(<AiAssistantModal open onClose={vi.fn()} task="analyze_job" />, { wrapper: wrapper() })

    const button = await screen.findByRole('button', { name: /1\. Prompt kopieren/i })
    // The label of the other state is in the button as invisible, hidden text, so its width is the longer one
    const hidden = Array.from(button.querySelectorAll('[aria-hidden="true"].invisible')).map((node) => node.textContent)
    expect(hidden).toContain('Kopiert')
    // Both answers (confirmation and failure) are reserved invisibly in the one place of the notice
    const reserved = Array.from(document.querySelectorAll('[data-reserved]')).map((node) => node.getAttribute('data-reserved'))
    expect(reserved).toEqual(expect.arrayContaining([expect.stringMatching(/kopiert/i), expect.stringMatching(/Zwischenablage/)]))
  })
})
