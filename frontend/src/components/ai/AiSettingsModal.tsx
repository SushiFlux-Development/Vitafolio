// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { aiApi } from '../../api/endpoints'
import { branding } from '../../branding'
import type { AiConfig, AiProvider } from '../../api/types'
import { AI_PROVIDERS, DEFAULT_BASE_URL, needsApiKey, needsBaseUrl, needsModel } from '../../features/ai/providers'
import { modelRequiredCheck, noRule, isValid, urlCheck } from '../../validation/rules'
import { reserveFor } from '../forms/reserve'
import { AlertSlot } from '../ui/AlertSlot'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { FormDialog } from '../ui/FormDialog'
import { Icon } from '../ui/Icon'
import { LiveTextField } from '../ui/LiveTextField'
import { ErrorNotice, Notice } from '../ui/Notice'
import { Loading } from '../ui/Page'
import { SelectField } from '../ui/SelectField'
import { Toggle } from '../ui/Toggle'

interface AiSettingsModalProps {
  open: boolean
  onClose: () => void
}

/** What a connection test answers when the settings are wrong or the provider is out of reach: normal use, so it keeps its room. */
const TEST_ANSWERS = ['ai.host_not_allowed', 'ai.missing_key', 'ai.connection_failed', 'ai.api_error', 'ai.timeout', 'ai.empty_response', 'ai.key_unavailable'] as const

export function AiSettingsModal({ open, onClose }: AiSettingsModalProps) {
  const { t } = useTranslation()
  const config = useQuery({ queryKey: ['ai', 'config'], queryFn: aiApi.getConfig, enabled: open })

  if (!open) return null

  if (config.isPending || config.isError) {
    // The loading and failure states are small dialogs of their own; the form below only exists once the settings are known.
    return (
      <Dialog open onClose={onClose} title={t('ai.settingsTitle')} size="md" footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
        {config.isPending ? <Loading /> : <ErrorNotice error={config.error} title={t('ai.errors.load')} />}
      </Dialog>
    )
  }

  return <AiSettingsForm config={config.data} onClose={onClose} />
}

/**
 * The form is created once per opening and keeps its own state while the stored settings are saved and reloaded - it is not
 * rebuilt when they change, so nothing typed afterwards is lost.
 */
function AiSettingsForm({ config, onClose }: { config: AiConfig; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [provider, setProvider] = useState<AiProvider>(config.provider)
  const [model, setModel] = useState(config.model)
  const [baseUrl, setBaseUrl] = useState(config.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [pseudonymize, setPseudonymize] = useState(config.pseudonymize)
  const [attempted, setAttempted] = useState(false)
  const [testOutcome, setTestOutcome] = useState<{ ok: true } | { ok: false; error: unknown } | null>(null)

  const dirty =
    provider !== config.provider || model !== config.model || baseUrl !== (config.baseUrl ?? '') || apiKey !== '' || pseudonymize !== config.pseudonymize
  const modelCheck = needsModel(provider) ? modelRequiredCheck : noRule
  const hasBaseUrl = needsBaseUrl(provider)
  const formValid = isValid(modelCheck, model) && (!hasBaseUrl || (baseUrl.trim() !== '' && isValid(urlCheck, baseUrl)))

  const save = useMutation({
    mutationFn: () =>
      aiApi.saveConfig({
        provider,
        // An empty model is sent as it is: the server then uses the default of the provider instead of keeping the name of another one.
        model: model.trim(),
        baseUrl: hasBaseUrl ? baseUrl.trim() || null : null,
        apiKey: apiKey.trim() || undefined,
        pseudonymize,
      }),
    onSuccess: () => {
      setApiKey('')
      void queryClient.invalidateQueries({ queryKey: ['ai', 'config'] })
    },
  })

  const test = useMutation({
    // The server tests what is stored, so a changed form is saved first (the line next to the button says so).
    mutationFn: async () => {
      if (dirty) await save.mutateAsync()
      return aiApi.testConnection()
    },
    onSuccess: (result) => {
      if (result.success) setTestOutcome({ ok: true })
      else setTestOutcome({ ok: false, error: new ApiError(0, { code: result.code ?? undefined, detail: result.message ?? undefined }) })
    },
    onError: (error) => setTestOutcome({ ok: false, error }),
  })

  const changeProvider = (next: AiProvider) => {
    setProvider(next)
    // A model name belongs to one provider; the address of a local service has a usual default.
    setModel('')
    setBaseUrl(DEFAULT_BASE_URL[next] ?? '')
    setTestOutcome(null)
  }

  const submit = () => {
    setAttempted(true)
    if (!formValid) return
    save.mutate(undefined, {
      onSuccess: () => onClose(),
      onError: (error) => setTestOutcome({ ok: false, error }),
    })
  }

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={submit}
      title={t('ai.settingsTitle')}
      size="md"
      submitLabel={t('ai.save')}
      busy={save.isPending && !test.isPending}
      dirty={dirty}
      footerStart={
        provider !== 'copy_paste' ? (
          <Button small busy={test.isPending} disabled={!formValid || save.isPending} onClick={() => test.mutate()}>
            {t('ai.testConnection')}
          </Button>
        ) : undefined
      }
    >
      <SelectField label={t('ai.provider')} value={provider} onChange={(event) => changeProvider(event.target.value as AiProvider)}>
        {AI_PROVIDERS.map((id) => (
          <option key={id} value={id}>
            {t(`ai.providers.${id}`)}
          </option>
        ))}
      </SelectField>

      {provider === 'copy_paste' ? (
        <Notice tone="info">
          <strong className="mb-1 block">{t('ai.copyPasteNotice.title')}</strong>
          {t('ai.copyPasteNotice.text', { product: branding.name })}
        </Notice>
      ) : (
        <>
          <LiveTextField
            label={t('ai.model')}
            value={model}
            onValueChange={setModel}
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
              onValueChange={setBaseUrl}
              check={urlCheck}
              attempted={attempted}
              placeholder={t('ai.baseUrlPlaceholder')}
              autoComplete="off"
            />
          )}

          {needsApiKey(provider) && (
            <div>
              <LiveTextField
                label={t('ai.apiKey')}
                type="password"
                value={apiKey}
                onValueChange={setApiKey}
                check={noRule}
                placeholder={t('ai.apiKeyPlaceholder')}
                autoComplete="off"
                hint={config.hasApiKey ? t('ai.apiKeyStored') : t('ai.apiKeyMissing')}
              />
            </div>
          )}
        </>
      )}

      <Toggle label={t('ai.pseudonymize')} description={t('ai.pseudonymizeHint')} checked={pseudonymize} onChange={setPseudonymize} />

      {provider !== 'copy_paste' && (
        <AlertSlot
          reserve={reserveFor(t, TEST_ANSWERS, t('ai.testFailed'))}
          reservePlain={[t('ai.testSuccess'), t('ai.testSavesFirst')]}
          error={testOutcome?.ok === false ? testOutcome.error : null}
          errorTitle={t('ai.testFailed')}
          normalCodes={TEST_ANSWERS}
          onDismiss={() => setTestOutcome(null)}
        >
          {testOutcome?.ok === true && (
            <Notice tone="success">{t('ai.testSuccess')}</Notice>
          )}
          {testOutcome === null && dirty && (
            <p className="flex items-start gap-2 text-sm text-ink-muted">
              <Icon name="infoCircle" size={16} className="mt-0.5 shrink-0" />
              {t('ai.testSavesFirst')}
            </p>
          )}
        </AlertSlot>
      )}
    </FormDialog>
  )
}
