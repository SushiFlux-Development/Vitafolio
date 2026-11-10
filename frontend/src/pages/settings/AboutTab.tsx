import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading, Section } from '../../components/ui/Page'
import { LicenseList } from '../../features/about/LicenseList'
import { HandbookViewer } from '../../features/help/HandbookViewer'
import { WhatsNewViewer } from '../../features/whats-new/WhatsNewViewer'
import { safeHttpUrl } from '../../format'
import { useAbout } from '../../hooks/useAbout'
import { useVersion } from '../../hooks/useVersion'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="font-medium text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  )
}

/**
 * "About": product, version, licence, the link to the source code (the licence obliges the program to offer it), the notes of
 * this version, the manual and every third-party component with its licence. Open to everybody who is signed in.
 */
export function AboutTab() {
  const { t } = useTranslation()
  const about = useAbout()
  const version = useVersion()
  const [notesOpen, setNotesOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  if (about.isPending) return <Loading />
  if (about.isError) return <ErrorNotice error={about.error} title={t('about.loadFailed')} />
  const info = about.data
  const source = safeHttpUrl(info.sourceUrl)

  return (
    <div className="flex flex-col gap-6" data-testid="about">
      <Section title={t('about.title', { product: info.product })} description={t('about.description')}>
        <dl className="max-w-3xl divide-y divide-line">
          <Fact label={t('about.product')}>{info.product}</Fact>
          <Fact label={t('about.version')}>
            <span className="font-mono" data-testid="about-version">
              {version.data?.version ?? '-'}
            </span>
          </Fact>
          <Fact label={t('about.license')}>
            <span className="font-semibold">{info.license}</span>
            <span className="mt-1 block text-ink-muted">{t('about.licenseText')}</span>
          </Fact>
          <Fact label={t('about.source')}>
            {source ? (
              <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold" data-testid="about-source">
                {source}
                <Icon name="externalLink" size={14} />
              </a>
            ) : (
              '-'
            )}
          </Fact>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button icon="sparkles" onClick={() => setNotesOpen(true)}>
            {t('about.whatsNew')}
          </Button>
          <Button icon="book" onClick={() => setManualOpen(true)}>
            {t('about.handbook')}
          </Button>
        </div>
      </Section>

      <Section title={t('about.licensesTitle')} description={t('about.licensesText')}>
        <LicenseList url={info.thirdPartyLicensesUrl} />
      </Section>

      <WhatsNewViewer open={notesOpen} onClose={() => setNotesOpen(false)} />
      <HandbookViewer open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  )
}
