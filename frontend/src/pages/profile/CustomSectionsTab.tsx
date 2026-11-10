import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { CustomSection, CustomSectionItem, Profile } from '../../api/types'
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

interface SectionForm {
  id?: string
  title: string
  sortOrder: number
}

interface ItemForm {
  id?: string
  title: string
  subtitle: string
  dateRange: string
  description: string
  sortOrder: number
}

export function CustomSectionsTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const sectionEntry = useEntryForm<SectionForm>()
  const itemEntry = useEntryForm<ItemForm>()
  // The section a new or changed entry belongs to.
  const [itemSectionId, setItemSectionId] = useState<string | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['profile'] })

  const saveSection = useMutation({
    mutationFn: (data: SectionForm) => {
      const payload = { title: data.title.trim(), sortOrder: data.sortOrder }
      return data.id ? profileApi.updateCustomSection(data.id, payload) : profileApi.addCustomSection(payload)
    },
    onSuccess: () => {
      refresh()
      sectionEntry.close()
    },
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const removeSection = useMutation({
    mutationFn: (id: string) => profileApi.deleteCustomSection(id),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.deleteFailed')),
  })

  const saveItem = useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: ItemForm }) => {
      const payload = {
        title: data.title.trim(),
        subtitle: data.subtitle.trim() || null,
        dateRange: data.dateRange.trim() || null,
        description: data.description.trim() || null,
        sortOrder: data.sortOrder,
      }
      return data.id ? profileApi.updateCustomSectionItem(sectionId, data.id, payload) : profileApi.addCustomSectionItem(sectionId, payload)
    },
    onSuccess: () => {
      refresh()
      itemEntry.close()
    },
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const removeItem = useMutation({
    mutationFn: ({ sectionId, itemId }: { sectionId: string; itemId: string }) => profileApi.deleteCustomSectionItem(sectionId, itemId),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.deleteFailed')),
  })

  const askDeleteSection = async (section: CustomSection) => {
    const ok = await confirm({ title: t('profile.customSections.deleteSection'), message: t('profile.customSections.deleteSectionConfirm'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) removeSection.mutate(section.id)
  }

  const askDeleteItem = async (sectionId: string, item: CustomSectionItem) => {
    const ok = await confirm({ title: t('profile.customSections.deleteItem'), message: t('profile.customSections.deleteItemConfirm'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) removeItem.mutate({ sectionId, itemId: item.id })
  }

  const newItem = (section: CustomSection) => {
    setItemSectionId(section.id)
    itemEntry.start({ title: '', subtitle: '', dateRange: '', description: '', sortOrder: section.items.length })
  }

  const editItem = (sectionId: string, item: CustomSectionItem) => {
    setItemSectionId(sectionId)
    itemEntry.start({ id: item.id, title: item.title, subtitle: item.subtitle ?? '', dateRange: item.dateRange ?? '', description: item.description ?? '', sortOrder: item.sortOrder })
  }

  const sectionForm = sectionEntry.form
  const submitSection = () => {
    if (!sectionForm) return
    sectionEntry.markAttempted()
    if (isValid(requiredField, sectionForm.title)) saveSection.mutate(sectionForm)
  }

  const itemForm = itemEntry.form
  const submitItem = () => {
    if (!itemForm || !itemSectionId) return
    itemEntry.markAttempted()
    if (isValid(requiredField, itemForm.title)) saveItem.mutate({ sectionId: itemSectionId, data: itemForm })
  }

  return (
    <div className="space-y-6">
      <SectionIntro
        title={t('profile.customSections.title')}
        subtitle={t('profile.customSections.subtitle')}
        action={
          <Button variant="create" icon="plus" onClick={() => sectionEntry.start({ title: '', sortOrder: profile.customSections.length })}>
            {t('profile.customSections.addSection')}
          </Button>
        }
      />

      {profile.customSections.length === 0 ? (
        <EmptyState icon="files" title={t('profile.customSections.empty')} />
      ) : (
        <div className="card-grid items-start gap-6 [--card-min:32rem]">
          {profile.customSections.map((section) => (
            <section key={section.id} className="card p-5" aria-label={section.title}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <h3 className="text-base font-semibold text-ink">{section.title}</h3>
                <div className="flex items-center gap-1.5">
                  <Button variant="create" small icon="plus" onClick={() => newItem(section)}>
                    {t('profile.customSections.addItem')}
                  </Button>
                  <ItemActions
                    itemName={section.title}
                    editLabel={t('profile.customSections.editSection')}
                    deleteLabel={t('profile.customSections.deleteSection')}
                    onEdit={() => sectionEntry.start({ id: section.id, title: section.title, sortOrder: section.sortOrder })}
                    onDelete={() => void askDeleteSection(section)}
                  />
                </div>
              </div>

              {section.items.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-muted">{t('profile.customSections.emptyItems')}</p>
              ) : (
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 rounded-sm border border-line bg-surface-2 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="font-semibold text-ink">{item.title}</p>
                          {item.subtitle && <span className="text-xs text-ink-muted">({item.subtitle})</span>}
                          {item.dateRange && <span className="badge badge-select">{item.dateRange}</span>}
                        </div>
                        {item.description && <p className="mt-1 text-sm whitespace-pre-line text-ink">{item.description}</p>}
                      </div>
                      <ItemActions
                        itemName={item.title}
                        editLabel={t('profile.customSections.editItem')}
                        deleteLabel={t('profile.customSections.deleteItem')}
                        onEdit={() => editItem(section.id, item)}
                        onDelete={() => void askDeleteItem(section.id, item)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <FormDialog
        open={sectionEntry.open}
        onClose={sectionEntry.close}
        onSubmit={submitSection}
        title={sectionForm?.id ? t('profile.customSections.editSection') : t('profile.customSections.addSection')}
        icon="files"
        size="sm"
        busy={saveSection.isPending}
        dirty={sectionEntry.dirty}
      >
        {sectionForm && (
          <LiveTextField
            label={t('profile.customSections.sectionTitle')} required
            value={sectionForm.title}
            onValueChange={(value) => sectionEntry.patch({ title: value })}
            check={requiredField}
            attempted={sectionEntry.attempted}
            placeholder={t('profile.customSections.sectionPlaceholder')}
            data-autofocus
          />
        )}
      </FormDialog>

      <FormDialog
        open={itemEntry.open}
        onClose={itemEntry.close}
        onSubmit={submitItem}
        title={itemForm?.id ? t('profile.customSections.editItem') : t('profile.customSections.addItem')}
        icon="fileText"
        busy={saveItem.isPending}
        dirty={itemEntry.dirty}
      >
        {itemForm && (
          <>
            <LiveTextField
              label={t('profile.customSections.itemTitle')} required
              value={itemForm.title}
              onValueChange={(value) => itemEntry.patch({ title: value })}
              check={requiredField}
              attempted={itemEntry.attempted}
              data-autofocus
            />
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <LiveTextField label={t('profile.customSections.itemSubtitle')} value={itemForm.subtitle} onValueChange={(value) => itemEntry.patch({ subtitle: value })} check={noRule} />
              <LiveTextField
                label={t('profile.customSections.itemDate')}
                value={itemForm.dateRange}
                onValueChange={(value) => itemEntry.patch({ dateRange: value })}
                check={noRule}
                placeholder={t('profile.customSections.itemDatePlaceholder')}
              />
            </div>
            <LiveTextAreaField label={t('profile.customSections.itemDescription')} rows={3} value={itemForm.description} onValueChange={(value) => itemEntry.patch({ description: value })} check={noRule} />
          </>
        )}
      </FormDialog>
    </div>
  )
}
