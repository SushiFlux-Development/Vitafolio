import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { LanguageSkill, Profile } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { FormDialog } from '../../components/ui/FormDialog'
import { ItemActions } from '../../components/ui/ItemActions'
import { LiveTextField } from '../../components/ui/LiveTextField'
import { SectionIntro } from '../../components/ui/Page'
import { SelectField } from '../../components/ui/SelectField'
import { useEntryForm } from '../../hooks/useEntryForm'
import { isValid, requiredField } from '../../validation/rules'

interface LanguageForm {
  id?: string
  language: string
  level: string
  sortOrder: number
}

const EMPTY: LanguageForm = { language: '', level: 'B2', sortOrder: 0 }

const STANDARD_LEVELS = ['native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'] as const

export function LanguagesTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const entry = useEntryForm<LanguageForm>()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['profile'] })

  const save = useMutation({
    mutationFn: (data: LanguageForm) => {
      const payload = { language: data.language.trim(), level: data.level, sortOrder: data.sortOrder }
      return data.id ? profileApi.updateLanguage(data.id, payload) : profileApi.addLanguage(payload)
    },
    onSuccess: () => {
      refresh()
      entry.close()
    },
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => profileApi.deleteLanguage(id),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.deleteFailed')),
  })

  const askDelete = async (language: LanguageSkill) => {
    const ok = await confirm({ title: t('profile.languages.delete'), message: t('profile.languages.deleteConfirm'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) remove.mutate(language.id)
  }

  const edit = (language: LanguageSkill) => entry.start({ id: language.id, language: language.language, level: language.level, sortOrder: language.sortOrder })

  // A level that is not one of the standard ones (an older entry) is shown as it was typed.
  const levelLabel = (level: string) => ((STANDARD_LEVELS as readonly string[]).includes(level) ? t(`profile.languages.levels.${level}`) : level)

  const form = entry.form
  const submit = () => {
    if (!form) return
    entry.markAttempted()
    if (isValid(requiredField, form.language)) save.mutate(form)
  }

  return (
    <div className="space-y-6">
      <SectionIntro
        title={t('profile.languages.title')}
        subtitle={t('profile.languages.subtitle')}
        action={
          <Button variant="create" icon="plus" onClick={() => entry.start({ ...EMPTY, sortOrder: profile.languages.length })}>
            {t('profile.languages.add')}
          </Button>
        }
      />

      {profile.languages.length === 0 ? (
        <EmptyState icon="language" title={t('profile.languages.empty')} />
      ) : (
        <ul className="card-grid [--card-min:18rem]">
          {profile.languages.map((language) => (
            <li key={language.id} className="card flex items-center justify-between gap-2 p-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-ink">{language.language}</h3>
                <span className="badge badge-select mt-1.5">{levelLabel(language.level)}</span>
              </div>
              <ItemActions
                itemName={language.language}
                editLabel={t('profile.languages.edit')}
                deleteLabel={t('profile.languages.delete')}
                onEdit={() => edit(language)}
                onDelete={() => void askDelete(language)}
              />
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        open={entry.open}
        onClose={entry.close}
        onSubmit={submit}
        title={form?.id ? t('profile.languages.edit') : t('profile.languages.add')}
        icon="language"
        size="sm"
        busy={save.isPending}
        dirty={entry.dirty}
      >
        {form && (
          <>
            <LiveTextField
              label={t('profile.languages.language')} required
              value={form.language}
              onValueChange={(value) => entry.patch({ language: value })}
              check={requiredField}
              attempted={entry.attempted}
              placeholder={t('profile.languages.languagePlaceholder')}
              data-autofocus
            />
            <SelectField label={t('profile.languages.level')} value={form.level} onChange={(event) => entry.patch({ level: event.target.value })}>
              {STANDARD_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`profile.languages.levels.${level}`)}
                </option>
              ))}
              {!(STANDARD_LEVELS as readonly string[]).includes(form.level) && <option value={form.level}>{form.level}</option>}
            </SelectField>
          </>
        )}
      </FormDialog>
    </div>
  )
}
