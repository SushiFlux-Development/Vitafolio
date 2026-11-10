import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { CvContentSettings, Profile } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { ErrorNotice } from '../../components/ui/Notice'
import {
  applyTheSuggestion,
  countRows,
  followSuggestionEverywhere,
  followSuggestionFor,
  levelFor,
  normalizeSettings,
  relevantRows,
  selectionOf,
  settingsFrom,
  showEverything,
  suggestedLevel,
  withLevel,
  withSectionHidden,
} from '../../features/profile/contentSettings'
import type { ContentRow } from '../../features/profile/contentSettings'
import { useContentSettingsSaver } from '../../features/profile/useContentSettings'
import { CvContentDialog, KNOWN_REASONS } from '../../features/tracker/CvContentDialog'
import { useContentSuggestion } from '../../features/tracker/queries'
import { Reserved } from '../../features/tracker/Reserved'
import { useDateFormat } from '../../hooks/useDateFormat'

/** Height of the list of left-out entries: it keeps its room whatever it holds, so the preview next to it never moves. */
const LIST_HEIGHT = 'h-40'

/**
 * "Content" in "Preview & export": the CV shows only what is still relevant for the person (the suggestion of the app, with
 * its reason), and everything that is left out or shortened is listed here with a button to show it again - for example a school
 * certificate. A change is saved at once and only then does the preview render again (`onChanged`), so it never shows an old selection.
 */
export function PreviewContent({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  // The page already holds the profile; this only reads it (and loads it when it is not there).
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => profileApi.get(), staleTime: Infinity })
  const suggestion = useContentSuggestion(true)
  const save = useContentSettingsSaver(onChanged)
  const [expanded, setExpanded] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  const profile = profileQuery.data
  const data = suggestion.query.data
  const settings = normalizeSettings(profile?.cvContentSettings)

  const rows = profile ? rowsOf(profile, settings, data, dates.stored, t) : []
  const listed = relevantRows(rows)
  const counts = countRows(rows)

  const parts = [
    ...(counts.hidden > 0 ? [t('profile.preview.content.summary.hidden', { count: counts.hidden })] : []),
    ...(counts.short > 0 ? [t('profile.preview.content.summary.short', { count: counts.short })] : []),
  ]
  const off = t('profile.preview.content.summary.suggestionOff')
  const summary = settings.useSuggestion
    ? parts.length > 0
      ? parts.join(', ')
      : t('profile.preview.content.summary.allShown')
    : `${off} ${parts.length > 0 ? t('profile.preview.content.summary.ownSelection', { summary: parts.join(', ') }) : t('profile.preview.content.summary.allShown')}`
  // The line keeps room for the longest text it can have.
  const longest = `${off} ${t('profile.preview.content.summary.ownSelection', {
    summary: `${t('profile.preview.content.summary.hidden', { count: 99 })}, ${t('profile.preview.content.summary.short', { count: 99 })}`,
  })}`

  const change = (next: CvContentSettings) => save(next)

  return (
    <div className="rounded-md border border-line bg-surface-2 p-3" data-testid="preview-content">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{t('profile.preview.content.title')}</h3>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-xs px-2 text-[0.8125rem] font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <Icon name="chevronDown" size={14} className={expanded ? 'rotate-180' : ''} />
          {expanded ? t('profile.preview.content.collapse') : t('profile.preview.content.expand')}
        </button>
      </div>
      <Reserved reserve={[longest]} className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">
        <p data-testid="preview-content-summary">{profile ? summary : ''}</p>
      </Reserved>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button small icon="pencil" disabled={!profile} onClick={() => setDialogOpen(true)}>
          {t('profile.preview.content.adjust')}
        </Button>
        {settings.useSuggestion ? (
          <Button small variant="ghost" icon="refresh" disabled={!profile || listed.length === 0} onClick={() => change(showEverything())}>
            {t('profile.preview.content.showAll')}
          </Button>
        ) : (
          <Button small variant="confirm" icon="sparkles" disabled={!profile} onClick={() => change(applyTheSuggestion(settings))}>
            {t('profile.preview.content.applySuggestion')}
          </Button>
        )}
      </div>

      {expanded && (
        <div className={`mt-3 ${LIST_HEIGHT} overflow-y-auto rounded-sm border border-line bg-surface px-3`}>
          {suggestion.query.isError ? (
            <div className="space-y-2 py-2">
              <ErrorNotice error={suggestion.query.error} title={t('applications.content.errors.suggestion')} />
              <Button small icon="refresh" onClick={() => void suggestion.query.refetch()}>
                {t('preview.retry')}
              </Button>
            </div>
          ) : listed.length === 0 ? (
            <p className="py-3 text-[0.8125rem] text-ink-muted">{profile ? t('profile.preview.content.nothingListed') : ''}</p>
          ) : (
            <ul className="divide-y divide-line">
              {listed.map((row) => (
                <ContentRowItem key={`${row.kind}:${row.id}`} row={row} useSuggestion={settings.useSuggestion} change={change} settings={settings} data={data} />
              ))}
            </ul>
          )}
        </div>
      )}

      {profile && (
        <CvContentDialog
          mode="profile"
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          selection={selectionOf(profile, data, settings)}
          onChange={(selection) => change(settingsFrom(settings, profile, data, selection))}
          suggestion={suggestion}
          onTakeSuggestion={() => change(followSuggestionEverywhere())}
          onReset={() => change(showEverything())}
        />
      )}
    </div>
  )
}

function ContentRowItem({
  row,
  useSuggestion,
  settings,
  data,
  change,
}: {
  row: ContentRow
  useSuggestion: boolean
  settings: CvContentSettings
  data: ReturnType<typeof useContentSuggestion>['query']['data']
  change: (next: CvContentSettings) => void
}) {
  const { t } = useTranslation()
  const level = (value: ContentRow['level']) => t(`applications.content.levels.${value}`)
  const reason = reasonOf(t, row)
  const status =
    row.kind === 'section'
      ? t('profile.preview.content.row.sectionHidden')
      : row.override === undefined
        ? t(row.level === 'short' ? 'profile.preview.content.row.short' : 'profile.preview.content.row.hidden', { reason })
        : row.level === 'full'
          ? t('profile.preview.content.row.shownAgainst', { suggested: level(row.suggested), reason })
          : t('profile.preview.content.row.own', { level: level(row.level), suggested: level(row.suggested) })

  const show = () => change(row.kind === 'section' ? withSectionHidden(settings, row.id, false) : withLevel(settings, data, row.kind, row.id, 'full'))

  return (
    <li className="flex items-start justify-between gap-3 py-2" data-testid={`content-row-${row.id}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium break-words text-ink">{row.title}</p>
        {(row.where || row.period) && <p className="text-xs break-words text-ink-muted">{[row.where, row.period].filter(Boolean).join(' · ')}</p>}
        <p className="text-xs leading-snug text-ink-muted">{useSuggestion || row.override !== undefined ? status : ''}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {row.level !== 'full' && (
          <Button small variant="secondary" onClick={show}>
            {t('profile.preview.content.show')}
            <span className="sr-only">: {row.title}</span>
          </Button>
        )}
        {row.override !== undefined && row.kind !== 'section' && (
          <Button small variant="ghost" onClick={() => change(followSuggestionFor(settings, row.kind as 'experiences' | 'educations' | 'certificates', row.id))}>
            {t('profile.preview.content.follow')}
            <span className="sr-only">: {row.title}</span>
          </Button>
        )}
      </div>
    </li>
  )
}

/** The text for the reason code of the suggestion; a code this version does not know gets the general text. */
function reasonOf(t: ReturnType<typeof useTranslation>['t'], row: ContentRow): string {
  const group = row.kind === 'experiences' ? 'experience' : row.kind === 'educations' ? 'education' : 'certificate'
  const known: readonly string[] = KNOWN_REASONS[group]
  return t(`applications.content.reasons.${group}.${row.reason && known.includes(row.reason) ? row.reason : 'unknown'}`)
}

/** Every entry of the profile with what the CV does with it; sections only appear when they are left out. */
function rowsOf(
  profile: Profile,
  settings: CvContentSettings,
  data: ReturnType<typeof useContentSuggestion>['query']['data'],
  stored: (value: string | null | undefined) => string,
  t: ReturnType<typeof useTranslation>['t'],
): ContentRow[] {
  const period = (start: string | null | undefined, end: string | null | undefined, current: boolean) =>
    start ? `${stored(start)} – ${current ? t('applications.content.now') : stored(end) || '–'}` : ''
  const reasonCode = (kind: 'experiences' | 'educations' | 'certificates', id: string) => data?.[kind]?.find((entry) => entry.id === id)?.reason

  const rows: ContentRow[] = []
  for (const entry of profile.experiences) {
    rows.push({
      kind: 'experiences',
      id: entry.id,
      title: entry.jobTitle,
      where: entry.employer,
      period: period(entry.startDate, entry.endDate, entry.isCurrent),
      level: levelFor(settings, data, 'experiences', entry.id),
      suggested: suggestedLevel(data, 'experiences', entry.id) ?? 'full',
      reason: reasonCode('experiences', entry.id),
      override: settings.overrides.experiences[entry.id],
    })
  }
  for (const entry of profile.educations) {
    rows.push({
      kind: 'educations',
      id: entry.id,
      title: [entry.degree, entry.fieldOfStudy].filter(Boolean).join(', '),
      where: entry.institution,
      period: period(entry.startDate, entry.endDate, entry.isCurrent),
      level: levelFor(settings, data, 'educations', entry.id),
      suggested: suggestedLevel(data, 'educations', entry.id) ?? 'full',
      reason: reasonCode('educations', entry.id),
      override: settings.overrides.educations[entry.id],
    })
  }
  for (const entry of profile.certificates) {
    rows.push({
      kind: 'certificates',
      id: entry.id,
      title: entry.title,
      where: entry.issuer ?? '',
      period: entry.issueDate ? stored(entry.issueDate) : '',
      level: levelFor(settings, data, 'certificates', entry.id),
      suggested: suggestedLevel(data, 'certificates', entry.id) ?? 'full',
      reason: reasonCode('certificates', entry.id),
      override: settings.overrides.certificates[entry.id],
    })
  }
  for (const key of settings.overrides.hiddenSections) {
    const custom = key.startsWith('custom:') ? profile.customSections.find((section) => `custom:${section.id}`.toLowerCase() === key.toLowerCase()) : undefined
    if (key.startsWith('custom:') && !custom) continue
    rows.push({
      kind: 'section',
      id: key,
      title: custom ? custom.title : t(`applications.content.sections.${key}`, { defaultValue: key }),
      where: '',
      period: '',
      level: 'hidden',
      suggested: 'full',
      reason: undefined,
      override: 'hidden',
    })
  }
  return rows
}
