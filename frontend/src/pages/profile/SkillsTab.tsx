import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { Profile, Skill } from '../../api/types'
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
import { isValid, noRule, requiredField } from '../../validation/rules'

interface SkillForm {
  id?: string
  name: string
  category: string
  level: number
  sortOrder: number
}

const EMPTY: SkillForm = { name: '', category: '', level: 3, sortOrder: 0 }

export function SkillsTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const entry = useEntryForm<SkillForm>()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['profile'] })

  const save = useMutation({
    mutationFn: (data: SkillForm) => {
      const payload = { name: data.name.trim(), category: data.category.trim() || null, level: data.level, sortOrder: data.sortOrder }
      return data.id ? profileApi.updateSkill(data.id, payload) : profileApi.addSkill(payload)
    },
    onSuccess: () => {
      refresh()
      entry.close()
    },
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => profileApi.deleteSkill(id),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.deleteFailed')),
  })

  const askDelete = async (skill: Skill) => {
    const ok = await confirm({ title: t('profile.skills.delete'), message: t('profile.skills.deleteConfirm'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) remove.mutate(skill.id)
  }

  const edit = (skill: Skill) => entry.start({ id: skill.id, name: skill.name, category: skill.category ?? '', level: skill.level, sortOrder: skill.sortOrder })

  const form = entry.form
  const submit = () => {
    if (!form) return
    entry.markAttempted()
    if (isValid(requiredField, form.name)) save.mutate(form)
  }

  // Skills are grouped by category; those without one are shown under a heading of their own.
  const general = t('profile.skills.general')
  const categoryOf = (skill: Skill) => skill.category?.trim() || general
  const categories = Array.from(new Set(profile.skills.map(categoryOf)))

  return (
    <div className="space-y-6">
      <SectionIntro
        title={t('profile.skills.title')}
        subtitle={t('profile.skills.subtitle')}
        action={
          <Button variant="create" icon="plus" onClick={() => entry.start({ ...EMPTY, sortOrder: profile.skills.length })}>
            {t('profile.skills.add')}
          </Button>
        }
      />

      {profile.skills.length === 0 ? (
        <EmptyState icon="sparkles" title={t('profile.skills.empty')} />
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <section key={category} className="card p-5" aria-label={category}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">{category}</h3>
                <Button variant="ghost" small icon="plus" onClick={() => entry.start({ ...EMPTY, category: category === general ? '' : category, sortOrder: profile.skills.length })}>
                  {t('profile.skills.add')}
                </Button>
              </div>

              <ul className="card-grid gap-3 [--card-min:16rem]">
                {profile.skills
                  .filter((skill) => categoryOf(skill) === category)
                  .map((skill) => (
                    <li key={skill.id} className="flex items-center justify-between gap-2 rounded-sm border border-line bg-surface-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{skill.name}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          {skill.level > 0 ? (
                            <div className="flex gap-1" role="img" aria-label={t('profile.skills.levelOf', { level: skill.level })} title={`${skill.level}/5`}>
                              {[1, 2, 3, 4, 5].map((step) => (
                                <span key={step} className={`h-1.5 w-4 rounded-xs ${step <= skill.level ? 'bg-indicator' : 'bg-line'}`} />
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-ink-muted">{t('profile.skills.noLevel')}</span>
                          )}
                        </div>
                      </div>
                      <ItemActions
                        itemName={skill.name}
                        editLabel={t('profile.skills.edit')}
                        deleteLabel={t('profile.skills.delete')}
                        onEdit={() => edit(skill)}
                        onDelete={() => void askDelete(skill)}
                      />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <FormDialog
        open={entry.open}
        onClose={entry.close}
        onSubmit={submit}
        title={form?.id ? t('profile.skills.edit') : t('profile.skills.add')}
        icon="sparkles"
        size="sm"
        busy={save.isPending}
        dirty={entry.dirty}
      >
        {form && (
          <>
            <LiveTextField
              label={t('profile.skills.name')} required
              value={form.name}
              onValueChange={(value) => entry.patch({ name: value })}
              check={requiredField}
              attempted={entry.attempted}
              placeholder={t('profile.skills.namePlaceholder')}
              data-autofocus
            />
            <LiveTextField label={t('profile.skills.category')} value={form.category} onValueChange={(value) => entry.patch({ category: value })} check={noRule} placeholder={t('profile.skills.categoryPlaceholder')} />
            <SelectField label={t('profile.skills.level')} value={String(form.level)} onChange={(event) => entry.patch({ level: Number(event.target.value) })}>
              {[0, 1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {t(`profile.skills.levelLabels.${level}`)}
                </option>
              ))}
            </SelectField>
          </>
        )}
      </FormDialog>
    </div>
  )
}
