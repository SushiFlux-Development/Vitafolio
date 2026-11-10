import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { profileApi } from '../../api/endpoints'
import type { ContentSuggestion, CvSelection, Education, Experience, Profile } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading } from '../../components/ui/Page'
import { Segmented } from '../../components/ui/Segmented'
import { Toggle } from '../../components/ui/Toggle'
import { useDateFormat } from '../../hooks/useDateFormat'
import {
  certificateHidden,
  knownIdsOf,
  customSectionKey,
  EMPTY_SELECTION,
  isCompleteSelection,
  levelOf,
  sectionHidden,
  suggestedCertificateHidden,
  suggestedLevel,
  withCertificateHidden,
  withLevel,
  withSectionHidden,
} from './cvSelection'
import type { EntryLevel, LeveledKind } from './cvSelection'
import type { useContentSuggestion } from './queries'
import { Reserved } from './Reserved'
import { periodText } from '../profile/periodText'
import { describeSelection } from './selectionSummary'

/** Where the guide page lives (the answers there shape the suggestion). */
export const GUIDE_ROUTE = '/guide'

const LEVELS: readonly EntryLevel[] = ['full', 'short', 'hidden']
const STAGES = ['entry', 'some', 'long'] as const
const CHECKLIST_KEYS = ['cover_letter', 'cv', 'work_references', 'highest_degree', 'certificates', 'photo'] as const
const CHECKLIST_STATES = ['ok', 'missing', 'optional', 'not_needed'] as const
type ChecklistState = (typeof CHECKLIST_STATES)[number]

const STATE_LOOK: Record<ChecklistState, { badge: string; icon: IconName }> = {
  ok: { badge: 'badge-success', icon: 'circleCheck' },
  missing: { badge: 'badge-warning', icon: 'alertTriangle' },
  optional: { badge: 'badge-neutral', icon: 'infoCircle' },
  not_needed: { badge: 'badge-neutral', icon: 'ban' },
}

/** The reason codes the dialog has a text for; any other code gets the general text. */
export const KNOWN_REASONS = {
  experience: ['recent', 'older_than_10_years', 'old_internship', 'entry', 'new_field', 'before_break'],
  education: ['highest', 'school', 'school_entry', 'earlier_degree', 'other', 'below_highest_degree', 'older_earlier_degree'],
  certificate: ['recent', 'older_than_10_years', 'no_date'],
} as const

interface CvContentDialogProps {
  open: boolean
  onClose: () => void
  /** The selection of the form; changes are written back at once (the form's own Cancel / Save decides about them). */
  selection: CvSelection
  onChange: (selection: CvSelection) => void
  suggestion: ReturnType<typeof useContentSuggestion>
  /** "Take the suggestion": the form sets the selection and the attachments from it. */
  onTakeSuggestion: (suggestion: ContentSuggestion) => void
  /** The user follows the link to the guide page; the form decides whether that may happen (unsaved input) and closes itself. Without it the link just navigates. */
  onLeave?: () => void
  /**
   * "application" (default): the choice of one application, with the checklist of what belongs in it. "profile": the settings of the
   * master profile itself (the values are its own corrections to the suggestion); there is no checklist and no attachment there.
   */
  mode?: 'application' | 'profile'
  /** What "everything complete" does; by default the selection is emptied. */
  onReset?: () => void
}

/**
 * "What goes into the CV of this application": the app proposes and gives a reason, the person decides. Every station and education
 * has three levels (full, short, leave out), every certificate and section one switch. Nothing is left out without a click, and
 * every value stays editable after the suggestion was taken. The master profile itself is never changed here.
 */
export function CvContentDialog({ open, onClose, selection, onChange, suggestion, onTakeSuggestion, onLeave, mode = 'application', onReset }: CvContentDialogProps) {
  const { t } = useTranslation()
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get(),
    enabled: open,
  })
  const profile = profileQuery.data
  const data = suggestion.query.data
  const complete = isCompleteSelection(selection)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('applications.content.title')}
      icon="files"
      size="lg"
      footer={
        <Button variant="confirm" onClick={onClose}>
          {t('applications.content.done')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <SuggestionHeader
          suggestion={suggestion}
          complete={complete}
          onTake={() => void suggestion.take(onTakeSuggestion)}
          onReset={onReset ?? (() => onChange(EMPTY_SELECTION))}
          onLeave={onLeave}
          mode={mode}
        />
        {mode === 'application' && <Checklist data={data} />}
        {profile === undefined ? (
          profileQuery.isError ? (
            <div className="flex flex-col items-start gap-3">
              <ErrorNotice error={profileQuery.error} title={t('applications.content.errors.profile')} />
              <Button icon="refresh" onClick={() => void profileQuery.refetch()}>
                {t('preview.retry')}
              </Button>
            </div>
          ) : (
            <Loading />
          )
        ) : (
          <ProfileEntries profile={profile} selection={selection} onChange={onChange} data={data} />
        )}
      </div>
    </Dialog>
  )
}

function SuggestionHeader({
  suggestion,
  complete,
  onTake,
  onReset,
  onLeave,
  mode,
}: {
  suggestion: ReturnType<typeof useContentSuggestion>
  complete: boolean
  onTake: () => void
  onReset: () => void
  onLeave: (() => void) | undefined
  mode: 'application' | 'profile'
}) {
  const { t } = useTranslation()
  const { query } = suggestion
  const data = query.data

  const stageLine = (stage: (typeof STAGES)[number], years: number) => `${yearsText(t, years)} ${t(`applications.content.stage.${stage}`)}`
  // The line says what the suggestion is based on; it keeps room for the longest of its possible texts.
  const reserve = [...STAGES.map((stage) => stageLine(stage, 99)), t('applications.content.errors.suggestionShort')]

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-4">
      <Reserved reserve={reserve} className="text-sm">
        {data ? (
          <p className="text-ink">{stageLine(STAGES.includes(data.stage) ? data.stage : 'some', data.yearsOfExperience)}</p>
        ) : query.isError ? (
          <p role="alert" className="text-danger">
            {t('applications.content.errors.suggestionShort')}
          </p>
        ) : null}
      </Reserved>
      <p className="text-[0.8125rem] leading-snug text-ink-muted">{t(mode === 'profile' ? 'profile.preview.content.dialogIntro' : 'applications.content.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="confirm" icon="sparkles" busy={query.isFetching && !data} onClick={onTake}>
          {t('applications.content.actions.take')}
        </Button>
        <Button variant="ghost" icon="refresh" disabled={complete} onClick={onReset}>
          {t(mode === 'profile' ? 'profile.preview.content.showAll' : 'applications.content.actions.reset')}
        </Button>
        <Link
          to={GUIDE_ROUTE}
          onClick={(event) => {
            if (!onLeave) return
            event.preventDefault()
            onLeave()
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-xs text-sm font-medium underline underline-offset-2"
        >
          {t('applications.content.guideLink')}
          <Icon name="chevronRight" size={14} />
        </Link>
      </div>
    </section>
  )
}

function yearsText(t: ReturnType<typeof useTranslation>['t'], years: number): string {
  return years > 0 ? t('applications.content.years', { count: Math.round(years) }) : t('applications.content.yearsNone')
}

/** "What belongs in this application" for exactly this person: six fixed rows, the state and a careful hint for each. */
function Checklist({ data }: { data: ContentSuggestion | undefined }) {
  const { t } = useTranslation()
  const known: readonly string[] = CHECKLIST_KEYS
  const extra = (data?.checklist ?? []).filter((item) => !known.includes(item.key)).map((item) => item.key)

  const hintFor = (key: string, state: ChecklistState) =>
    t(`applications.content.checklist.hints.${key}.${state}`, {
      defaultValue: t(`applications.content.checklist.fallback.${state}`),
    })

  return (
    <section aria-labelledby="cv-checklist-title" className="rounded-md border border-line p-4">
      <h3 id="cv-checklist-title" className="text-xs font-bold tracking-wider text-ink uppercase">
        {t('applications.content.checklist.title')}
      </h3>
      <p className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">{t('applications.content.checklist.note')}</p>
      <ul className="mt-2 divide-y divide-line">
        {[...CHECKLIST_KEYS, ...extra].map((key) => {
          const found = data?.checklist.find((item) => item.key === key)
          // A state this version does not know is shown like "optional" instead of failing.
          const state: ChecklistState | null = found ? (CHECKLIST_STATES.includes(found.state) ? found.state : 'optional') : null
          const look = state ? STATE_LOOK[state] : null
          return (
            <li key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 py-2" data-testid={`checklist-${key}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {t(`applications.content.checklist.items.${key}`, {
                    defaultValue: key,
                  })}
                </p>
                <Reserved reserve={CHECKLIST_STATES.map((each) => hintFor(key, each))} className="text-[0.8125rem] leading-snug text-ink-muted">
                  {state && <p>{hintFor(key, state)}</p>}
                </Reserved>
              </div>
              <span className="flex min-w-28 justify-end">
                {state && look ? (
                  <span className={`badge ${look.badge}`}>
                    <Icon name={look.icon} size={12} />
                    {t(`applications.content.checklist.states.${state}`)}
                  </span>
                ) : (
                  <span className="badge badge-neutral invisible" aria-hidden="true">
                    {t('applications.content.checklist.states.not_needed')}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[0.8125rem] text-ink-muted">{t('applications.content.checklist.manual')}</p>
    </section>
  )
}

function ProfileEntries({
  profile,
  selection,
  onChange,
  data,
}: {
  profile: Profile
  selection: CvSelection
  onChange: (selection: CvSelection) => void
  data: ContentSuggestion | undefined
}) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  const period = (startDate: string, endDate: string | null | undefined, isCurrent: boolean) =>
    periodText(dates.stored, { startDate, endDate, isCurrent }, { now: t('applications.content.now'), ongoing: t('profile.educations.ongoing') })

  const sections: { key: string; label: string }[] = [
    ...(profile.bio?.trim() ? [{ key: 'summary', label: t('applications.content.sections.summary') }] : []),
    ...(profile.skills.length > 0 ? [{ key: 'skills', label: t('applications.content.sections.skills') }] : []),
    ...(profile.languages.length > 0
      ? [
          {
            key: 'languages',
            label: t('applications.content.sections.languages'),
          },
        ]
      : []),
    ...(profile.interests.length > 0
      ? [
          {
            key: 'interests',
            label: t('applications.content.sections.interests'),
          },
        ]
      : []),
    ...profile.customSections.map((section) => ({
      key: customSectionKey(section.id),
      label: section.title,
    })),
  ]

  const levelRow = (kind: LeveledKind, entry: Experience | Education) => {
    const isExperience = kind === 'experiences'
    const title = isExperience ? (entry as Experience).jobTitle : [(entry as Education).degree, (entry as Education).fieldOfStudy].filter(Boolean).join(', ')
    const where = isExperience ? (entry as Experience).employer : (entry as Education).institution
    return (
      <LevelRow
        key={entry.id}
        kind={kind}
        id={entry.id}
        title={title}
        where={where}
        period={period(entry.startDate, entry.endDate, entry.isCurrent)}
        level={levelOf(selection, kind, entry.id)}
        data={data}
        onLevel={(level) => onChange(withLevel(selection, kind, entry.id, level))}
      />
    )
  }

  return (
    <>
      <Group title={t('applications.content.groups.experiences')} hint={t('applications.content.groups.levelHint')} empty={profile.experiences.length === 0}>
        {profile.experiences.map((entry) => levelRow('experiences', entry))}
      </Group>
      <Group title={t('applications.content.groups.educations')} hint={t('applications.content.groups.levelHint')} empty={profile.educations.length === 0}>
        {profile.educations.map((entry) => levelRow('educations', entry))}
      </Group>
      <Group title={t('applications.content.groups.certificates')} hint={t('applications.content.groups.switchHint')} empty={profile.certificates.length === 0}>
        {profile.certificates.map((certificate) => (
          <li key={certificate.id} className="py-2.5" data-testid={`entry-${certificate.id}`}>
            <Toggle
              label={certificate.title}
              description={[certificate.issuer, certificate.issueDate ? dates.stored(certificate.issueDate) : null].filter(Boolean).join(' · ') || undefined}
              checked={!certificateHidden(selection, certificate.id)}
              onChange={(shown) => onChange(withCertificateHidden(selection, certificate.id, !shown))}
            />
            <CertificateReason data={data} id={certificate.id} hidden={certificateHidden(selection, certificate.id)} />
          </li>
        ))}
      </Group>
      <Group title={t('applications.content.groups.sections')} hint={t('applications.content.groups.switchHint')} empty={sections.length === 0}>
        {sections.map((section) => (
          <li key={section.key} className="py-2.5">
            <Toggle
              label={section.label}
              checked={!sectionHidden(selection, section.key)}
              onChange={(shown) => onChange(withSectionHidden(selection, section.key, !shown))}
            />
          </li>
        ))}
      </Group>
      <p className="text-[0.8125rem] text-ink-muted" data-testid="cv-content-result">
        {describeSelection(t, selection, knownIdsOf(profile))}
      </p>
    </>
  )
}

function Group({ title, hint, empty, children }: { title: string; hint: string; empty: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <section className="rounded-md border border-line p-4">
      <h3 className="text-xs font-bold tracking-wider text-ink uppercase">{title}</h3>
      {empty ? (
        <p className="mt-1 text-sm text-ink-muted">{t('applications.content.groups.empty')}</p>
      ) : (
        <>
          <p className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">{hint}</p>
          <ul className="mt-1 divide-y divide-line">{children}</ul>
        </>
      )}
    </section>
  )
}

function LevelRow({
  kind,
  id,
  title,
  where,
  period,
  level,
  data,
  onLevel,
}: {
  kind: LeveledKind
  id: string
  title: string
  where: string
  period: string
  level: EntryLevel
  data: ContentSuggestion | undefined
  onLevel: (level: EntryLevel) => void
}) {
  const { t } = useTranslation()
  const suggested = suggestedLevel(data, kind, id)
  const reasonCode = (kind === 'experiences' ? data?.experiences : data?.educations)?.find((entry) => entry.id === id)?.reason
  const reasonKind = kind === 'experiences' ? 'experience' : 'education'
  const known: readonly string[] = KNOWN_REASONS[reasonKind]
  const reason = reasonCode === undefined ? null : t(`applications.content.reasons.${reasonKind}.${known.includes(reasonCode) ? reasonCode : 'unknown'}`)
  const differs = suggested !== undefined && suggested !== level

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 py-2.5" data-testid={`entry-${id}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold break-words text-ink">{title}</p>
        <p className="text-[0.8125rem] break-words text-ink-muted">{[where, period].filter(Boolean).join(' · ')}</p>
        {/* Two lines are kept for the reason, so the suggestion arriving (or a value starting to differ) moves nothing. */}
        <p className="mt-0.5 min-h-9 text-[0.8125rem] leading-snug text-ink-muted">
          {suggested !== undefined && (
            <>
              {differs && (
                <span className="badge badge-info mr-1.5 align-middle">
                  <Icon name="infoCircle" size={12} />
                  {t('applications.content.differs')}
                </span>
              )}
              {t('applications.content.suggestionLine', {
                level: t(`applications.content.levels.${suggested}`),
                reason,
              })}
            </>
          )}
        </p>
      </div>
      <Segmented
        label={t('applications.content.levelFor', { title })}
        value={level}
        onChange={onLevel}
        options={LEVELS.map((each) => ({
          value: each,
          label: t(`applications.content.levels.${each}`),
        }))}
      />
    </li>
  )
}

/** The suggestion for one certificate under its switch; two lines stay free for it, so it arriving moves nothing. */
function CertificateReason({ data, id, hidden }: { data: ContentSuggestion | undefined; id: string; hidden: boolean }) {
  const { t } = useTranslation()
  const suggestedHidden = suggestedCertificateHidden(data, id)
  const code = data?.certificates?.find((entry) => entry.id === id)?.reason
  const known: readonly string[] = KNOWN_REASONS.certificate
  return (
    <p className="mt-1 min-h-9 text-[0.8125rem] leading-snug text-ink-muted">
      {suggestedHidden !== undefined && code !== undefined && (
        <>
          {suggestedHidden !== hidden && (
            <span className="badge badge-info mr-1.5 align-middle">
              <Icon name="infoCircle" size={12} />
              {t('applications.content.differs')}
            </span>
          )}
          {t('applications.content.suggestionLine', {
            level: t(suggestedHidden ? 'applications.content.certificateChoice.hidden' : 'applications.content.certificateChoice.full'),
            reason: t(`applications.content.reasons.certificate.${known.includes(code) ? code : 'unknown'}`),
          })}
        </>
      )}
    </p>
  )
}
