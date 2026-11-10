import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Dialog } from './Dialog'

// Our own confirmation dialog - never window.confirm/alert/prompt (the browser's boxes ignore the app's look).
// Usage: const confirm = useConfirm(); if (!(await confirm({ ... }))) return

export interface ConfirmOptions {
  title: string
  message: ReactNode
  /** The action named on the button ("Löschen", "Zurücksetzen" - not "OK"). */
  confirmLabel: string
  cancelLabel?: string
  /** "danger" = destructive action (red, focus starts on the cancel button). */
  tone?: 'danger' | 'default'
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>

/**
 * How a question was answered: the action button, the cancel button, or closed without an answer (Esc, click on the backdrop,
 * replaced by another question).
 */
export type ConfirmChoice = 'confirm' | 'cancel' | 'dismiss'
type ChooseFunction = (options: ConfirmOptions) => Promise<ConfirmChoice>

const ConfirmContext = createContext<ChooseFunction | null>(null)

/** Asks; true only for the action button (cancel button, Esc and backdrop all mean false). */
export function useConfirm(): ConfirmFunction {
  const choose = useContext(ConfirmContext)
  if (!choose) throw new Error('useConfirm needs <ConfirmProvider> above it')
  return useCallback((options) => choose(options).then((choice) => choice === 'confirm'), [choose])
}

/** Like useConfirm, but tells the cancel button from closing without an answer, for questions where "not now" is a third answer. */
export function useConfirmChoice(): ChooseFunction {
  const choose = useContext(ConfirmContext)
  if (!choose) throw new Error('useConfirmChoice needs <ConfirmProvider> above it')
  return choose
}

interface Pending {
  options: ConfirmOptions
  resolve: (choice: ConfirmChoice) => void
  /** Closed but still held, so the text does not vanish while the dialog fades out. */
  open: boolean
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const choose = useCallback<ChooseFunction>(
    (options) =>
      new Promise<ConfirmChoice>((resolve) => {
        // A second request replaces an open one; the first counts as closed without an answer.
        pendingRef.current?.resolve('dismiss')
        const next = { options, resolve, open: true }
        pendingRef.current = next
        setPending(next)
      }),
    [],
  )

  const close = (choice: ConfirmChoice) => {
    pendingRef.current?.resolve(choice)
    pendingRef.current = null
    setPending((current) => (current ? { ...current, open: false } : null))
  }

  const options = pending?.options
  const danger = options?.tone === 'danger'

  return (
    <ConfirmContext.Provider value={choose}>
      {children}
      <Dialog
        open={pending?.open === true}
        onClose={() => close('dismiss')}
        title={options?.title ?? ''}
        icon={danger ? 'trash' : 'alertTriangle'}
        tone={danger ? 'danger' : 'default'}
        role="alertdialog"
        size="sm"
        hideCloseButton
        // Destructive: start on the cancel button, so a hasty Enter does not delete anything.
        initialFocus={danger ? cancelRef : confirmRef}
        footer={
          <>
            <Button ref={cancelRef} onClick={() => close('cancel')}>
              {options?.cancelLabel ?? t('common.cancel')}
            </Button>
            <Button ref={confirmRef} variant={danger ? 'danger' : 'confirm'} onClick={() => close('confirm')}>
              {options?.confirmLabel ?? ''}
            </Button>
          </>
        }
      >
        <div className="text-[0.9375rem] leading-relaxed text-ink-muted">{options?.message}</div>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
