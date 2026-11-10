import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { Certificate, Profile } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { FormDialog } from '../../components/ui/FormDialog'
import { Icon } from '../../components/ui/Icon'
import { ItemActions } from '../../components/ui/ItemActions'
import { DateField } from '../../components/ui/DateField'
import { LiveTextField } from '../../components/ui/LiveTextField'
import { SectionIntro } from '../../components/ui/Page'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useEntryForm } from '../../hooks/useEntryForm'
import { MONTH_OPTIONAL, isStoredDateValid, isValid, noRule, requiredField, urlCheck } from '../../validation/rules'

interface CertificateForm {
  id?: string
  title: string
  issuer: string
  issueDate: string
  expiryDate: string
  credentialUrl: string
  credentialId: string
  sortOrder: number
}

const EMPTY: CertificateForm = { title: '', issuer: '', issueDate: '', expiryDate: '', credentialUrl: '', credentialId: '', sortOrder: 0 }


export function CertificatesTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const entry = useEntryForm<CertificateForm>()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['profile'] })

  const save = useMutation({
    mutationFn: (data: CertificateForm) => {
      const payload = {
        title: data.title.trim(),
        issuer: data.issuer.trim() || null,
        issueDate: data.issueDate.trim() || null,
        expiryDate: data.expiryDate.trim() || null,
        credentialUrl: data.credentialUrl.trim() || null,
        credentialId: data.credentialId.trim() || null,
        sortOrder: data.sortOrder,
      }
      return data.id ? profileApi.updateCertificate(data.id, payload) : profileApi.addCertificate(payload)
    },
    onSuccess: () => {
      refresh()
      entry.close()
    },
    onError: (error) => showError(error, t('common.saveFailed')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => profileApi.deleteCertificate(id),
    onSuccess: refresh,
    onError: (error) => showError(error, t('common.deleteFailed')),
  })

  const askDelete = async (certificate: Certificate) => {
    const ok = await confirm({ title: t('profile.certificates.delete'), message: t('profile.certificates.deleteConfirm'), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) remove.mutate(certificate.id)
  }

  const edit = (certificate: Certificate) =>
    entry.start({
      id: certificate.id,
      title: certificate.title,
      issuer: certificate.issuer ?? '',
      issueDate: certificate.issueDate ?? '',
      expiryDate: certificate.expiryDate ?? '',
      credentialUrl: certificate.credentialUrl ?? '',
      credentialId: certificate.credentialId ?? '',
      sortOrder: certificate.sortOrder,
    })

  const form = entry.form
  const submit = () => {
    if (!form) return
    entry.markAttempted()
    const valid = isValid(requiredField, form.title) && isStoredDateValid(MONTH_OPTIONAL, form.issueDate) && isStoredDateValid(MONTH_OPTIONAL, form.expiryDate) && isValid(urlCheck, form.credentialUrl)
    if (valid) save.mutate(form)
  }

  return (
    <div className="space-y-6">
      <SectionIntro
        title={t('profile.certificates.title')}
        subtitle={t('profile.certificates.subtitle')}
        action={
          <Button variant="create" icon="plus" onClick={() => entry.start({ ...EMPTY, sortOrder: profile.certificates.length })}>
            {t('profile.certificates.add')}
          </Button>
        }
      />

      {profile.certificates.length === 0 ? (
        <EmptyState icon="circleCheck" title={t('profile.certificates.empty')} />
      ) : (
        <ul className="card-grid [--card-min:26rem]">
          {profile.certificates.map((certificate) => (
            <li key={certificate.id} className="card flex flex-col justify-between gap-4 p-5">
              <div>
                <h3 className="text-base font-semibold text-ink">{certificate.title}</h3>
                {certificate.issuer && <p className="mt-1 text-sm font-medium text-ink-muted">{certificate.issuer}</p>}

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  {certificate.issueDate && <span>{t('profile.certificates.issuedOn', { date: dates.stored(certificate.issueDate) })}</span>}
                  {certificate.expiryDate && <span>{t('profile.certificates.validUntil', { date: dates.stored(certificate.expiryDate) })}</span>}
                  {certificate.credentialId && <span>{t('profile.certificates.idLine', { id: certificate.credentialId })}</span>}
                </div>

                {certificate.credentialUrl && /^https?:\/\//i.test(certificate.credentialUrl) && (
                  <div className="mt-3">
                    <a href={certificate.credentialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold underline">
                      <Icon name="world" size={14} />
                      {t('profile.certificates.credentialUrl')}
                    </a>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-line pt-3">
                <ItemActions
                  itemName={certificate.title}
                  editLabel={t('profile.certificates.edit')}
                  deleteLabel={t('profile.certificates.delete')}
                  onEdit={() => edit(certificate)}
                  onDelete={() => void askDelete(certificate)}
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
        title={form?.id ? t('profile.certificates.edit') : t('profile.certificates.add')}
        icon="circleCheck"
        busy={save.isPending}
        dirty={entry.dirty}
      >
        {form && (
          <>
            <LiveTextField
              label={t('profile.certificates.certTitle')} required
              value={form.title}
              onValueChange={(value) => entry.patch({ title: value })}
              check={requiredField}
              attempted={entry.attempted}
              placeholder={t('profile.certificates.titlePlaceholder')}
              data-autofocus
            />
            <LiveTextField label={t('profile.certificates.issuer')} value={form.issuer} onValueChange={(value) => entry.patch({ issuer: value })} check={noRule} placeholder={t('profile.certificates.issuerPlaceholder')} />

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <DateField
                label={t('profile.certificates.issueDate')}
                spec={MONTH_OPTIONAL}
                value={form.issueDate}
                onValueChange={(value) => entry.patch({ issueDate: value })}
                attempted={entry.attempted}
              />
              <DateField
                label={t('profile.certificates.expiryDate')}
                spec={MONTH_OPTIONAL}
                value={form.expiryDate}
                onValueChange={(value) => entry.patch({ expiryDate: value })}
                attempted={entry.attempted}
              />
            </div>

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <LiveTextField
                label={t('profile.certificates.credentialUrl')}
                type="url"
                value={form.credentialUrl}
                onValueChange={(value) => entry.patch({ credentialUrl: value })}
                check={urlCheck}
                attempted={entry.attempted}
                placeholder="https://…"
              />
              <LiveTextField
                label={t('profile.certificates.credentialId')}
                value={form.credentialId}
                onValueChange={(value) => entry.patch({ credentialId: value })}
                check={noRule}
                placeholder={t('profile.certificates.credentialIdPlaceholder')}
              />
            </div>
          </>
        )}
      </FormDialog>
    </div>
  )
}
