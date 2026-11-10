import type { AiProvider } from '../../api/types'

/** The order of the provider choice: no account needed first, then the cloud services, then the local programs, then free choice. */
export const AI_PROVIDERS: readonly AiProvider[] = ['copy_paste', 'openai', 'anthropic', 'gemini', 'ollama', 'lmstudio', 'custom']

/** Where a local program listens by default (the programs' own standard ports); a cloud provider needs no address. */
export const DEFAULT_BASE_URL: Partial<Record<AiProvider, string>> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234/v1',
}

/** Programs on the own computer or network: they run without an API key. */
export const isLocalProvider = (provider: AiProvider) => provider === 'ollama' || provider === 'lmstudio'

/** A service whose address the user has to give (local programs and any other compatible endpoint). */
export const needsBaseUrl = (provider: AiProvider) => isLocalProvider(provider) || provider === 'custom'

/** Local programs have no default model: the name of what the user installed has to be entered. */
export const needsModel = (provider: AiProvider) => needsBaseUrl(provider)

/** Whether the form asks for an API key (not for the local programs). */
export const needsApiKey = (provider: AiProvider) => provider !== 'copy_paste' && !isLocalProvider(provider)
