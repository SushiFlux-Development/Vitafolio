import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { Education, Profile } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { FormDialog } from '../../components/ui/FormDialog'
import { ItemActions } from '../../components/ui/ItemActions'
import { Notice } from '../../components/ui/Notice'
import { DateField } from '../../components/ui/DateField'
import { LiveTextAreaField, LiveTextField } from '../../components/ui/LiveTextField'
import { SectionIntro } from '../../components/ui/Page'
import { Toggle } from '../../components/ui/Toggle'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useEntryForm } from '../../hooks/useEntryForm'
import { hasEducationPeriod, periodText } from '../../features/profile/periodText'
import { MONTH_OPTIONAL, isStoredDateValid, isValid, noRule, requiredField } from '../../validation/rules'

interface EducationForm {
  id?: string
  degree: string
  fieldOfStudy: string
  institution: string
  city: string
  country: string
  startDate: string
  endDate: string
  isCurrent: boolean
  grade: string
  description: string
  sortOrder: number
}

const EMPTY: EducationForm = {
  degree: '',
  fieldOfStudy: '',
  institution: '',
  city: '',
  country: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  grade: '',
  description: '',
  sortOrder: 0,
}

export function EducationsTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const entry = useEntryForm<EducationForm>()
  // A date field was changed in this dialog: "no beginning and no end" is then pointed out at once, not only after a save was tried
  const [periodTouched, setPeriodTouched] = useState(false)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['profile'] })

  const save = useMutation({
    mutationFn: (data: EducationForm) => {
      const payload = {
        degree: data.degree.trim(),
        fieldOfStudy: data.fieldOfStudy.trim() || null,
        institution: data.institution.trim(),
        city: data.city.trim() || null,
        country: data.country.trim() || null,
        startDate: data.startDate.trim(),
        endDate: data.isCurrent ? null : data.endDate.trim() || null,
        isCurrent: data.isCurrent,
        grade: data.grade.trim() || null,
        description: data.description.trim() || null,
        sortOrder: data.sortOrder,
      }
      return data.id ? profileApi.updateEducation(data.id, payload) : profileApi.addEducation(payload)
    },
    onSuccess: () => {
      refresh()
      entry.close()
    },
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => profileApi.deleteEducation(id),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.deleteFailed')),
  })

  const reorder = useMutation({
    mutationFn: (ids: string[]) => profileApi.reorderEducations(ids),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const askDelete = async (education: Education) => {
    const ok = await confirm({ title: t('profile.educations.delete'), message: t('profile.educations.deleteConfirm'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) remove.mutate(education.id)
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= profile.educations.length) return
    const ids = profile.educations.map((education) => education.id)
    const [moved] = ids.splice(index, 1)
    if (moved) ids.splice(target, 0, moved)
    reorder.mutate(ids)
  }

  const openNew = () => {
    setPeriodTouched(false)
    entry.start({ ...EMPTY, sortOrder: profile.educations.length })
  }

  const edit = (education: Education) => {
    setPeriodTouched(false)
    entry.start({
      id: education.id,
      degree: education.degree,
      fieldOfStudy: education.fieldOfStudy ?? '',
      institution: education.institution,
      city: education.city ?? '',
      country: education.country ?? '',
      startDate: education.startDate,
      endDate: education.endDate ?? '',
      isCurrent: education.isCurrent,
      grade: education.grade ?? '',
      description: education.description ?? '',
      sortOrder: education.sortOrder,
    })
  }

  const form = entry.form
  const periodMissing = form !== null && !hasEducationPeriod(form)
  const submit = () => {
    if (!form) return
    entry.markAttempted()
    const valid = isValid(requiredField, form.degree) && isValid(requiredField, form.institution) && isStoredDateValid(MONTH_OPTIONAL, form.startDate) && hasEducationPeriod(form) && (form.isCurrent || isStoredDateValid(MONTH_OPTIONAL, form.endDate))
    if (valid) save.mutate(form)
  }

  return (
    <div className="space-y-6">
      <SectionIntro
        title={t('profile.educations.title')}
        subtitle={t('profile.educations.subtitle')}
        action={
          <Button variant="create" icon="plus" onClick={openNew}>
            {t('profile.educations.add')}
          </Button>
        }
      />
      <Notice tone="info">{t('profile.educations.schoolHint')}</Notice>

      {profile.educations.length === 0 ? (
        <EmptyState icon="timeline" title={t('profile.educations.empty')} />
      ) : (
        <ul className="card-grid gap-3 [--card-min:32rem]">
          {profile.educations.map((education, index) => (
            <li key={education.id} className="card flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-semibold text-ink">{education.degree}</h3>
                  {education.fieldOfStudy && <span className="text-sm font-medium text-ink">({education.fieldOfStudy})</span>}
                  <span className="text-sm text-ink-muted">{t('profile.educations.at', { institution: education.institution })}</span>
                  {education.grade && <span className="badge badge-select">{t('profile.educations.gradeBadge', { grade: education.grade })}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-muted">
                  <span>
                    {periodText(dates.stored, education, { now: t('profile.educations.isCurrent'), ongoing: t('profile.educations.ongoing') }) || '–'}
                  </span>
                  {(education.city || education.country) && <span>{[education.city, education.country].filter(Boolean).join(', ')}</span>}
                </div>
                {education.description && <p className="mt-3 text-sm whitespace-pre-line text-ink">{education.description}</p>}
              </div>

              <ItemActions
                itemName={education.degree}
                editLabel={t('profile.educations.edit')}
                deleteLabel={t('profile.educations.delete')}
                onEdit={() => edit(education)}
                onDelete={() => void askDelete(education)}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                disableMoveUp={index === 0}
                disableMoveDown={index === profile.educations.length - 1}
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
        title={form?.id ? t('profile.educations.edit') : t('profile.educations.add')}
        icon="timeline"
        busy={save.isPending}
        dirty={entry.dirty}
      >
        {form && (
          <>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <LiveTextField
                label={t('profile.educations.degree')} required
                value={form.degree}
                onValueChange={(value) => entry.patch({ degree: value })}
                check={requiredField}
                attempted={entry.attempted}
                placeholder={t('profile.educations.degreePlaceholder')}
                data-autofocus
              />
              <LiveTextField label={t('profile.educations.fieldOfStudy')} value={form.fieldOfStudy} onValueChange={(value) => entry.patch({ fieldOfStudy: value })} check={noRule} />
            </div>

            <LiveTextField label={t('profile.educations.institution')} required value={form.institution} onValueChange={(value) => entry.patch({ institution: value })} check={requiredField} attempted={entry.attempted} />

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
              <LiveTextField label={t('profile.educations.city')} value={form.city} onValueChange={(value) => entry.patch({ city: value })} check={noRule} />
              <LiveTextField label={t('profile.educations.country')} value={form.country} onValueChange={(value) => entry.patch({ country: value })} check={noRule} />
              <LiveTextField label={t('profile.educations.grade')} value={form.grade} onValueChange={(value) => entry.patch({ grade: value })} check={noRule} placeholder={t('profile.educations.gradePlaceholder')} />
            </div>

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <DateField
                label={t('profile.educations.startDate')}
                spec={MONTH_OPTIONAL}
                value={form.startDate}
                onValueChange={(value) => {
                  setPeriodTouched(true)
                  entry.patch({ startDate: value })
                }}
                attempted={entry.attempted}
                hint={t('profile.educations.periodHint')}
                serverError={periodMissing && (entry.attempted || periodTouched) ? t('rules.education.periodRequired') : undefined}
                serverKeys={['rules.education.periodRequired']}
              />
              <DateField
                label={t('profile.educations.endDate')}
                spec={MONTH_OPTIONAL}
                value={form.isCurrent ? '' : form.endDate}
                onValueChange={(value) => {
                  setPeriodTouched(true)
                  entry.patch({ endDate: value })
                }}
                attempted={entry.attempted}
                disabled={form.isCurrent}
              />
            </div>

            <Toggle label={t('profile.educations.isCurrent')} checked={form.isCurrent} onChange={(checked) => entry.patch({ isCurrent: checked })} />

            <LiveTextAreaField label={t('profile.educations.description')} rows={4} value={form.description} onValueChange={(value) => entry.patch({ description: value })} check={noRule} />
          </>
        )}
      </FormDialog>
    </div>
  )
}
