import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import type { UpdateInstall, UpdateInstallState, UpdateStatusDto } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import { ErrorNotice } from '../../components/ui/Notice'
import { isInstallRunning, isUpdateOffered, useCanManageUpdates, useUpdateStatus } from '../../hooks/useUpdates'
import { useInstallUpdate } from './useInstallUpdate'

type Step = 'downloading' | 'backingUp' | 'restarting'
const STEPS: readonly Step[] = ['downloading', 'backingUp', 'restarting']

/** The failed run as an error the notice can show in full: the translated reason by its code, the complete technical text behind it. */
export function installError(install: UpdateInstall): ApiError {
  return new ApiError(0, { code: install.errorCode ?? undefined, detail: install.errorDetails ?? install.error ?? undefined })
}

/** A download progress bar in the app's tokens; the number is also written out (never colour alone). */
function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const known = value !== null
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? value : undefined}
        className="h-2 flex-1 overflow-hidden rounded-xs bg-sunken"
      >
        <div className={`h-full bg-confirm transition-[width] duration-300 ${known ? '' : 'w-1/3 motion-safe:animate-pulse'}`} style={known ? { width: `${value}%` } : undefined} />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-sm text-ink-muted">{known ? `${value} %` : ''}</span>
    </div>
  )
}

function stepState(step: Step, current: UpdateInstallState): 'done' | 'active' | 'todo' {
  const order = STEPS.indexOf(step)
  const now = STEPS.indexOf(current as Step)
  if (now < 0) return 'todo'
  return order < now ? 'done' : order === now ? 'active' : 'todo'
}

/**
 * Follows the one-click update from the download over the backup to the restart, in the app's own dialog that cannot be
 * dismissed while the run is under way (closing the window would not stop it, and the program is about to close anyway).
 * A failed run stays in the status; the dialog shows it in full with the copy button, says the installed version and the
 * data were not touched, and offers another try while the update is still offered.
 */
export function UpdateProgressDialog() {
  const { t } = useTranslation()
  const canManage = useCanManageUpdates()
  const status = useUpdateStatus(canManage)
  const { start, starting } = useInstallUpdate()
  const [dismissed, setDismissed] = useState<string | null>(null)

  const data: UpdateStatusDto | undefined = status.data
  if (!canManage || !data) return null
  const install = data.install
  const running = isInstallRunning(install.state)
  // A failure is shown once per run; a new run (another target or error) shows again.
  const failureKey = `${install.targetTag ?? ''}|${install.errorCode ?? ''}|${install.error ?? ''}`
  const failed = install.state === 'failed' && dismissed !== failureKey
  const open = running || failed

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (failed) setDismissed(failureKey)
      }}
      title={failed ? t('updates.progress.failedTitle') : t('updates.progress.title', { version: install.targetDisplay ?? '' })}
      icon={failed ? 'alertCircle' : 'circleArrowUp'}
      tone={failed ? 'danger' : 'default'}
      role="alertdialog"
      size="md"
      closeOnBackdrop={false}
      hideCloseButton={running}
      footer={
        failed ? (
          <>
            <Button onClick={() => setDismissed(failureKey)}>{t('common.close')}</Button>
            {isUpdateOffered(data) && (
              <Button
                variant="confirm"
                icon="refresh"
                busy={starting}
                onClick={() => {
                  setDismissed(failureKey)
                  void start(data)
                }}
              >
                {t('updates.progress.retry')}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {failed ? (
        <div className="space-y-3" data-testid="update-failed">
          <ErrorNotice error={installError(install)} title={t('updates.progress.failedNotice')} />
          <p className="text-sm text-ink-muted">
            {install.backupFile ? t('updates.progress.untouchedWithBackup', { file: install.backupFile }) : t('updates.progress.untouched')}
          </p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="update-progress">
          <ol className="space-y-2">
            {STEPS.map((step) => {
              const state = stepState(step, install.state)
              return (
                <li key={step} className={`flex items-center gap-3 text-sm ${state === 'todo' ? 'text-ink-muted' : 'font-semibold text-ink'}`} aria-current={state === 'active' ? 'step' : undefined}>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-xs ${state === 'done' ? 'bg-success-soft text-success-soft-ink' : state === 'active' ? 'bg-select text-select-ink' : 'bg-sunken text-ink-muted'}`}
                  >
                    <Icon name={state === 'done' ? 'check' : state === 'active' ? 'loader' : 'clock'} size={14} className={state === 'active' ? 'animate-spin' : ''} />
                  </span>
                  {t(`updates.progress.steps.${step}`)}
                </li>
              )
            })}
          </ol>
          <div className="min-h-9">
            {install.state === 'downloading' && <ProgressBar value={install.progress ?? null} label={t('updates.progress.steps.downloading')} />}
            {install.state === 'backingUp' && <p className="text-sm text-ink-muted">{t('updates.progress.backingUpText')}</p>}
            {install.state === 'restarting' && <p className="text-sm text-ink-muted">{t('updates.progress.restartingText')}</p>}
          </div>
        </div>
      )}
    </Dialog>
  )
}
