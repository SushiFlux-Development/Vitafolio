import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { whatsNewApi } from '../../api/endpoints'
import type { LanguageCode } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { ErrorNotice, Notice } from '../../components/ui/Notice'
import { Loading } from '../../components/ui/Page'
import { WhatsNewBody } from './WhatsNewDialog'

/**
 * The notes of the running version for reading later (version display, update page). Whether they were seen before does not
 * matter. A version without notes says so calmly - that is no failure.
 */
export function WhatsNewViewer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const language: LanguageCode = i18n.language.startsWith('en') ? 'en' : 'de'
  const notes = useQuery({
    queryKey: ['whats-new', 'current', language],
    queryFn: () => whatsNewApi.current(language),
    enabled: open,
    retry: false,
    staleTime: 1000 * 60 * 10,
  })

  const notAvailable = notes.error instanceof ApiError && notes.error.code === 'whats_new.not_available'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={notes.data?.version ? t('whatsNew.title', { version: notes.data.version }) : t('whatsNew.titleNoVersion')}
      icon="sparkles"
      size="lg"
      footer={
        <Button variant="confirm" onClick={onClose}>
          {t('whatsNew.close')}
        </Button>
      }
    >
      {notes.isPending && <Loading />}
      {notAvailable && <Notice tone="info">{t('whatsNew.notAvailable')}</Notice>}
      {notes.isError && !notAvailable && <ErrorNotice error={notes.error} title={t('whatsNew.loadFailed')} />}
      {notes.data && <WhatsNewBody notes={notes.data} />}
    </Dialog>
  )
}
