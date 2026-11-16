// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aiApi } from '../../api/endpoints'
import type {
  AiConfig,
  AiCoverLetterResult,
  AiImproveBulletResult,
  AiJobAnalysisResult,
  AiSummaryResult,
  AiTask,
  AiTranslateResult,
  LanguageCode,
} from '../../api/types'
import { copyToClipboard } from '../../hooks/useCopy'
import { noRule } from '../../validation/rules'
import { reserveFor } from '../forms/reserve'
import { AlertSlot } from '../ui/AlertSlot'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'
import { LiveTextAreaField, LiveTextField } from '../ui/LiveTextField'
import { Notice } from '../ui/Notice'
import { SelectField } from '../ui/SelectField'
import { Segmented } from '../ui/Segmented'
import { TextAreaField } from '../ui/TextAreaField'
import { AiSettingsModal } from './AiSettingsModal'

interface AiAssistantModalProps {
  open: boolean
  onClose: () => void
  task: AiTask
  initialJobTitle?: string
  initialCompany?: string
  initialJobDescription?: string
  initialRecipient?: string
  initialText?: string
  /** The language the answer is written in (tasks other than translating); the interface language when not given. */
  language?: LanguageCode
  /** Translating only: the language to translate into; the other one than the interface language when not given. */
  initialTargetLanguage?: LanguageCode
  onApplyCoverLetter?: (result: AiCoverLetterResult) => void
  onApplySummary?: (result: AiSummaryResult) => void
  /** `source` is the text that was improved, so the caller can replace exactly that part. */
  onApplyBullet?: (result: AiImproveBulletResult, source: string) => void
  onApplyTranslation?: (result: AiTranslateResult) => void
}

/** Failures a normal use provokes (a pasted answer that is no JSON, provider or key trouble): they keep their room under the buttons. */
export const AI_ANSWERS = ['ai.invalid_json', 'ai.parse_failed', 'ai.missing_fields', 'ai.empty_response', 'ai.api_error', 'ai.connection_failed', 'ai.timeout', 'ai.daily_limit', 'ai.missing_key', 'ai.host_not_allowed', 'ai.key_unavailable'] as const

const TASK_TITLE: Record<AiTask, string> = {
  generate_cover_letter: 'ai.tasks.coverLetter',
  analyze_job: 'ai.tasks.analyzeJob',
  generate_summary: 'ai.tasks.summary',
  improve_bullet: 'ai.tasks.improveBullet',
  translate_content: 'ai.tasks.translate',
}

export function AiAssistantModal(props: AiAssistantModalProps) {
  const { open, onClose, task } = props
  const { t } = useTranslation()

  const { data: config } = useQuery({
    queryKey: ['ai', 'config'],
    queryFn: aiApi.getConfig,
    enabled: open,
  })

  if (!open) return null

  return (
    <Dialog open={open} onClose={onClose} title={t(TASK_TITLE[task])} icon="sparkles" size="lg" closeOnBackdrop={false}>
      <AiAssistantInner {...props} config={config} />
    </Dialog>
  )
}

function AiAssistantInner({
  onClose,
  task,
  initialJobTitle = '',
  initialCompany = '',
  initialJobDescription = '',
  initialRecipient = '',
  initialText = '',
  language: outputLanguage,
  initialTargetLanguage,
  onApplyCoverLetter,
  onApplySummary,
  onApplyBullet,
  onApplyTranslation,
  config,
}: AiAssistantModalProps & { config?: AiConfig }) {
  const { t, i18n } = useTranslation()
  const uiLanguage: LanguageCode = i18n.language.startsWith('en') ? 'en' : 'de'
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>(initialTargetLanguage ?? (uiLanguage === 'en' ? 'de' : 'en'))
  // Translating writes in the chosen target language; every other task in the language of the document or the interface.
  const language: LanguageCode = task === 'translate_content' ? targetLanguage : (outputLanguage ?? uiLanguage)

  // Input states initialized from props
  const [jobTitle, setJobTitle] = useState(initialJobTitle)
  const [company, setCompany] = useState(initialCompany)
  const [jobDescription, setJobDescription] = useState(initialJobDescription)
  const [recipient, setRecipient] = useState(initialRecipient)
  const [tone, setTone] = useState('confident')
  const [inputText, setInputText] = useState(initialText)

  // Copy-paste workflow states
  const [promptText, setPromptText] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // The prompt for copying by hand floats over the section (it pushes nothing); it goes away as soon as the focus leaves it.
  const [manualOpen, setManualOpen] = useState(false)
  const [rawResponse, setRawResponse] = useState('')
  const [parsedResult, setParsedResult] = useState<unknown | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // What went wrong with the last request (shown in full, copyable, at a fixed place) - never swallowed.
  const [failure, setFailure] = useState<{ error: unknown; title: string } | null>(null)

  // Direct generation needs an own service or one the administrator set up for the server; copy and paste always works.
  const directAvailable = Boolean(config && (config.provider !== 'copy_paste' || config.hasServerFallback))
  const [chosenMode, setChosenMode] = useState<'direct' | 'copy' | null>(null)
  const mode = chosenMode ?? (directAvailable ? 'direct' : 'copy')

  // A description of several lines: the user picks the one line to improve (or all of them).
  const lines = initialText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const canPickLine = task === 'improve_bullet' && lines.length > 1
  const [pickedLine, setPickedLine] = useState('')

  const request = {
    task,
    jobTitle: jobTitle.trim() || undefined,
    company: company.trim() || undefined,
    jobDescription: jobDescription.trim() || undefined,
    recipientPerson: recipient.trim() || undefined,
    tone,
    language,
    inputText: inputText.trim() || undefined,
  } as const

  // Prompt Mutation (Copy & Paste)
  const promptMutation = useMutation({
    mutationFn: () => aiApi.buildPrompt(request),
    onMutate: () => setFailure(null),
    onSuccess: async (data) => {
      setPromptText(data.fullCopyPasteText)
      const ok = await copyToClipboard(data.fullCopyPasteText)
      setCopyState(ok ? 'copied' : 'failed')
      setManualOpen(!ok)
      if (ok) setTimeout(() => setCopyState('idle'), 4000)
    },
    onError: (error) => setFailure({ error, title: t('ai.assistant.actionFailed') }),
  })

  // Parse Mutation (Copy & Paste)
  const parseMutation = useMutation({
    mutationFn: () => aiApi.parseResponse({ task, rawResponse, pseudonymized: config?.pseudonymize ?? true, language }),
    onMutate: () => setFailure(null),
    onSuccess: (data) => setParsedResult(data),
    onError: (error) => setFailure({ error, title: t('ai.assistant.parseFailed') }),
  })

  // Direct Generation Mutation
  const generateMutation = useMutation({
    mutationFn: () => aiApi.generate(request),
    onMutate: () => setFailure(null),
    onSuccess: (data) => setParsedResult(data),
    onError: (error) => setFailure({ error, title: t('ai.assistant.actionFailed') }),
  })

  const handleApply = () => {
    if (!parsedResult) return
    if (task === 'generate_cover_letter' && onApplyCoverLetter) {
      onApplyCoverLetter(parsedResult as AiCoverLetterResult)
      onClose()
    } else if (task === 'generate_summary' && onApplySummary) {
      onApplySummary(parsedResult as AiSummaryResult)
      onClose()
    } else if (task === 'improve_bullet' && onApplyBullet) {
      onApplyBullet(parsedResult as AiImproveBulletResult, inputText.trim())
      onClose()
    } else if (task === 'translate_content' && onApplyTranslation) {
      onApplyTranslation(parsedResult as AiTranslateResult)
      onClose()
    }
  }

  const renderResult = () => {
    if (!parsedResult) return null

    if (task === 'generate_cover_letter') {
      const res = parsedResult as AiCoverLetterResult
      return (
        <div className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
            <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">{t('ai.assistant.result.letterPreview')}</h3>
            {res.keyMatches && res.keyMatches.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1">
                {res.keyMatches.map((match, index) => (
                  <span key={index} className="badge badge-info">
                    {match}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <span className="text-xs font-semibold text-ink-muted">{t('ai.assistant.result.subject')}:</span>
            <p className="mt-0.5 text-sm font-semibold text-ink">{res.subject}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-ink-muted">{t('ai.assistant.result.salutation')}:</span>
            <p className="mt-0.5 text-sm text-ink">{res.salutation}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-ink-muted">{t('ai.assistant.result.bodyParts')}:</span>
            <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-ink">{res.opening}</p>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-ink">{res.body}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-ink-muted">{t('ai.assistant.result.closing')}:</span>
            <p className="mt-0.5 text-sm leading-relaxed text-ink">{res.closing}</p>
          </div>
        </div>
      )
    }

    if (task === 'analyze_job') {
      const res = parsedResult as AiJobAnalysisResult
      // The score is told by its number, a word and a colour - never by the colour alone.
      const level = res.matchScore >= 80 ? 'high' : res.matchScore >= 60 ? 'medium' : 'low'
      const levelClass = { high: 'badge-success', medium: 'badge-warning', low: 'badge-danger' }[level]
      const levelText = { high: 'scoreHigh', medium: 'scoreMedium', low: 'scoreLow' }[level]

      return (
        <div className="card flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
            <div>
              <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">{t('ai.assistant.matchScore')}</h3>
              <p className="mt-0.5 text-xs text-ink-muted">{res.summary}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`badge ${levelClass} text-lg`}>{res.matchScore} %</span>
              <span className="text-xs font-semibold text-ink-muted">{t(`ai.assistant.result.${levelText}`)}</span>
            </div>
          </div>

          {res.matchedRequirements.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-success-soft-ink uppercase">
                <Icon name="check" size={14} />
                {t('ai.assistant.matchedRequirements')}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {res.matchedRequirements.map((match, index) => (
                  <li key={index} className="rounded-sm border border-line bg-surface-2 p-2 text-xs">
                    <span className="font-semibold text-ink">{match.requirement}</span>
                    <p className="mt-0.5 text-ink-muted">✓ {match.candidateMatch}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {res.missingRequirements.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-warning-soft-ink uppercase">
                <Icon name="clock" size={14} />
                {t('ai.assistant.missingRequirements')}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {res.missingRequirements.map((missing, index) => (
                  <li key={index} className="rounded-sm border border-line bg-surface-2 p-2 text-xs">
                    <span className="font-semibold text-ink">{missing.requirement}</span>
                    <p className="mt-0.5 text-ink-muted">→ {missing.suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {res.tips.length > 0 && (
            <div className="rounded-sm border border-line bg-surface-2 p-3 text-xs">
              <h3 className="mb-1.5 font-semibold tracking-wider text-ink uppercase">{t('ai.assistant.tips')}</h3>
              <ul className="list-disc space-y-1 pl-4 text-ink-muted">
                {res.tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )
    }

    if (task === 'generate_summary') {
      const res = parsedResult as AiSummaryResult
      return (
        <div className="card flex flex-col gap-3 p-4">
          <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">{t('ai.assistant.result.summaryTitle')}</h3>
          <p className="text-sm leading-relaxed font-semibold text-ink">{res.shortSummary}</p>
          {res.bulletPoints.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-muted">
              {res.bulletPoints.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          )}
        </div>
      )
    }

    if (task === 'improve_bullet') {
      const res = parsedResult as AiImproveBulletResult
      return (
        <div className="card flex flex-col gap-3 p-4">
          <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">{t('ai.assistant.result.bulletTitle')}</h3>
          <p className="notice notice-success text-sm font-semibold">{res.improved}</p>
          {res.alternatives.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-ink-muted">{t('ai.assistant.result.alternatives')}:</span>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink-muted">
                {res.alternatives.map((alternative, index) => (
                  <li key={index}>{alternative}</li>
                ))}
              </ul>
            </div>
          )}
          {res.explanation && (
            <p className="text-xs text-ink-muted italic">
              {t('ai.assistant.result.tip')}: {res.explanation}
            </p>
          )}
        </div>
      )
    }

    if (task === 'translate_content') {
      const res = parsedResult as AiTranslateResult
      return (
        <div className="card flex flex-col gap-3 p-4">
          <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
            {t('ai.assistant.result.translationTitle', { language: t(`ai.assistant.languages.${targetLanguage}`) })}
          </h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink" data-testid="translation-result">
            {res.translatedText}
          </p>
        </div>
      )
    }

    return null
  }

  const applyAvailable =
    (task === 'generate_cover_letter' && Boolean(onApplyCoverLetter)) ||
    (task === 'generate_summary' && Boolean(onApplySummary)) ||
    (task === 'improve_bullet' && Boolean(onApplyBullet)) ||
    (task === 'translate_content' && Boolean(onApplyTranslation))
  const applyLabel = {
    generate_cover_letter: t('ai.assistant.applyToCoverLetter'),
    generate_summary: t('ai.assistant.applyToSummary'),
    improve_bullet: t('ai.assistant.applyToDescription'),
    translate_content: t('ai.assistant.applyTranslation'),
    analyze_job: t('ai.assistant.apply'),
  }[task]

  return (
    <>
      <div className="flex flex-col gap-5 text-sm">
        {/* Header Strip with provider indicator */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink-muted">{t('ai.provider')}:</span>
            <span className="badge badge-neutral">{t(`ai.providers.${config?.provider || 'copy_paste'}`)}</span>
            {config?.model && config.provider !== 'copy_paste' && <span className="badge badge-info">{config.model}</span>}
          </div>
          <Button variant="ghost" small onClick={() => setIsSettingsOpen(true)}>
            {t('ai.assistant.changeProvider')}
          </Button>
        </div>

        {/* Context Inputs (if cover letter or analyze job) */}
        {(task === 'generate_cover_letter' || task === 'analyze_job') && (
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <LiveTextField label={t('ai.assistant.jobTitle')} value={jobTitle} onValueChange={setJobTitle} check={noRule} placeholder={t('ai.assistant.jobTitlePlaceholder')} />
            <LiveTextField label={t('ai.assistant.company')} value={company} onValueChange={setCompany} check={noRule} placeholder={t('ai.assistant.companyPlaceholder')} />

            {task === 'generate_cover_letter' && (
              <>
                <LiveTextField label={t('ai.assistant.recipient')} value={recipient} onValueChange={setRecipient} check={noRule} placeholder={t('ai.assistant.recipientPlaceholder')} />
                <SelectField label={t('ai.assistant.tone')} value={tone} onChange={(event) => setTone(event.target.value)}>
                  {(['confident', 'professional', 'dynamic', 'classic'] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(`ai.assistant.tones.${value}`)}
                    </option>
                  ))}
                </SelectField>
              </>
            )}

            <LiveTextAreaField
              className="sm:col-span-2"
              label={t('ai.assistant.jobDescription')}
              rows={3}
              value={jobDescription}
              onValueChange={setJobDescription}
              check={noRule}
              placeholder={t('ai.assistant.jobDescriptionPlaceholder')}
            />
          </div>
        )}

        {/* Context Input for improve_bullet or summary */}
        {task === 'improve_bullet' && (
          <LiveTextField label={t('ai.assistant.bulletContext')} value={jobTitle} onValueChange={setJobTitle} check={noRule} placeholder={t('ai.assistant.jobTitlePlaceholder')} />
        )}

        {canPickLine && (
          <SelectField
            label={t('ai.assistant.pickLine')}
            value={pickedLine}
            onChange={(event) => {
              setPickedLine(event.target.value)
              setInputText(event.target.value === '' ? initialText : (lines[Number(event.target.value)] ?? initialText))
              setParsedResult(null)
            }}
            hint={t('ai.assistant.pickLineHint')}
          >
            <option value="">{t('ai.assistant.pickAll', { count: lines.length })}</option>
            {lines.map((line, index) => (
              <option key={index} value={index}>
                {line}
              </option>
            ))}
          </SelectField>
        )}

        {(task === 'improve_bullet' || task === 'generate_summary' || task === 'translate_content') && (
          <LiveTextAreaField
            label={task === 'improve_bullet' ? t('ai.assistant.bulletInput') : task === 'translate_content' ? t('ai.assistant.translateInput') : t('ai.assistant.summaryInput')}
            rows={task === 'translate_content' ? 5 : 3}
            value={inputText}
            onValueChange={setInputText}
            check={noRule}
            placeholder={task === 'improve_bullet' ? t('ai.assistant.bulletPlaceholder') : task === 'translate_content' ? t('ai.assistant.translatePlaceholder') : t('ai.assistant.summaryPlaceholder')}
          />
        )}

        {task === 'translate_content' && (
          <SelectField label={t('ai.assistant.targetLanguage')} value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value as LanguageCode)}>
            {(['de', 'en'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`ai.assistant.languages.${value}`)}
              </option>
            ))}
          </SelectField>
        )}

        {/* Direct generation and copy and paste are two ways to the same result: with a service set up, the user may still choose to paste. */}
        {directAvailable && (
          <Segmented
            label={t('ai.assistant.way')}
            value={mode}
            onChange={setChosenMode}
            options={[
              { value: 'direct', label: t('ai.assistant.directMode'), icon: 'sparkles' },
              { value: 'copy', label: t('ai.assistant.copyPasteMode'), icon: 'copy' },
            ]}
          />
        )}

        {/* Execution Section: Direct API vs Copy-Paste */}
        {mode === 'direct' ? (
          <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-surface-2 p-4">
            <div>
              <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">{t('ai.assistant.directMode')}</h3>
              <p className="mt-0.5 text-xs text-ink-muted">{t('ai.assistant.directHint', { model: config?.model ?? '' })}</p>
            </div>
            <Button variant="confirm" icon="sparkles" busy={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
              {t('ai.assistant.generate')}
            </Button>
          </div>
        ) : (
          /* Copy & Paste 3-Step Section */
          <div className="flex flex-col gap-4 rounded-md border border-line bg-surface-2 p-4">
            <div className="flex flex-col justify-between gap-3 border-b border-line pb-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">{t('ai.assistant.copyPasteMode')}</h3>
                <p className="mt-0.5 text-xs text-ink-muted">{t('ai.assistant.copyPasteHint')}</p>
              </div>
              <Button variant={copyState === 'copied' ? 'confirm' : 'secondary'} icon={copyState === 'copied' ? 'check' : 'copy'} busy={promptMutation.isPending} onClick={() => promptMutation.mutate()}>
                {/* Both labels share one grid cell, so the button keeps the width of the longer one. */}
                <span className="grid">
                  {[t('ai.assistant.copyPrompt'), t('ai.assistant.copied'), t('ai.assistant.copyPrompt')].map((text, index) => (
                    <span key={index} aria-hidden="true" className="invisible col-start-1 row-start-1">
                      {text}
                    </span>
                  ))}
                  <span className="col-start-1 row-start-1">{copyState === 'copied' ? t('ai.assistant.copied') : t('ai.assistant.copyPrompt')}</span>
                </span>
              </Button>
            </div>

            {/* One fixed place for the copy answer, sized for the longer text. */}
            <div className="relative grid">
              <div className="col-start-1 row-start-1">
                {copyState === 'copied' && <Notice tone="success">{t('ai.assistant.promptCopied')}</Notice>}
                {copyState === 'failed' && promptText && <Notice tone="warning">{t('ai.assistant.copyFailed')}</Notice>}
              </div>
              {[t('ai.assistant.promptCopied'), t('ai.assistant.copyFailed')].map((text, index) => (
                <div key={index} aria-hidden="true" data-reserved={text} className="notice-reserve-plain pointer-events-none invisible col-start-1 row-start-1 select-none" />
              ))}
              {copyState === 'failed' && promptText && manualOpen && (
                <div
                  className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border border-line-strong bg-surface p-3 shadow-pop"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setManualOpen(false)
                  }}
                >
                  <TextAreaField label={t('ai.assistant.promptLabel')} rows={5} readOnly autoFocus value={promptText} inputClassName="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
                </div>
              )}
            </div>

            <TextAreaField
              label={t('ai.assistant.pasteAnswer')}
              rows={4}
              value={rawResponse}
              onChange={(event) => setRawResponse(event.target.value)}
              placeholder={t('ai.assistant.pastePlaceholder')}
              inputClassName="font-mono text-xs"
            />

            <div className="flex justify-end">
              <Button variant="confirm" icon="check" disabled={!rawResponse.trim()} busy={parseMutation.isPending} onClick={() => parseMutation.mutate()}>
                {t('ai.assistant.parseAnswer')}
              </Button>
            </div>
          </div>
        )}

        {/* Answers a normal use can provoke (bad pasted answer, provider trouble) keep their room; anything else is laid over what is below and never covers the buttons above. */}
        <AlertSlot
          reserve={[...reserveFor(t, AI_ANSWERS, t('ai.assistant.actionFailed')), ...reserveFor(t, AI_ANSWERS, t('ai.assistant.parseFailed'))]}
          error={failure?.error ?? null}
          errorTitle={failure?.title}
          normalCodes={AI_ANSWERS}
          onDismiss={() => setFailure(null)}
        />

        {/* Parsed Result Display */}
        {renderResult()}

        {/* Dialog Actions Footer */}
        <div className="flex w-full items-center justify-between border-t border-line pt-3">
          <Button variant="ghost" small icon="settings" onClick={() => setIsSettingsOpen(true)}>
            {t('ai.assistant.openSettings')}
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>{t('ai.assistant.close')}</Button>
            {Boolean(parsedResult) && applyAvailable && (
              <Button variant="confirm" icon="check" onClick={handleApply}>
                {applyLabel}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Embedded Settings Dialog */}
      <AiSettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  )
}
