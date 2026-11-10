import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loading } from '../../components/ui/Page'
import type { PersonalForm } from './usePersonalForm'

/**
 * The preview and the export are made from what the server has, so a save of the personal data that is still on its way is
 * waited for first. If the newest input cannot be saved, the preview says that it shows the last saved state.
 */
export function PreviewGate({ form, children }: { form: PersonalForm; children: ReactNode }) {
  const { t } = useTranslation()
  // Nothing waiting: the preview opens at once, without a flash of "loading".
  const [state, setState] = useState<'waiting' | 'ready' | 'stale'>(() => (form.state.changed ? 'waiting' : 'ready'))
  const { flush } = form

  useEffect(() => {
    if (state !== 'waiting') return
    let current = true
    void flush().then((saved) => {
      if (current) setState(saved ? 'ready' : 'stale')
    })
    return () => {
      current = false
    }
  }, [state, flush])

  if (state === 'waiting') return <Loading />
  return (
    <>
      {state === 'stale' && (
        <p className="notice notice-warning mb-4" role="status">
          {t('profile.preview.staleNotice')}
        </p>
      )}
      {children}
    </>
  )
}
