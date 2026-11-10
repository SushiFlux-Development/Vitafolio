import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { attachmentsApi } from '../../api/endpoints'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { Icon } from '../../components/ui/Icon'
import { ItemActions } from '../../components/ui/ItemActions'
import { LiveTextField } from '../../components/ui/LiveTextField'
import { ErrorNotice, Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { formatBytes } from '../../format'
import { noRule } from '../../validation/rules'

interface AttachmentsModalProps {
  open: boolean
  onClose: () => void
}

/**
 * The category is stored as this word (older entries are saved that way), so the stored values stay; only the labels are
 * translated. An unknown stored category is shown as it is.
 */
const CATEGORIES = [
  { value: 'Zeugnis', label: 'workReference' },
  { value: 'Abschluss', label: 'degree' },
  { value: 'Zertifikat', label: 'certificate' },
  { value: 'Referenz', label: 'recommendation' },
  { value: 'Arbeitsprobe', label: 'sample' },
  { value: 'Sonstiges', label: 'other' },
] as const

export function AttachmentsModal({ open, onClose }: AttachmentsModalProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const showError = useErrorDialog()
  const fileInput = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0].value)
  const [file, setFile] = useState<File | null>(null)

  const attachments = useQuery({ queryKey: ['attachments'], queryFn: attachmentsApi.list, enabled: open })

  const upload = useMutation({
    mutationFn: (chosen: File) => attachmentsApi.upload(chosen, title.trim() || undefined, category || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments'] })
      setFile(null)
      setTitle('')
      if (fileInput.current) fileInput.current.value = ''
    },
    onError: (error) => showError(error, t('attachments.errors.upload')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => attachmentsApi.delete(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['attachments'] }),
    onError: (error) => showError(error, t('attachments.errors.delete')),
  })

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]
    if (!chosen) return
    setFile(chosen)
    // The file name without its extension is a sensible title until the user types one.
    if (!title.trim()) setTitle(chosen.name.replace(/\.[^/.]+$/, ''))
  }

  const categoryLabel = (value: string) => {
    const known = CATEGORIES.find((category) => category.value === value)
    return known ? t(`attachments.categories.${known.label}`) : value
  }

  const askDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('attachments.deleteTitle'),
      message: t('attachments.deleteConfirm', { title: name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (ok) remove.mutate(id)
  }

  const list = attachments.data ?? []

  return (
    <Dialog open={open} onClose={onClose} title={t('attachments.title')} icon="files" size="lg" closeOnBackdrop={false} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="space-y-6">
        <Notice tone="info">{t('attachments.intro')}</Notice>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (file && !upload.isPending) upload.mutate(file)
          }}
          className="space-y-3 rounded-md border border-line bg-surface-2 p-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="upload" size={16} />
            {t('attachments.addTitle')}
          </h3>

          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
            <LiveTextField className="sm:col-span-2" label={t('attachments.fields.title')} value={title} onValueChange={setTitle} check={noRule} placeholder={t('attachments.fields.titlePlaceholder')} />
            <SelectField label={t('attachments.fields.category')} value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(`attachments.categories.${option.label}`)}
                </option>
              ))}
            </SelectField>
          </div>

          {/* One line, always: the name is cut inside its own space (the full name is the tooltip), the save button never wraps. */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <input ref={fileInput} id="attachment-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={handleFile} className="sr-only" />
              <Button icon="upload" small className="shrink-0" onClick={() => fileInput.current?.click()}>
                {t('attachments.chooseFile')}
              </Button>
              <span className="min-w-0 truncate text-xs font-medium text-ink" aria-live="polite" title={file?.name}>
                {file ? `${file.name} (${formatBytes(file.size, i18n.language)})` : t('attachments.noFile')}
              </span>
            </div>
            <Button type="submit" variant="confirm" icon="plus" small className="shrink-0" busy={upload.isPending} disabled={!file}>
              {t('attachments.save')}
            </Button>
          </div>
        </form>

        <section className="space-y-3" aria-label={t('attachments.listTitle')}>
          <h3 className="text-sm font-semibold text-ink">{t('attachments.listCount', { count: list.length })}</h3>

          {attachments.isPending ? (
            <p className="text-sm text-ink-muted" role="status">
              {t('common.loading')}
            </p>
          ) : attachments.isError ? (
            <ErrorNotice error={attachments.error} title={t('attachments.errors.load')} />
          ) : list.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">{t('attachments.empty')}</div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              {list.map((attachment) => (
                <li key={attachment.id} className="flex items-center justify-between gap-4 p-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 rounded-sm bg-select p-2 text-select-ink">
                      <Icon name={attachment.contentType === 'application/pdf' ? 'fileText' : 'files'} size={18} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{attachment.title}</span>
                        {attachment.category && <span className="badge badge-neutral">{categoryLabel(attachment.category)}</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                        <span className="truncate">{attachment.fileName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatBytes(attachment.sizeBytes, i18n.language)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <a href={attachmentsApi.downloadUrl(attachment.id)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                      <Icon name="download" size={14} />
                      {t('attachments.view')}
                      <span className="sr-only">: {attachment.title}</span>
                    </a>
                    <ItemActions itemName={attachment.title} deleteLabel={t('common.delete')} onDelete={() => void askDelete(attachment.id, attachment.title)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  )
}
