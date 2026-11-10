import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { fieldErrors } from '../../api/errors'
import { profileApi } from '../../api/endpoints'
import type { PersonalDataPayload, Profile } from '../../api/types'
import { AiAssistantModal } from '../../components/ai/AiAssistantModal'
import { AutoSaveStatus } from '../../components/ui/AutoSaveStatus'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { Icon } from '../../components/ui/Icon'
import { DateField } from '../../components/ui/DateField'
import { LiveTextAreaField, LiveTextField } from '../../components/ui/LiveTextField'
import { DAY_OPTIONAL, emailCheck, noRule, requiredField, urlCheck } from '../../validation/rules'
import { isPersonalSendable } from './personalForm'
import type { PersonalForm } from './usePersonalForm'

interface PersonalTabProps {
  profile: Profile
  /** The personal data as a form that saves by itself. It lives in the page, so it survives a switch of section or view. */
  form: PersonalForm
}

export function PersonalTab({ profile, form: personal }: PersonalTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  // A submit (Enter) that finds something missing marks every problem, also in fields nobody touched.
  const [attempted, setAttempted] = useState(false)
  // Which AI helper is open for the short profile: write it, or translate what is there.
  const [ai, setAi] = useState<'summary' | 'translate' | null>(null)

  const form = personal.value
  // What the server said about single fields when it refused the values; it goes at the field and is gone with the next edit.
  const refused = personal.state.failure?.kind === 'validation' ? fieldErrors(t, personal.state.failure.error) : {}
  const text = (field: keyof PersonalDataPayload) => ({
    value: (form[field] as string | null | undefined) ?? '',
    onValueChange: (value: string) => personal.change({ [field]: value }),
    attempted,
    serverError: refused[field],
  })

  // Leaving the section (or the assistant step) sends what is still waiting; the save itself carries on in the page.
  const { flush } = personal
  useEffect(
    () => () => {
      void flush()
    },
    [flush],
  )

  const uploadPhoto = useMutation({
    mutationFn: profileApi.uploadPhoto,
    onSuccess: () => {
      personal.photoChanged()
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: (error) => showError(error, t('profile.personal.photoUploadFailed')),
  })

  const deletePhoto = useMutation({
    mutationFn: profileApi.deletePhoto,
    onSuccess: () => {
      personal.photoChanged()
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: (error) => showError(error, t('profile.personal.photoDeleteFailed')),
  })

  const askDeletePhoto = async () => {
    const ok = await confirm({ title: t('profile.personal.photoDelete'), message: t('profile.personal.photoDeleteConfirm'), confirmLabel: t('profile.personal.photoDelete'), tone: 'danger' })
    if (ok) deletePhoto.mutate()
  }

  const handlePhotoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // The same file can be chosen again later.
    event.target.value = ''
    if (file) uploadPhoto.mutate(file)
  }

  // Enter sends at once instead of waiting for the quiet period; if something is missing, the fields say what.
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!isPersonalSendable(form)) setAttempted(true)
    void personal.flush()
  }

  // What stops the input from being saved, in words; the room of the longest of these is held in the status.
  const blockedTexts = useMemo(
    () => ({
      both: t('profile.personal.autoSave.namesMissing'),
      first: t('profile.personal.autoSave.firstNameMissing'),
      last: t('profile.personal.autoSave.lastNameMissing'),
      red: t('autoSave.invalid'),
      unfinished: t('autoSave.unfinished'),
    }),
    [t],
  )
  const { missing, red } = personal.issues
  const blockedText =
    missing.length === 2 ? blockedTexts.both : missing[0] === 'firstName' ? blockedTexts.first : missing[0] === 'lastName' ? blockedTexts.last : red ? blockedTexts.red : blockedTexts.unfinished

  const initials = `${form.firstName.slice(0, 1)}${form.lastName.slice(0, 1)}`.toUpperCase() || '?'

  return (
    // From a big window on, the photo sits in a narrow column beside the form instead of in a card of its own above it.
    <div className="grid items-start gap-6 2xl:grid-cols-[20rem_minmax(0,1fr)]">
      {/* Photo card */}
      <section className="card p-5" aria-labelledby="heading-photo">
        <h2 id="heading-photo" className="text-base font-semibold text-ink">
          {t('profile.personal.photo')}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t('profile.personal.photoHint')}</p>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2">
            {profile.hasPhoto ? (
              <img src={`/api/profile/photo?v=${personal.photoVersion}`} alt={`${form.firstName} ${form.lastName}`.trim()} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-select-ink">{initials}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="btn btn-secondary cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus" aria-busy={uploadPhoto.isPending || undefined}>
              <span className="inline-flex items-center gap-2">
                <Icon name={uploadPhoto.isPending ? 'loader' : 'upload'} size={17} className={uploadPhoto.isPending ? 'animate-spin' : ''} />
                {profile.hasPhoto ? t('profile.personal.photoChange') : t('profile.personal.photoUpload')}
              </span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handlePhotoSelect} disabled={uploadPhoto.isPending} />
            </label>

            {profile.hasPhoto && (
              <Button variant="danger-outline" icon="trash" busy={deletePhoto.isPending} onClick={() => void askDeletePhoto()}>
                {t('profile.personal.photoDelete')}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Main personal data form */}
      <form onSubmit={handleSubmit} noValidate className="card space-y-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">{t('profile.personal.title')}</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t('profile.personal.subtitle')}</p>
          </div>
          {/* The state of the saving shares one place in the header line, with the room of the longest text held from the start. */}
          <div className="shrink-0" data-hint="profile-autosave">
            <AutoSaveStatus
              state={personal.state}
              incomplete={missing.length > 0}
              failureTitle={t('common.saveFailed')}
              blocked={{ text: blockedText, all: Object.values(blockedTexts) }}
              restoredAt={personal.restoredAt}
            />
          </div>
        </div>

        {/* The groups stand side by side as soon as two of them fit (30 rem each); their fields wrap in the same way. */}
        <div className="grid gap-x-10 gap-y-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,30rem),1fr))]">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('profile.personal.nameHeading')}</h3>
            <div className="field-grid">
              <LiveTextField label={t('profile.personal.academicTitle')} check={noRule} placeholder={t('profile.personal.academicTitlePlaceholder')} {...text('academicTitle')} />
              <LiveTextField label={t('profile.personal.firstName')} required check={requiredField} {...text('firstName')} />
              <LiveTextField label={t('profile.personal.lastName')} required check={requiredField} {...text('lastName')} />
              <LiveTextField label={t('profile.personal.professionalTitle')} check={noRule} placeholder={t('profile.personal.professionalTitlePlaceholder')} {...text('professionalTitle')} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('profile.personal.contactHeading')}</h3>
            <div className="field-grid">
              <LiveTextField label={t('profile.personal.email')} type="email" check={emailCheck} {...text('email')} />
              <LiveTextField label={t('profile.personal.phone')} type="tel" check={noRule} {...text('phone')} />
              <LiveTextField label={t('profile.personal.street')} check={noRule} {...text('street')} />
              <LiveTextField label={t('profile.personal.postalCode')} check={noRule} {...text('postalCode')} />
              <LiveTextField label={t('profile.personal.city')} check={noRule} {...text('city')} />
              <LiveTextField label={t('profile.personal.country')} check={noRule} {...text('country')} />
              <LiveTextField label={t('profile.personal.nationality')} check={noRule} {...text('nationality')} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('profile.personal.personHeading')}</h3>
            <div className="field-grid">
              <DateField label={t('profile.personal.dateOfBirth')} spec={DAY_OPTIONAL} {...text('dateOfBirth')} />
              <LiveTextField label={t('profile.personal.placeOfBirth')} check={noRule} {...text('placeOfBirth')} />
              <LiveTextField label={t('profile.personal.maritalStatus')} check={noRule} {...text('maritalStatus')} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('profile.personal.linksHeading')}</h3>
            <div className="field-grid">
              <LiveTextField label={t('profile.personal.website')} type="url" check={urlCheck} placeholder="https://…" {...text('website')} />
              <LiveTextField label={t('profile.personal.linkedIn')} type="url" check={urlCheck} placeholder="https://linkedin.com/in/…" {...text('linkedIn')} />
              <LiveTextField label={t('profile.personal.gitHub')} type="url" check={urlCheck} placeholder="https://github.com/…" {...text('gitHub')} />
              <LiveTextField label={t('profile.personal.xing')} type="url" check={urlCheck} placeholder="https://xing.com/profile/…" {...text('xing')} />
            </div>
          </div>
        </div>

        {/* Bio / Kurzprofil: running text, so it keeps a readable line length however wide the window is. */}
        <div className="border-t border-line pt-4">
          <div className="max-w-3xl">
            <LiveTextAreaField label={t('profile.personal.bio')} hint={t('profile.personal.bioHint')} rows={4} check={noRule} {...text('bio')} />
            <div className="mt-2 flex flex-wrap gap-2" data-hint="profile-ai">
              <Button small icon="sparkles" onClick={() => setAi('summary')} data-testid="bio-ai-summary">
                {t('ai.entry.summary')}
              </Button>
              <Button small icon="language" disabled={!(form.bio ?? '').trim()} onClick={() => setAi('translate')} data-testid="bio-ai-translate">
                {t('ai.entry.translate')}
              </Button>
            </div>
          </div>
        </div>

        {/* No visible button: the form saves by itself. This one only makes Enter in a field send at once (implicit submission). */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>

      {ai === 'summary' && (
        <AiAssistantModal
          open
          onClose={() => setAi(null)}
          task="generate_summary"
          onApplySummary={(result) => personal.change({ bio: result.shortSummary })}
        />
      )}
      {ai === 'translate' && (
        <AiAssistantModal
          open
          onClose={() => setAi(null)}
          task="translate_content"
          initialText={form.bio ?? ''}
          onApplyTranslation={(result) => personal.change({ bio: result.translatedText })}
        />
      )}
    </div>
  )
}
