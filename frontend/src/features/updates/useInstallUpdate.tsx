import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { updatesApi } from '../../api/endpoints'
import type { UpdateStatusDto } from '../../api/types'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { hasUnsavedChanges } from '../../hooks/unsavedRegistry'
import { flushAllAutoSaves } from '../../hooks/useAutoSave'
import { UPDATE_STATUS_KEY } from '../../hooks/useUpdates'

/** How long a send that is still running may hold up the question before the input counts as not sent. */
export const installTiming = { flushWaitMs: 5000 }

/**
 * Sends what the forms that save by themselves still hold, then says whether input remains that the restart would affect:
 * input in an open window (lost) and input that could not be sent (kept as a local copy). A send that hangs does not hold up the
 * question for ever; it counts as not sent.
 */
async function unsentInput(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const sent = await Promise.race([flushAllAutoSaves(), new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), installTiming.flushWaitMs)))])
  clearTimeout(timer)
  // The forms report their state to the registry after they rendered it: let that happen before it is read.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return !sent || hasUnsavedChanges()
}

/**
 * The one-click update of the Windows program, from the first question to the start of the run. Asks with the app's own
 * dialog (what happens: the program closes, restarts, a backup is made first) and says before that when input is still
 * unsaved - input in an open window is lost by the restart, input that could not be sent stays as a local copy. After the answer "yes" the server starts the run; the progress dialog follows it.
 * A refusal (a backup is running, a restore, another update) is shown with the specific reason.
 */
export function useInstallUpdate() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const showError = useErrorDialog()
  const queryClient = useQueryClient()

  const install = useMutation({
    mutationFn: updatesApi.install,
    onSuccess: (status) => queryClient.setQueryData<UpdateStatusDto>(UPDATE_STATUS_KEY, status),
    onError: (error) => showError(error, t('updates.install.startFailed')),
  })

  /** Resolves when the question was answered; true when the run was started. */
  async function start(status: UpdateStatusDto): Promise<boolean> {
    const version = status.available?.display ?? ''
    // Read at the moment of the click, after what is waiting was sent: whatever is still open counts.
    const unsaved = await unsentInput()
    const accepted = await confirm({
      title: t('updates.install.confirmTitle', { version }),
      message: (
        <div className="space-y-3">
          <p>{t('updates.install.confirmText', { version })}</p>
          {unsaved && (
            <p className="font-semibold text-danger-soft-ink" data-testid="install-unsaved-warning">
              {t('updates.install.unsavedWarning')}
            </p>
          )}
        </div>
      ),
      confirmLabel: unsaved ? t('updates.install.confirmAnyway') : t('updates.install.confirmAction'),
      tone: unsaved ? 'danger' : 'default',
    })
    if (!accepted) return false
    try {
      await install.mutateAsync()
      return true
    } catch {
      // Already shown by onError.
      return false
    }
  }

  return { start, starting: install.isPending }
}
