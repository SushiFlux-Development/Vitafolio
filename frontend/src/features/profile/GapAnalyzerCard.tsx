import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { useDateFormat } from '../../hooks/useDateFormat'
import type { Profile } from '../../api/types'
import { useGapAnalyzer } from './useGapAnalyzer'
import type { StationLabel } from './useGapAnalyzer'

interface GapAnalyzerCardProps {
  profile: Profile
  /** Offers to fill a gap: start and end as ISO months (YYYY-MM) and the suggested title of the new station. */
  onQuickAdd?: (gapStart: string, gapEnd: string, suggestedTitle: string) => void
}

export function GapAnalyzerCard({ profile, onQuickAdd }: GapAnalyzerCardProps) {
  const { t } = useTranslation()
  const { format } = useDateFormat()
  const analysis = useGapAnalyzer(profile, format)
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()

  if (!analysis.hasGaps && !analysis.isContinuous) {
    return null
  }

  if (analysis.isContinuous) {
    return (
      <div className="notice notice-success flex items-center gap-2" role="status" data-hint="profile-gaps">
        <Icon name="circleCheck" size={18} className="shrink-0" />
        <span className="font-medium">{t('profile.gaps.continuous')}</span>
      </div>
    )
  }

  // A station is named "Title (Employer)"; a missing part is said in words, never left as an empty bracket.
  const describe = (label: StationLabel | undefined) =>
    `${label?.title || t('profile.gaps.unnamedTitle')} (${label?.organisation || t('profile.gaps.unnamedOrganisation')})`

  return (
    <div className="notice notice-warning space-y-2" data-hint="profile-gaps">
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}>
        <span className="flex items-center gap-2 font-medium">
          <Icon name="alertTriangle" size={18} className="shrink-0" />
          <span>{t('profile.gaps.found', { count: analysis.totalGapsCount })}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-medium underline underline-offset-2">
          {expanded ? t('profile.gaps.hide') : t('profile.gaps.show')}
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />
        </span>
      </button>

      {expanded && (
        <div id={detailsId} className="space-y-3 border-t border-current/20 pt-3">
          <p>{t('profile.gaps.advice')}</p>

          <ul className="space-y-2">
            {analysis.gaps.map((gap) => (
              <li key={gap.id} className="flex flex-col justify-between gap-2 rounded-sm border border-line bg-surface p-2.5 text-ink sm:flex-row sm:items-center">
                <div>
                  <span className="font-semibold">
                    {gap.startFormatted} – {gap.endFormatted} ({t('profile.gaps.months', { count: gap.durationMonths })})
                  </span>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {t('profile.gaps.between')}: <span className="text-ink">{describe(gap.previous)}</span> → <span className="text-ink">{describe(gap.next)}</span>
                  </div>
                </div>

                {onQuickAdd && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button small onClick={() => onQuickAdd(gap.startMonth, gap.endMonth, t('profile.gaps.orientation'))}>
                      + {t('profile.gaps.orientation')}
                    </Button>
                    <Button small onClick={() => onQuickAdd(gap.startMonth, gap.endMonth, t('profile.gaps.training'))}>
                      + {t('profile.gaps.training')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
