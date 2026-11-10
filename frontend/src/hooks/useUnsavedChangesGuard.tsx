import { useContext, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { useRegisterUnsaved } from './unsavedRegistry'

/**
 * Asks before unsaved input is thrown away by leaving the page: a click on another entry of the navigation gets the app's own
 * question (discard / stay), and closing or reloading the tab gets the browser's one unavoidable prompt - there is no way to
 * replace that one. Render it with `when` = "there are unsaved changes"; it draws nothing.
 *
 * Changes inside the page (a "back to the list" button, another entry of the list) are the page's own business: it asks with
 * the same question through useConfirm before it switches.
 */
/** Own wording for the question when the default "discard changes" does not fit (forms that save by themselves). */
export interface GuardTexts {
  title: string
  message: string
  confirmLabel: string
}

export function UnsavedChangesGuard({ when, texts }: { when: boolean; texts?: GuardTexts }) {
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  // The one-click update also has to know that something unsaved is open.
  useRegisterUnsaved(when)

  useEffect(() => {
    if (!when) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Some browsers still need a value here to show their prompt.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [when])

  // Blocking router navigation needs a data router (the app has one; a plain MemoryRouter in a component test has not).
  return dataRouter ? <RouterBlocker when={when} texts={texts} /> : null
}

function RouterBlocker({ when, texts }: { when: boolean; texts: GuardTexts | undefined }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  // Only leaving the page is asked about. Switching a section of the page (another "?tab=", the assistant view) keeps the draft
  // in the page, so it is no loss and no question.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname)
  const asking = useRef(false)

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void confirm({
      title: texts?.title ?? t('common.discardTitle'),
      message: texts?.message ?? t('common.discardMessage'),
      confirmLabel: texts?.confirmLabel ?? t('common.discard'),
      tone: 'danger',
    }).then((discard) => {
      asking.current = false
      if (discard) blocker.proceed()
      else blocker.reset()
    })
  }, [blocker, confirm, t, texts])

  return null
}

/** The wording for forms that save by themselves: the question only comes when something could not be saved, and says where it stays. */
export function useLeaveTexts(): GuardTexts {
  const { t } = useTranslation()
  return useMemo(() => ({ title: t('autoSave.leave.title'), message: t('autoSave.leave.message'), confirmLabel: t('autoSave.leave.confirm') }), [t])
}
