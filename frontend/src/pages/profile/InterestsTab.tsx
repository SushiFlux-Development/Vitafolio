import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { Interest, Profile } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { FormDialog } from '../../components/ui/FormDialog'
import { ItemActions } from '../../components/ui/ItemActions'
import { LiveTextAreaField, LiveTextField } from '../../components/ui/LiveTextField'
import { SectionIntro } from '../../components/ui/Page'
import { useEntryForm } from '../../hooks/useEntryForm'
import { isValid, noRule, requiredField } from '../../validation/rules'

interface InterestForm {
  id?: string
  name: string
  category: string
  description: string
  sortOrder: number
}

const EMPTY: InterestForm = { name: '', category: '', description: '', sortOrder: 0 }

export function InterestsTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const entry = useEntryForm<InterestForm>()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['profile'] })

  const save = useMutation({
    mutationFn: (data: InterestForm) => {
      const payload = { name: data.name.trim(), category: data.category.trim() || null, description: data.description.trim() || null, sortOrder: data.sortOrder }
      return data.id ? profileApi.updateInterest(data.id, payload) : profileApi.addInterest(payload)
    },
    onSuccess: () => {
      refresh()
      entry.close()
    },
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => profileApi.deleteInterest(id),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.deleteFailed')),
  })

  const askDelete = async (interest: Interest) => {
    const ok = await confirm({ title: t('profile.interests.delete'), message: t('profile.interests.deleteConfirm'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) remove.mutate(interest.id)
  }

  const edit = (interest: Interest) =>
    entry.start({ id: interest.id, name: interest.name, category: interest.category ?? '', description: interest.description ?? '', sortOrder: interest.sortOrder })

  const form = entry.form
  const submit = () => {
    if (!form) return
    entry.markAttempted()
    if (isValid(requiredField, form.name)) save.mutate(form)
  }

  return (
    <div className="space-y-6">
      <SectionIntro
        title={t('profile.interests.title')}
        subtitle={t('profile.interests.subtitle')}
        action={
          <Button variant="create" icon="plus" onClick={() => entry.start({ ...EMPTY, sortOrder: profile.interests.length })}>
            {t('profile.interests.add')}
          </Button>
        }
      />

      {profile.interests.length === 0 ? (
        <EmptyState icon="sun" title={t('profile.interests.empty')} />
      ) : (
        <ul className="card-grid [--card-min:18rem]">
          {profile.interests.map((interest) => (
            <li key={interest.id} className="card flex flex-col justify-between gap-4 p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink">{interest.name}</h3>
                  {interest.category && <span className="badge badge-select">{interest.category}</span>}
                </div>
                {interest.description && <p className="mt-2 text-sm text-ink-muted">{interest.description}</p>}
              </div>
              <div className="flex justify-end border-t border-line pt-2">
                <ItemActions
                  itemName={interest.name}
                  editLabel={t('profile.interests.edit')}
                  deleteLabel={t('profile.interests.delete')}
                  onEdit={() => edit(interest)}
                  onDelete={() => void askDelete(interest)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        open={entry.open}
        onClose={entry.close}
        onSubmit={submit}
        title={form?.id ? t('profile.interests.edit') : t('profile.interests.add')}
        icon="sun"
        size="sm"
        busy={save.isPending}
        dirty={entry.dirty}
      >
        {form && (
          <>
            <LiveTextField
              label={t('profile.interests.name')} required
              value={form.name}
              onValueChange={(value) => entry.patch({ name: value })}
              check={requiredField}
              attempted={entry.attempted}
              placeholder={t('profile.interests.namePlaceholder')}
              data-autofocus
            />
            <LiveTextField label={t('profile.interests.category')} value={form.category} onValueChange={(value) => entry.patch({ category: value })} check={noRule} placeholder={t('profile.interests.categoryPlaceholder')} />
            <LiveTextAreaField label={t('profile.interests.description')} rows={3} value={form.description} onValueChange={(value) => entry.patch({ description: value })} check={noRule} />
          </>
        )}
      </FormDialog>
    </div>
  )
}
