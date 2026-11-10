import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aiApi } from '../../api/endpoints'
import type { Reauth } from '../../api/endpoints'
import type { AdminAiConfig, AiProvider } from '../../api/types'
import { useAppState } from '../../auth/AppState'
import { AlertSlot } from '../../components/ui/AlertSlot'
import { Button } from '../../components/ui/Button'
import { LiveTextField } from '../../components/ui/LiveTextField'
import { ErrorNotice, Notice } from '../../components/ui/Notice'
import { Loading, Section } from '../../components/ui/Page'
import { SelectField } from '../../components/ui/SelectField'
import { Toggle } from '../../components/ui/Toggle'
import { AI_PROVIDERS, DEFAULT_BASE_URL, needsApiKey, needsBaseUrl, needsModel } from '../../features/ai/providers'
import { ReauthDialog } from '../../features/backups/ReauthDialog'
import { UnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard'
import { isValid, modelRequiredCheck, noRule, urlCheck } from '../../validation/rules'

const KEY = ['ai', 'admin-config'] as const

/** A server-wide service needs a real provider: copy and paste is what everybody has anyway. */
const SERVER_PROVIDERS = AI_PROVIDERS.filter((provider) => provider !== 'copy_paste')

/**
 * The AI service of the whole server (administrators): when switched on, everybody without an own service can generate
 * directly with it. The key is stored encrypted and never shown again. Saving decides where everybody's application data is
 * sent and under whose key, so it asks for the password (and the 2FA code) again.
 */
export function AiServerSection() {
  const { t } = useTranslation()
  const config = useQuery({ queryKey: KEY, queryFn: aiApi.getAdminConfig, retry: false })

  return (
    <Section title={t('admin.ai.title')} description={t('admin.ai.text')}>
      {config.isPending && <Loading />}
      {config.isError && <ErrorNotice error={config.error} title={t('admin.ai.loadFailed')} />}
      {config.data && <AiServerForm config={config.data} />}
    </Section>
  )
}

function AiServerForm({ config }: { config: AdminAiConfig }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { session } = useAppState()

  const startProvider: AiProvider = config.provider && config.provider !== 'copy_paste' ? config.provider : 'openai'
  const [enabled, setEnabled] = useState(config.enabled)
  const [provider, setProvider] = useState<AiProvider>(startProvider)
  const [model, setModel] = useState(config.model ?? '')
  const [baseUrl, setBaseUrl] = useState(config.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [asking, setAsking] = useState(false)
  const [saved, setSaved] = useState(false)

  const modelCheck = needsModel(provider) ? modelRequiredCheck : noRule
  const hasBaseUrl = needsBaseUrl(provider)
  const dirty =
    enabled !== config.enabled || provider !== startProvider || model !== (config.model ?? '') || baseUrl !== (config.baseUrl ?? '') || apiKey !== ''
  const valid = isValid(modelCheck, model) && (!hasBaseUrl || (baseUrl.trim() !== '' && isValid(urlCheck, baseUrl)))

  const touch = () => setSaved(false)

  const changeProvider = (next: AiProvider) => {
    touch()
    setProvider(next)
    // A model name belongs to one provider; the address of a local program has a usual default.
    setModel('')
    setBaseUrl(DEFAULT_BASE_URL[next] ?? '')
  }

  const submit = () => {
    setAttempted(true)
    if (valid) setAsking(true)
  }

  async function save(credentials: Reauth) {
    const result = await aiApi.saveAdminConfig({
      enabled,
      provider,
      model: model.trim(),
      baseUrl: hasBaseUrl ? baseUrl.trim() || null : null,
      apiKey: apiKey.trim() || undefined,
      ...credentials,
    })
    queryClient.setQueryData(KEY, result)
    setApiKey('')
    setAsking(false)
    setSaved(true)
  }

  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-4"
      data-testid="admin-ai-server"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <UnsavedChangesGuard when={dirty} />
      <Toggle
        checked={enabled}
        onChange={(value) => {
          touch()
          setEnabled(value)
        }}
        label={t('admin.ai.enabled')}
        description={t('admin.ai.enabledHint')}
      />

      <SelectField label={t('ai.provider')} value={provider} onChange={(event) => changeProvider(event.target.value as AiProvider)}>
        {SERVER_PROVIDERS.map((id) => (
          <option key={id} value={id}>
            {t(`ai.providers.${id}`)}
          </option>
        ))}
      </SelectField>

      <LiveTextField
        label={t('ai.model')}
        value={model}
        onValueChange={(value) => {
          touch()
          setModel(value)
        }}
        check={modelCheck}
        attempted={attempted}
        hint={needsModel(provider) ? undefined : t('ai.modelHint')}
        placeholder={t('ai.modelPlaceholder')}
        autoComplete="off"
      />

      {hasBaseUrl && (
        <LiveTextField
          label={t('ai.baseUrl')}
          type="url"
          value={baseUrl}
          onValueChange={(value) => {
            touch()
            setBaseUrl(value)
          }}
          check={urlCheck}
          attempted={attempted}
          placeholder={t('ai.baseUrlPlaceholder')}
          autoComplete="off"
          hint={t('admin.ai.baseUrlHint')}
        />
      )}

      {needsApiKey(provider) && (
        <LiveTextField
          label={t('ai.apiKey')}
          type="password"
          value={apiKey}
          onValueChange={(value) => {
            touch()
            setApiKey(value)
          }}
          check={noRule}
          placeholder={t('ai.apiKeyPlaceholder')}
          autoComplete="new-password"
          hint={config.hasApiKey ? t('ai.apiKeyStored') : t('ai.apiKeyMissing')}
        />
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="confirm" icon="deviceFloppy" disabled={!dirty}>
          {t('admin.ai.save')}
        </Button>
        <div className="min-w-0 flex-1">
          <AlertSlot plain reserve={[t('admin.ai.saved')]}>
            {saved && <Notice tone="success">{t('admin.ai.saved')}</Notice>}
          </AlertSlot>
        </div>
      </div>

      {asking && (
        <ReauthDialog
          open
          onClose={() => setAsking(false)}
          title={t('admin.ai.stepUpTitle')}
          icon="alertTriangle"
          confirmLabel={t('admin.ai.stepUpAction')}
          askPassword
          askCode={session.user?.twoFactorEnabled ?? false}
          onConfirm={save}
        >
          {t('admin.ai.stepUpText')}
        </ReauthDialog>
      )}
    </form>
  )
}
