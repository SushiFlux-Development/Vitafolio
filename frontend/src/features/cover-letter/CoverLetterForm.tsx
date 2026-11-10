import { useRef } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CoverLetter } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { LiveTextAreaField, LiveTextField } from '../../components/ui/LiveTextField'
import { SelectField } from '../../components/ui/SelectField'
import { Toggle } from '../../components/ui/Toggle'
import { emailCheck, noRule, requiredField } from '../../validation/rules'
import { ColorSwatches } from '../documents/ColorSwatches'
import { DEFAULT_DOCUMENT_COLOR } from '../documents/palette'
import { selectedFont, useDocumentFonts } from '../documents/useDocumentFonts'

interface CoverLetterFormProps {
  draft: CoverLetter
  onChange: (patch: Partial<CoverLetter>) => void
  /** A save was tried: every required field shows its problem, also the ones nobody touched. */
  attempted: boolean
  /** What the server said about single fields when it refused the values (field name -> text); gone with the next edit. */
  serverErrors?: Record<string, string>
  signatureBusy: boolean
  onSignatureUpload: (file: File) => void
  onSignatureDelete: () => void
}

function Card({ icon, title, hint, children }: { icon: IconName; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card p-5" aria-label={title}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Icon name={icon} size={18} className="text-ink-muted" />
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/**
 * The fields of a cover letter, all in the shared field components: every label belongs to its input, the required ones turn
 * red while typing, and the room for their messages is reserved. The caller owns the draft and decides when it is saved.
 */
export function CoverLetterForm({ draft, onChange, attempted, serverErrors = {}, signatureBusy, onSignatureUpload, onSignatureDelete }: CoverLetterFormProps) {
  const { t } = useTranslation()
  const fonts = useDocumentFonts()
  const fileInput = useRef<HTMLInputElement>(null)

  const text = (field: keyof CoverLetter) => ({
    value: (draft[field] as string | null | undefined) ?? '',
    onValueChange: (value: string) => onChange({ [field]: value }),
    attempted,
    serverError: serverErrors[field],
  })

  const handleSignature = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // The same file can be chosen again after it was removed.
    event.target.value = ''
    if (file) onSignatureUpload(file)
  }

  return (
    // Three columns from 1920 px on (recipient | letter | options); below that the recipient and the letter stack in the wide left column.
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2 3xl:grid 3xl:grid-cols-2 3xl:items-start 3xl:gap-6 3xl:space-y-0">
        <div className="space-y-6">
        <section className="card p-5">
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
            <LiveTextField className="md:col-span-2" label={t('coverLetters.fields.title')} required check={requiredField} {...text('title')} />
            <SelectField label={t('coverLetters.fields.language')} value={draft.language} onChange={(event) => onChange({ language: event.target.value as 'de' | 'en' })}>
              <option value="de">{t('coverLetters.languages.de')}</option>
              <option value="en">{t('coverLetters.languages.en')}</option>
            </SelectField>
          </div>
        </section>

        <Card icon="briefcase" title={t('coverLetters.fields.recipientSection')}>
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <LiveTextField className="md:col-span-2" label={t('coverLetters.fields.recipientCompany')} required check={requiredField} {...text('recipientCompany')} />
            <LiveTextField label={t('coverLetters.fields.recipientDepartment')} check={noRule} {...text('recipientDepartment')} />
            <LiveTextField label={t('coverLetters.fields.recipientContactPerson')} check={noRule} {...text('recipientContactPerson')} />
            <LiveTextField className="md:col-span-2" label={t('coverLetters.fields.recipientStreet')} check={noRule} {...text('recipientStreet')} />
            <LiveTextField label={t('coverLetters.fields.recipientPostalCode')} check={noRule} {...text('recipientPostalCode')} />
            <LiveTextField label={t('coverLetters.fields.recipientCity')} required check={requiredField} {...text('recipientCity')} />
            <LiveTextField label={t('coverLetters.fields.recipientCountry')} check={noRule} {...text('recipientCountry')} />
          </div>
        </Card>
        </div>

        <Card icon="fileText" title={t('coverLetters.fields.contentSection')}>
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <LiveTextField label={t('coverLetters.fields.place')} check={noRule} {...text('place')} />
            <LiveTextField label={t('coverLetters.fields.date')} check={noRule} {...text('date')} />
            <LiveTextField className="md:col-span-2" label={t('coverLetters.fields.subject')} required inputClassName="font-semibold" check={requiredField} {...text('subject')} />
            <LiveTextField className="md:col-span-2" label={t('coverLetters.fields.salutation')} required check={requiredField} {...text('salutation')} />
            <LiveTextAreaField
              className="max-w-4xl md:col-span-2"
              label={t('coverLetters.fields.body')} required
              rows={12}
              placeholder={t('coverLetters.fields.bodyPlaceholder')}
              check={requiredField}
              {...text('body')}
            />
            <LiveTextField label={t('coverLetters.fields.closing')} check={noRule} {...text('closing')} />
            <LiveTextField label={t('coverLetters.fields.signatureName')} check={noRule} {...text('signatureName')} />
            <LiveTextField
              className="md:col-span-2"
              label={t('coverLetters.fields.attachmentsNote')}
              placeholder={t('coverLetters.fields.attachmentsNotePlaceholder')}
              check={noRule}
              {...text('attachmentsNote')}
            />
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card icon="palette" title={t('coverLetters.fields.optionsSection')}>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{t('coverLetters.fields.accentColor')}</p>
            <ColorSwatches value={draft.accentColor ?? DEFAULT_DOCUMENT_COLOR} onChange={(hex) => onChange({ accentColor: hex })} label={t('coverLetters.fields.accentColor')} />
          </div>
          <SelectField label={t('coverLetters.fields.font')} value={selectedFont(fonts, draft.font)} onChange={(event) => onChange({ font: event.target.value })}>
            {fonts.map((font) => (
              <option key={font.family} value={font.family}>
                {font.family}
              </option>
            ))}
          </SelectField>
          <Toggle label={t('coverLetters.fields.foldMarks')} description={t('coverLetters.fields.foldMarksHint')} checked={draft.includeFoldMarks} onChange={(checked) => onChange({ includeFoldMarks: checked })} />
        </Card>

        <Card icon="pencil" title={t('coverLetters.fields.signatureSection')} hint={t('coverLetters.fields.signatureHint')}>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleSignature} />
          {draft.hasSignature ? (
            <div className="notice notice-success flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 font-medium">
                <Icon name="check" size={16} />
                {t('coverLetters.fields.hasSignature')}
              </span>
              <Button variant="danger-outline" small icon="trash" busy={signatureBusy} onClick={onSignatureDelete}>
                {t('coverLetters.fields.deleteSignature')}
              </Button>
            </div>
          ) : (
            <Button className="w-full" icon="upload" busy={signatureBusy} onClick={() => fileInput.current?.click()}>
              {t('coverLetters.fields.uploadSignature')}
            </Button>
          )}
        </Card>

        <Card icon="users" title={t('coverLetters.fields.senderSection')} hint={t('coverLetters.fields.senderHint')}>
          <LiveTextField label={t('coverLetters.fields.senderName')} check={noRule} {...text('senderName')} />
          <LiveTextField label={t('coverLetters.fields.senderStreet')} check={noRule} {...text('senderStreet')} />
          <div className="grid grid-cols-3 gap-x-3">
            <LiveTextField label={t('coverLetters.fields.senderPostalCode')} check={noRule} {...text('senderPostalCode')} />
            <LiveTextField className="col-span-2" label={t('coverLetters.fields.senderCity')} check={noRule} {...text('senderCity')} />
          </div>
          <LiveTextField label={t('coverLetters.fields.senderEmail')} type="email" check={emailCheck} {...text('senderEmail')} />
          <LiveTextField label={t('coverLetters.fields.senderPhone')} type="tel" check={noRule} {...text('senderPhone')} />
        </Card>
      </div>
    </div>
  )
}
