import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { aiApi, profileApi, publicApi } from '../../api/endpoints'
import type { AdminAiConfig, AiConfig, Profile } from '../../api/types'
import { replaceBullet } from '../../features/ai/bullets'
import { AiServerSection } from '../../pages/admin/AiServerSection'
import { ExperiencesTab } from '../../pages/profile/ExperiencesTab'
import { PersonalTab } from '../../pages/profile/PersonalTab'
import { usePersonalForm } from '../../pages/profile/usePersonalForm'
import { renderInApp } from '../../test/render'
import { versionOf } from '../../test/fixtures'
import { AiAssistantModal } from './AiAssistantModal'
import { AiSettingsModal } from './AiSettingsModal'

vi.mock('../../api/endpoints', () => ({
  aiApi: {
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    testConnection: vi.fn(),
    buildPrompt: vi.fn(),
    parseResponse: vi.fn(),
    generate: vi.fn(),
    getAdminConfig: vi.fn(),
    saveAdminConfig: vi.fn(),
  },
  profileApi: { update: vi.fn(), uploadPhoto: vi.fn(), deletePhoto: vi.fn(), addExperience: vi.fn(), updateExperience: vi.fn(), deleteExperience: vi.fn(), reorderExperiences: vi.fn() },
  publicApi: { version: vi.fn() },
}))

const copyPaste: AiConfig = { provider: 'copy_paste', model: '', baseUrl: null, hasApiKey: false, pseudonymize: true }
const openAi: AiConfig = { provider: 'openai', model: 'mein-modell', baseUrl: null, hasApiKey: true, pseudonymize: true }

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.11.12 (13.557)'))
  vi.mocked(aiApi.getConfig).mockResolvedValue(copyPaste)
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('LM Studio as an own provider', () => {
  it('is listed next to Ollama', async () => {
    renderInApp(<AiSettingsModal open onClose={vi.fn()} />)
    const select = await screen.findByRole('combobox')
    const values = [...(select as HTMLSelectElement).options].map((option) => option.value)
    expect(values).toEqual(['copy_paste', 'openai', 'anthropic', 'gemini', 'ollama', 'lmstudio', 'custom'])
    expect(screen.getByRole('option', { name: /^LM Studio/ })).toBeInTheDocument()
  })

  it('fills in the usual address of LM Studio, needs a model name and no API key', async () => {
    vi.mocked(aiApi.saveConfig).mockResolvedValue(copyPaste)
    renderInApp(<AiSettingsModal open onClose={vi.fn()} />)
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'lmstudio' } })

    expect(screen.getByLabelText('Basis-URL / Server-Adresse')).toHaveValue('http://localhost:1234/v1')
    expect(screen.queryByLabelText('API-Schlüssel')).toBeNull()

    // The model name has to be entered, the rule shows while the form is submitted.
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen speichern' }))
    expect(aiApi.saveConfig).not.toHaveBeenCalled()
    expect(screen.getByText('Bitte den Modellnamen eingeben.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Modell'), { target: { value: 'qwen2.5-7b-instruct' } })
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen speichern' }))
    await waitFor(() =>
      expect(aiApi.saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'lmstudio', model: 'qwen2.5-7b-instruct', baseUrl: 'http://localhost:1234/v1', apiKey: undefined }),
      ),
    )
  })

  it('keeps Ollama on its own port and leaves the free endpoint without a preset address', async () => {
    renderInApp(<AiSettingsModal open onClose={vi.fn()} />)
    const select = await screen.findByRole('combobox')
    fireEvent.change(select, { target: { value: 'ollama' } })
    expect(screen.getByLabelText('Basis-URL / Server-Adresse')).toHaveValue('http://localhost:11434')
    fireEvent.change(select, { target: { value: 'custom' } })
    expect(screen.getByLabelText('Basis-URL / Server-Adresse')).toHaveValue('')
    expect(screen.getByLabelText('API-Schlüssel')).toBeInTheDocument()
  })
})

describe('assistant: every task has the copy and paste way', () => {
  it('offers copy and paste next to direct generation when a service is set up', async () => {
    vi.mocked(aiApi.getConfig).mockResolvedValue(openAi)
    renderInApp(<AiAssistantModal open onClose={vi.fn()} task="generate_summary" />)

    // Direct is the default ...
    expect(await screen.findByRole('button', { name: 'Vorschlag generieren' })).toBeInTheDocument()
    // ... and the other way is one click away.
    fireEvent.click(screen.getByRole('radio', { name: 'Kopieren & Einfügen' }))
    expect(screen.getByRole('button', { name: /1\. Prompt kopieren/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vorschlag generieren' })).toBeNull()
  })

  it('treats an AI service of the server like an own one for direct generation', async () => {
    vi.mocked(aiApi.getConfig).mockResolvedValue({ ...copyPaste, hasServerFallback: true, serverFallbackProvider: 'openai' })
    renderInApp(<AiAssistantModal open onClose={vi.fn()} task="generate_summary" />)
    expect(await screen.findByRole('button', { name: 'Vorschlag generieren' })).toBeInTheDocument()
  })

  it.each([
    ['generate_cover_letter', 'Anschreiben formulieren'],
    ['analyze_job', 'Stellenanzeige analysieren'],
    ['generate_summary', 'Kurzprofil formulieren'],
    ['improve_bullet', 'Stichpunkt optimieren'],
    ['translate_content', 'Text übersetzen'],
  ] as const)('%s has its own title and the copy and paste way', async (task, title) => {
    renderInApp(<AiAssistantModal open onClose={vi.fn()} task={task} />)
    expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1\. Prompt kopieren/ })).toBeInTheDocument()
  })
})

describe('assistant: translating', () => {
  it('translates into the other language than the interface by default and applies the text', async () => {
    const onApply = vi.fn()
    vi.mocked(aiApi.parseResponse).mockResolvedValue({ translatedText: 'I build cloud systems.' })
    renderInApp(<AiAssistantModal open onClose={vi.fn()} task="translate_content" initialText="Ich baue Cloud-Systeme." onApplyTranslation={onApply} />)

    const target = (await screen.findByLabelText('Übersetzen nach')) as HTMLSelectElement
    expect(target.value).toBe('en')
    expect(screen.getByLabelText('Zu übersetzender Text')).toHaveValue('Ich baue Cloud-Systeme.')

    fireEvent.change(screen.getByPlaceholderText(/Fügen Sie die vollständige Antwort/), { target: { value: '{"translatedText":"I build cloud systems."}' } })
    fireEvent.click(screen.getByRole('button', { name: /3\. Antwort auswerten/ }))

    expect(await screen.findByTestId('translation-result')).toHaveTextContent('I build cloud systems.')
    expect(screen.getByText('Übersetzung nach Englisch')).toBeInTheDocument()
    expect(aiApi.parseResponse).toHaveBeenCalledWith(expect.objectContaining({ task: 'translate_content', language: 'en' }))

    fireEvent.click(screen.getByRole('button', { name: 'Übersetzung übernehmen' }))
    expect(onApply).toHaveBeenCalledWith({ translatedText: 'I build cloud systems.' })
  })

  it('sends the chosen target language with the prompt', async () => {
    vi.mocked(aiApi.buildPrompt).mockResolvedValue({ task: 'translate_content', systemPrompt: 's', userPrompt: 'u', fullCopyPasteText: 'PROMPT', pseudonymized: true })
    renderInApp(<AiAssistantModal open onClose={vi.fn()} task="translate_content" initialText="Hallo" />)
    fireEvent.change(await screen.findByLabelText('Übersetzen nach'), { target: { value: 'de' } })
    fireEvent.click(screen.getByRole('button', { name: /1\. Prompt kopieren/ }))
    await waitFor(() => expect(aiApi.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({ task: 'translate_content', language: 'de', inputText: 'Hallo' })))
  })
})

describe('assistant: improving bullet points', () => {
  const description = '- Cloud-Migration geleitet\n- Team von 5 betreut\n- Kosten gesenkt'

  it('lets the user pick one line of a longer description', async () => {
    const onApply = vi.fn()
    vi.mocked(aiApi.parseResponse).mockResolvedValue({ improved: 'Cloud-Migration für 40 Dienste geleitet', alternatives: [], explanation: '' })
    renderInApp(<AiAssistantModal open onClose={vi.fn()} task="improve_bullet" initialText={description} initialJobTitle="Architekt" onApplyBullet={onApply} />)

    const picker = (await screen.findByLabelText('Welche Zeile verbessern?')) as HTMLSelectElement
    expect(within(picker).getByRole('option', { name: 'Alles zusammen (3 Zeilen)' })).toBeInTheDocument()
    fireEvent.change(picker, { target: { value: '0' } })
    expect(screen.getByLabelText('Zu optimierender Stichpunkt')).toHaveValue('- Cloud-Migration geleitet')

    fireEvent.change(screen.getByPlaceholderText(/Fügen Sie die vollständige Antwort/), { target: { value: '{}' } })
    fireEvent.click(screen.getByRole('button', { name: /3\. Antwort auswerten/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'In Beschreibung übernehmen' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ improved: 'Cloud-Migration für 40 Dienste geleitet' }), '- Cloud-Migration geleitet')
  })

  it('does not offer a line picker for a single line', async () => {
    renderInApp(<AiAssistantModal open onClose={vi.fn()} task="improve_bullet" initialText="Ein Stichpunkt" />)
    await screen.findByLabelText('Zu optimierender Stichpunkt')
    expect(screen.queryByLabelText('Welche Zeile verbessern?')).toBeNull()
  })

  it('puts the improved line back where it was and keeps the list marker', () => {
    expect(replaceBullet(description, '- Team von 5 betreut', 'Team von 5 Entwicklern geführt')).toBe(
      '- Cloud-Migration geleitet\n- Team von 5 Entwicklern geführt\n- Kosten gesenkt',
    )
  })

  it('replaces everything when the whole description was sent, and never loses a retyped text', () => {
    expect(replaceBullet(description, description, 'Neu')).toBe('Neu')
    // The user retyped the text in the assistant: it is added, nothing of the description is lost.
    expect(replaceBullet(description, 'etwas ganz anderes', 'Neue Zeile')).toBe(`${description}\nNeue Zeile`)
    expect(replaceBullet(description, '- Kosten gesenkt', '')).toBe(description)
  })
})

describe('entry points', () => {
  const profile = {
    id: 'p1',
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'max@example.com',
    bio: 'Ich baue Cloud-Systeme.',
    hasPhoto: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    experiences: [],
    educations: [],
    skills: [],
    languages: [],
    certificates: [],
    interests: [],
    customSections: [],
  } as unknown as Profile

  /** Holds the form like the profile page does, so what the assistant applies is visible in the field. */
  function PersonalHarness({ of = profile }: { of?: Profile }) {
    const form = usePersonalForm(of)
    return <PersonalTab profile={of} form={form} />
  }

  it('writes the short profile with the assistant and puts it into the field', async () => {
    vi.mocked(aiApi.parseResponse).mockResolvedValue({ shortSummary: 'Erfahrener Cloud-Architekt mit Teamverantwortung.', bulletPoints: [] })
    renderInApp(<PersonalHarness />)
    fireEvent.click(screen.getByTestId('bio-ai-summary'))

    const dialog = await screen.findByRole('dialog', { name: 'Kurzprofil formulieren' })
    fireEvent.change(await within(dialog).findByPlaceholderText(/Fügen Sie die vollständige Antwort/), { target: { value: '{}' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /3\. Antwort auswerten/ }))
    fireEvent.click(await within(dialog).findByRole('button', { name: 'In Kurzprofil übernehmen' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kurzprofil formulieren' })).toBeNull())
    expect(screen.getByLabelText('Kurzprofil / Über mich')).toHaveValue('Erfahrener Cloud-Architekt mit Teamverantwortung.')
  })

  it('translates the short profile and puts the translation into the field', async () => {
    vi.mocked(aiApi.parseResponse).mockResolvedValue({ translatedText: 'I build cloud systems.' })
    renderInApp(<PersonalHarness />)
    fireEvent.click(screen.getByTestId('bio-ai-translate'))

    const dialog = await screen.findByRole('dialog', { name: 'Text übersetzen' })
    expect(within(dialog).getByLabelText('Zu übersetzender Text')).toHaveValue('Ich baue Cloud-Systeme.')
    fireEvent.change(within(dialog).getByPlaceholderText(/Fügen Sie die vollständige Antwort/), { target: { value: '{}' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /3\. Antwort auswerten/ }))
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Übersetzung übernehmen' }))

    await waitFor(() => expect(screen.getByLabelText('Kurzprofil / Über mich')).toHaveValue('I build cloud systems.'))
  })

  it('does not offer to translate an empty short profile', () => {
    const empty = { ...profile, bio: '' } as Profile
    renderInApp(<PersonalHarness of={empty} />)
    expect(screen.getByTestId('bio-ai-translate')).toBeDisabled()
    expect(screen.getByTestId('bio-ai-summary')).toBeEnabled()
  })

  it('improves the description of a position and replaces the chosen line', async () => {
    const withJob = {
      ...profile,
      experiences: [
        {
          id: 'e1',
          jobTitle: 'Architekt',
          employer: 'Tech GmbH',
          employmentType: null,
          city: null,
          country: null,
          startDate: '2022-01',
          endDate: null,
          isCurrent: true,
          description: '- Cloud-Migration geleitet\n- Team betreut',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    } as unknown as Profile
    vi.mocked(aiApi.parseResponse).mockResolvedValue({ improved: 'Cloud-Migration für 40 Dienste geleitet', alternatives: [], explanation: '' })
    renderInApp(<ExperiencesTab profile={withJob} />)

    fireEvent.click(screen.getByRole('button', { name: /Station bearbeiten/ }))
    const form = await screen.findByRole('dialog', { name: 'Station bearbeiten' })
    fireEvent.click(within(form).getByTestId('description-ai'))

    const assistant = await screen.findByRole('dialog', { name: 'Stichpunkt optimieren' })
    fireEvent.change(within(assistant).getByLabelText('Welche Zeile verbessern?'), { target: { value: '0' } })
    fireEvent.change(within(assistant).getByPlaceholderText(/Fügen Sie die vollständige Antwort/), { target: { value: '{}' } })
    fireEvent.click(within(assistant).getByRole('button', { name: /3\. Antwort auswerten/ }))
    fireEvent.click(await within(assistant).findByRole('button', { name: 'In Beschreibung übernehmen' }))

    await waitFor(() => expect(within(form).getByLabelText('Aufgaben, Erfolge & Schwerpunkte')).toHaveValue('- Cloud-Migration für 40 Dienste geleitet\n- Team betreut'))
    expect(profileApi.updateExperience).not.toHaveBeenCalled()
  })
})

describe('AI access of the server (administration)', () => {
  const stored: AdminAiConfig = { enabled: false, provider: 'openai', model: 'gpt-4o-mini', baseUrl: null, hasApiKey: true }

  beforeEach(() => {
    vi.mocked(aiApi.getAdminConfig).mockResolvedValue(stored)
  })

  it('shows the stored state without ever showing the key', async () => {
    renderInApp(<AiServerSection />)
    expect(await screen.findByLabelText('Modell')).toHaveValue('gpt-4o-mini')
    expect(screen.getByText('Schlüssel ist sicher verschlüsselt hinterlegt')).toBeInTheDocument()
    expect(screen.getByLabelText('API-Schlüssel')).toHaveValue('')
    // Copy and paste has no meaning as a service of the server.
    expect(screen.queryByRole('option', { name: /Kopieren & Einfügen/ })).toBeNull()
  })

  it('asks for the password again before saving and sends it with the change', async () => {
    vi.mocked(aiApi.saveAdminConfig).mockResolvedValue({ ...stored, enabled: true })
    renderInApp(<AiServerSection />)
    fireEvent.click(await screen.findByRole('switch', { name: /KI-Zugang des Servers verwenden/ }))
    fireEvent.change(screen.getByLabelText('API-Schlüssel'), { target: { value: 'sk-server-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'KI-Zugang speichern' }))

    // Nothing is sent before the password is given.
    const dialog = await screen.findByRole('alertdialog')
    expect(aiApi.saveAdminConfig).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('Ihr aktuelles Passwort'), { target: { value: 'secret-password-1' } })
    fireEvent.click(within(dialog).getByTestId('reauth-confirm'))

    await waitFor(() =>
      expect(aiApi.saveAdminConfig).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-server-key', password: 'secret-password-1' }),
      ),
    )
    expect(await screen.findByText('Der KI-Zugang des Servers wurde gespeichert.')).toBeInTheDocument()
    expect(screen.getByLabelText('API-Schlüssel')).toHaveValue('')
  })

  it('shows a refused password inside the dialog and keeps the form', async () => {
    vi.mocked(aiApi.saveAdminConfig).mockRejectedValue(new ApiError(403, { code: 'auth.reauth_failed', detail: 'wrong' }))
    renderInApp(<AiServerSection />)
    fireEvent.click(await screen.findByRole('switch', { name: /KI-Zugang des Servers verwenden/ }))
    fireEvent.click(screen.getByRole('button', { name: 'KI-Zugang speichern' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.change(within(dialog).getByLabelText('Ihr aktuelles Passwort'), { target: { value: 'wrong' } })
    fireEvent.click(within(dialog).getByTestId('reauth-confirm'))

    expect(await within(dialog).findByTestId('error-notice')).toBeInTheDocument()
    expect(screen.queryByText('Der KI-Zugang des Servers wurde gespeichert.')).toBeNull()
  })

  it('offers LM Studio with its address and needs the model name', async () => {
    renderInApp(<AiServerSection />)
    fireEvent.change(await screen.findByLabelText('KI-Anbieter'), { target: { value: 'lmstudio' } })
    expect(screen.getByLabelText('Basis-URL / Server-Adresse')).toHaveValue('http://localhost:1234/v1')
    expect(screen.queryByLabelText('API-Schlüssel')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'KI-Zugang speichern' }))
    // The model is required for a local program: no password question yet.
    expect(screen.getByText('Bitte den Modellnamen eingeben.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows a failure to load in full', async () => {
    vi.mocked(aiApi.getAdminConfig).mockRejectedValue(new ApiError(500, { code: 'server.error', detail: 'x' }))
    renderInApp(<AiServerSection />)
    expect(await screen.findByTestId('error-notice')).toHaveTextContent('Der KI-Zugang des Servers konnte nicht geladen werden.')
  })
})
