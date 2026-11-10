import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { Experience, Profile } from '../../api/types'
import { AiAssistantModal } from '../../components/ai/AiAssistantModal'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { FormDialog } from '../../components/ui/FormDialog'
import { ItemActions } from '../../components/ui/ItemActions'
import { DateField } from '../../components/ui/DateField'
import { LiveTextAreaField, LiveTextField } from '../../components/ui/LiveTextField'
import { SectionIntro } from '../../components/ui/Page'
import { Toggle } from '../../components/ui/Toggle'
import { replaceBullet } from '../../features/ai/bullets'
import { GapAnalyzerCard } from '../../features/profile/GapAnalyzerCard'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useEntryForm } from '../../hooks/useEntryForm'
import { MONTH_OPTIONAL, MONTH_REQUIRED, isStoredDateValid, isValid, noRule, requiredField } from '../../validation/rules'

interface ExperienceForm {
  id?: string
  jobTitle: string
  employer: string
  employmentType: string
  city: string
  country: string
  startDate: string
  endDate: string
  isCurrent: boolean
  description: string
  sortOrder: number
}

const EMPTY: ExperienceForm = {
  jobTitle: '',
  employer: '',
  employmentType: '',
  city: '',
  country: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  description: '',
  sortOrder: 0,
}

export function ExperiencesTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const entry = useEntryForm<ExperienceForm>()
  const [aiOpen, setAiOpen] = useState(false)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['profile'] })

  const save = useMutation({
    mutationFn: (data: ExperienceForm) => {
      const payload = {
        jobTitle: data.jobTitle.trim(),
        employer: data.employer.trim(),
        employmentType: data.employmentType.trim() || null,
        city: data.city.trim() || null,
        country: data.country.trim() || null,
        startDate: data.startDate.trim(),
        endDate: data.isCurrent ? null : data.endDate.trim() || null,
        isCurrent: data.isCurrent,
        description: data.description.trim() || null,
        sortOrder: data.sortOrder,
      }
      return data.id ? profileApi.updateExperience(data.id, payload) : profileApi.addExperience(payload)
    },
    onSuccess: () => {
      refresh()
      entry.close()
    },
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => profileApi.deleteExperience(id),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.deleteFailed')),
  })

  const reorder = useMutation({
    mutationFn: (ids: string[]) => profileApi.reorderExperiences(ids),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const askDelete = async (experience: Experience) => {
    const ok = await confirm({ title: t('profile.experiences.delete'), message: t('profile.experiences.deleteConfirm'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) remove.mutate(experience.id)
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= profile.experiences.length) return
    const ids = profile.experiences.map((experience) => experience.id)
    const [moved] = ids.splice(index, 1)
    if (moved) ids.splice(target, 0, moved)
    reorder.mutate(ids)
  }

  const edit = (experience: Experience) =>
    entry.start({
      id: experience.id,
      jobTitle: experience.jobTitle,
      employer: experience.employer,
      employmentType: experience.employmentType ?? '',
      city: experience.city ?? '',
      country: experience.country ?? '',
      startDate: experience.startDate,
      endDate: experience.endDate ?? '',
      isCurrent: experience.isCurrent,
      description: experience.description ?? '',
      sortOrder: experience.sortOrder,
    })

  // The entry for a gap is written in the interface language, like everything else the user did not type.
  const fillGap = (start: string, end: string, title: string) =>
    entry.start({ ...EMPTY, jobTitle: title, employer: t('profile.gaps.employer'), startDate: start, endDate: end, sortOrder: profile.experiences.length })

  const form = entry.form
  const submit = () => {
    if (!form) return
    entry.markAttempted()
    const valid = isValid(requiredField, form.jobTitle) && isValid(requiredField, form.employer) && isStoredDateValid(MONTH_REQUIRED, form.startDate) && (form.isCurrent || isStoredDateValid(MONTH_OPTIONAL, form.endDate))
    if (valid) save.mutate(form)
  }

  return (
    <div className="space-y-6">
      <SectionIntro
        title={t('profile.experiences.title')}
        subtitle={t('profile.experiences.subtitle')}
        action={
          <Button variant="create" icon="plus" onClick={() => entry.start({ ...EMPTY, sortOrder: profile.experiences.length })} data-hint="experiences-add">
            {t('profile.experiences.add')}
          </Button>
        }
      />

      <GapAnalyzerCard profile={profile} onQuickAdd={fillGap} />

      {profile.experiences.length === 0 ? (
        <EmptyState icon="briefcase" title={t('profile.experiences.empty')} />
      ) : (
        <ul className="card-grid gap-3 [--card-min:32rem]">
          {profile.experiences.map((experience, index) => (
            <li key={experience.id} className="card flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-semibold text-ink">{experience.jobTitle}</h3>
                  <span className="text-sm font-medium text-ink-muted">{t('profile.experiences.at', { employer: experience.employer })}</span>
                  {experience.employmentType && <span className="badge badge-select">{experience.employmentType}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-muted">
                  <span>
                    {dates.stored(experience.startDate)} – {experience.isCurrent ? t('profile.experiences.isCurrent') : dates.stored(experience.endDate) || '–'}
                  </span>
                  {(experience.city || experience.country) && <span>{[experience.city, experience.country].filter(Boolean).join(', ')}</span>}
                </div>
                {experience.description && <p className="mt-3 text-sm whitespace-pre-line text-ink">{experience.description}</p>}
              </div>

              <ItemActions
                itemName={experience.jobTitle}
                editLabel={t('profile.experiences.edit')}
                deleteLabel={t('profile.experiences.delete')}
                onEdit={() => edit(experience)}
                onDelete={() => void askDelete(experience)}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                disableMoveUp={index === 0}
                disableMoveDown={index === profile.experiences.length - 1}
                busy={reorder.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        open={entry.open}
        onClose={entry.close}
        onSubmit={submit}
        title={form?.id ? t('profile.experiences.edit') : t('profile.experiences.add')}
        icon="briefcase"
        busy={save.isPending}
        dirty={entry.dirty}
      >
        {form && (
          <>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <LiveTextField label={t('profile.experiences.jobTitle')} required value={form.jobTitle} onValueChange={(value) => entry.patch({ jobTitle: value })} check={requiredField} attempted={entry.attempted} data-autofocus />
              <LiveTextField label={t('profile.experiences.employer')} required value={form.employer} onValueChange={(value) => entry.patch({ employer: value })} check={requiredField} attempted={entry.attempted} />
            </div>

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
              <LiveTextField
                label={t('profile.experiences.employmentType')}
                value={form.employmentType}
                onValueChange={(value) => entry.patch({ employmentType: value })}
                check={noRule}
                placeholder={t('profile.experiences.employmentTypePlaceholder')}
              />
              <LiveTextField label={t('profile.experiences.city')} value={form.city} onValueChange={(value) => entry.patch({ city: value })} check={noRule} />
              <LiveTextField label={t('profile.experiences.country')} value={form.country} onValueChange={(value) => entry.patch({ country: value })} check={noRule} />
            </div>

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <DateField
                label={t('profile.experiences.startDate')}
                spec={MONTH_REQUIRED}
                value={form.startDate}
                onValueChange={(value) => entry.patch({ startDate: value })}
                attempted={entry.attempted}
              />
              {/* Stays in place when "current position" is on (only disabled): the form must not change shape. */}
              <DateField
                label={t('profile.experiences.endDate')}
                spec={MONTH_OPTIONAL}
                value={form.isCurrent ? '' : form.endDate}
                onValueChange={(value) => entry.patch({ endDate: value })}
                attempted={entry.attempted}
                disabled={form.isCurrent}
              />
            </div>

            <Toggle label={t('profile.experiences.isCurrent')} checked={form.isCurrent} onChange={(checked) => entry.patch({ isCurrent: checked })} />

            <div>
              <LiveTextAreaField label={t('profile.experiences.description')} rows={4} value={form.description} onValueChange={(value) => entry.patch({ description: value })} check={noRule} />
              <div className="mt-2">
                <Button small icon="sparkles" disabled={form.description.trim() === ''} onClick={() => setAiOpen(true)} data-testid="description-ai">
                  {t('ai.entry.improveBullets')}
                </Button>
              </div>
            </div>
          </>
        )}
      </FormDialog>

      {form && aiOpen && (
        <AiAssistantModal
          open
          onClose={() => setAiOpen(false)}
          task="improve_bullet"
          initialJobTitle={form.jobTitle}
          initialText={form.description}
          onApplyBullet={(result, source) => entry.patch({ description: replaceBullet(form.description, source, result.improved) })}
        />
      )}
    </div>
  )
}
