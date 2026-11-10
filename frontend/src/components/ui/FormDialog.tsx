import { useId } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterUnsaved } from '../../hooks/unsavedRegistry'
import { Button } from './Button'
import { useConfirm } from './ConfirmDialog'
import { Dialog } from './Dialog'
import type { DialogProps } from './Dialog'

interface FormDialogProps extends Pick<DialogProps, 'open' | 'title' | 'icon' | 'size'> {
  /** Called when the dialog should close (after the user confirmed to discard unsaved input, if there was any). */
  onClose: () => void
  /** Runs when the form is submitted (button or Enter). The fields validate themselves live; this must not send what shows as red. */
  onSubmit: () => void
  /** Label of the submit button; "Speichern" when not given. */
  submitLabel?: string
  /** A save is under way: the submit button shows its spinner and the dialog cannot be dismissed. */
  busy?: boolean
  /** The user typed something that is not saved yet: closing asks first instead of throwing it away. */
  dirty?: boolean
  /** Extra buttons on the left of the footer (for example "Test connection"). */
  footerStart?: ReactNode
  children: ReactNode
}

/**
 * The dialog around every form of the app: a click beside it does not close it (that would throw typed input away), Esc, the
 * close button and "Abbrechen" ask before discarding unsaved input, the form turns off the browser's own validation (the fields
 * validate live), and the submit button sits in the footer but belongs to the form - it works with the mouse and with Enter.
 */
export function FormDialog({ open, onClose, onSubmit, title, icon, size = 'md', submitLabel, busy = false, dirty = false, footerStart, children }: FormDialogProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const formId = useId()
  useRegisterUnsaved(open && dirty)

  const requestClose = async () => {
    if (busy) return
    if (dirty) {
      const discard = await confirm({
        title: t('common.discardTitle'),
        message: t('common.discardMessage'),
        confirmLabel: t('common.discard'),
        tone: 'danger',
      })
      if (!discard) return
    }
    onClose()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!busy) onSubmit()
  }

  return (
    <Dialog
      open={open}
      onClose={() => void requestClose()}
      title={title}
      icon={icon}
      size={size}
      closeOnBackdrop={false}
      footer={
        <>
          {footerStart && <div className="mr-auto flex items-center gap-2">{footerStart}</div>}
          <Button onClick={() => void requestClose()} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="confirm" busy={busy}>
            {submitLabel ?? t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="space-y-4">
        {children}
      </form>
    </Dialog>
  )
}
