import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LanguageCode } from '../../api/types'
import { applyLanguage } from '../../i18n'
import { Logo, VersionLabel, Wordmark } from '../ui/Brand'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import { Segmented } from '../ui/Segmented'

const FEATURES: { key: string; icon: IconName }[] = [
  { key: 'cv', icon: 'files' },
  { key: 'letter', icon: 'fileText' },
  { key: 'designs', icon: 'palette' },
  { key: 'export', icon: 'fileExport' },
  { key: 'tracker', icon: 'timeline' },
]

/**
 * The shell of every page for somebody who is not signed in, light and neutral in both themes: a third of the width holds the
 * form, two thirds the brand panel, separated by a 1px line. The panel has the title block (wordmark, tagline, a straight
 * accent line, subline) and what the app does as a plain list under hairlines - no cards, nothing that looks clickable - and
 * below it only the running version with its channel symbol. Where the panel is wide the list stands beside the title block,
 * with a thin vertical line between. The form is anchored near the top, not centred, so a change of its height can never make
 * it jump.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const language = (i18n.language.startsWith('en') ? 'en' : 'de') as LanguageCode

  return (
    <div className="flex min-h-screen bg-bg">
      <main className="flex min-h-screen flex-[0_0_33.333%] flex-col bg-surface px-8 pt-8 pb-6">
        <div className="mx-auto w-full max-w-sm pt-[max(2rem,10vh)]">
          <Logo size={44} className="mb-8" />
          {children}
        </div>
        <div className="mx-auto mt-auto w-full max-w-sm pt-8">
          <Segmented
            label={t('common.language')}
            value={language}
            onChange={(next) => void applyLanguage(next)}
            options={[
              { value: 'de', label: 'Deutsch' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
      </main>

      <aside className="@container sticky top-0 flex h-screen flex-1 flex-col self-start overflow-y-auto border-l border-line px-12 py-8 xl:px-16" aria-label={t('brand.panelLabel')}>
        <div className="mx-auto my-auto grid w-full max-w-6xl gap-10 py-6 @min-[48rem]:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] @min-[48rem]:items-center @min-[48rem]:gap-12">
          <div className="min-w-0">
            <Wordmark height={34} />
            <h2 className="mt-8 text-4xl leading-[1.1] tracking-tight xl:text-5xl">{t('brand.tagline')}</h2>
            <div className="mt-5 h-[3px] w-12 bg-indicator" aria-hidden="true" />
            <p className="mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-ink">{t('brand.subline')}</p>
            <p className="mt-5 flex max-w-lg items-start gap-2.5 text-sm leading-snug text-ink-muted">
              <Icon name="sparkles" size={17} className="mt-0.5 shrink-0 text-highlight-soft-ink" />
              {t('brand.ai')}
            </p>
          </div>

          <div className="hidden self-stretch bg-line @min-[48rem]:block" aria-hidden="true" />

          <ul className="min-w-0 divide-y divide-line">
            {FEATURES.map((feature) => (
              <li key={feature.key} className="flex gap-4 py-4">
                <Icon name={feature.icon} size={21} className="mt-0.5 shrink-0 text-link" />
                <div className="min-w-0">
                  <h3 className="font-sans text-base leading-snug font-semibold text-ink">{t(`brand.features.${feature.key}.title`)}</h3>
                  <p className="mt-0.5 text-sm leading-snug text-ink-muted">{t(`brand.features.${feature.key}.text`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Below the panel only the running version with its channel symbol, so the build is visible before anyone signs in. */}
        <footer className="pt-6 text-center text-sm text-ink-muted tabular-nums">
          <VersionLabel />
        </footer>
      </aside>
    </div>
  )
}
