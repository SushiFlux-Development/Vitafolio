import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { updatesApi } from '../../api/endpoints'
import type { UpdateChannel, UpdateStatusDto } from '../../api/types'
import { AlertSlot } from '../../components/ui/AlertSlot'
import { Button } from '../../components/ui/Button'
import { CopyButton } from '../../components/ui/CopyButton'
import { Icon } from '../../components/ui/Icon'
import { ErrorNotice, Notice } from '../../components/ui/Notice'
import { Loading, Section } from '../../components/ui/Page'
import { Segmented } from '../../components/ui/Segmented'
import { installError } from '../../features/updates/UpdateProgressDialog'
import { useInstallUpdate } from '../../features/updates/useInstallUpdate'
import { WhatsNewViewer } from '../../features/whats-new/WhatsNewViewer'
import { safeHttpUrl } from '../../format'
import { useDateFormat } from '../../hooks/useDateFormat'
import { releasesUrl, useAbout } from '../../hooks/useAbout'
import { UPDATE_STATUS_KEY, isDevBuild, isInstallRunning, isUpdateOffered, useUpdateStatus } from '../../hooks/useUpdates'

/** The image tag each channel pulls (the same rule the server applies; only used to size the reserved room of the notice). */
const DOCKER_TAG: Record<UpdateChannel, string> = { none: 'latest', beta: 'beta', nightly: 'nightly' }

const CHANNELS: readonly UpdateChannel[] = ['none', 'beta', 'nightly']

/** A link to a page outside the app, opened in the browser. */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold">
      {children}
      <Icon name="externalLink" size={14} />
    </a>
  )
}

/**
 * The update page. "Search for updates" is always available; below it the status in plain words (up to date, available, a
 * development build, a version that cannot be compared), the way to update on this kind of installation (one click in the
 * Windows program, the steps and the image tag for Docker and Unraid) and the choice of the channel. In the Windows program
 * it sits in the settings, on a server in the administration.
 */
export function UpdatesTab() {
  const { t } = useTranslation()
  const dates = useDateFormat()
  const queryClient = useQueryClient()
  const status = useUpdateStatus()
  const about = useAbout()
  const { start, starting } = useInstallUpdate()
  const [notesOpen, setNotesOpen] = useState(false)

  const store = (fresh: UpdateStatusDto) => queryClient.setQueryData(UPDATE_STATUS_KEY, fresh)
  const check = useMutation({ mutationFn: updatesApi.check, onSuccess: store })
  const channel = useMutation({ mutationFn: (next: UpdateChannel) => updatesApi.setChannel(next), onSuccess: store })

  if (status.isPending) return <Loading />
  if (status.isError && !status.data) return <ErrorNotice error={status.error} title={t('updates.loadFailed')} />

  const data = status.data!
  const server = data.host === 'server'
  const dev = isDevBuild(data)
  const offered = isUpdateOffered(data)
  const running = isInstallRunning(data.install.state)
  const available = data.available
  const releases = releasesUrl(about.data?.sourceUrl)
  const notesLink = safeHttpUrl(available?.htmlUrl)
  const dockerCommand = `docker pull ${data.dockerImage}:${data.dockerTag}`

  return (
    <div className="flex flex-col gap-6" data-testid="admin-updates">
      <Section title={t('updates.title')} description={t('updates.description')}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-select text-select-ink">
                <Icon name={offered ? 'circleArrowUp' : 'check'} size={22} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{t('updates.currentVersionTitle')}</h3>
                <p className="mt-0.5 font-mono text-sm font-semibold break-words text-ink" data-testid="updates-current">
                  {data.currentVersion}
                </p>
              </div>
            </div>
            <Button icon="refresh" busy={check.isPending} onClick={() => check.mutate()} data-testid="updates-check">
              {t('updates.checkNow')}
            </Button>
          </div>

          <p className="min-h-5 text-xs text-ink-muted">{data.checkedAt ? t('updates.lastCheckedAt', { time: dates.dateTime(data.checkedAt) }) : t('updates.neverChecked')}</p>
          {/* The line keeps its room whether or not the hint shows, so a check moves nothing. */}
          <p className="min-h-4 text-xs text-warning-soft-ink">{data.throttled ? t('updates.throttledHint') : ''}</p>

          {check.isError && <ErrorNotice error={check.error} title={t('updates.checkFailed')} />}
          {data.state === 'error' && data.error && <ErrorNotice error={new ApiError(0, { detail: data.error })} title={t('updates.checkFailed')} />}

          {/* The status in plain words. */}
          {dev && <Notice tone="info">{t('updates.state.devBuild')}</Notice>}
          {data.state === 'unknownVersion' && <Notice tone="warning">{t('updates.state.unknownVersion')}</Notice>}
          {data.state === 'upToDate' && <Notice tone="success">{t('updates.state.upToDate')}</Notice>}
        </div>
      </Section>

      {offered && available && (
        <section className="notice notice-info flex flex-col gap-3 p-5" aria-label={t('updates.availableBadge')} data-testid="update-available">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="badge badge-info mb-1.5 tracking-wider uppercase">{t('updates.availableBadge')}</span>
              <h4 className="text-base font-semibold break-words text-ink">{available.display}</h4>
              {available.publishedAt && <p className="mt-1 text-xs text-ink-muted">{t('updates.publishedAt', { date: dates.date(available.publishedAt) })}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!server && data.canInstall && (
                <Button variant="confirm" icon="circleArrowUp" busy={starting} disabled={running} onClick={() => void start(data)} data-testid="updates-install">
                  {t('updates.install.button')}
                </Button>
              )}
            </div>
          </div>
          {notesLink && <ExternalLink href={notesLink}>{t('updates.viewOnGitHub')}</ExternalLink>}
          {available.notes && (
            <div className="max-h-48 overflow-y-auto rounded-sm border border-line bg-surface p-3 font-mono text-xs leading-relaxed whitespace-pre-line text-ink select-text">{available.notes}</div>
          )}
        </section>
      )}

      {/* A run that failed stays in the status: shown complete and copyable until the next run. */}
      {data.install.state === 'failed' && (
        <ErrorNotice error={installError(data.install)} title={t('updates.progress.failedNotice')} />
      )}
      {running && <Notice tone="info">{t('updates.install.running')}</Notice>}

      <div className="card-grid items-start gap-6 [--card-min:34rem]">
      <Section title={server ? t('updates.instructionsServerTitle') : t('updates.instructionsDesktopTitle')}>
        {server ? (
          <div className="flex max-w-3xl flex-col gap-3 text-sm leading-relaxed text-ink-muted">
            <p>{t('updates.instructionsServerIntro', { tag: data.dockerTag })}</p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>{t('updates.instructionsServerStep1')}</li>
              <li>{t('updates.instructionsServerStep2')}</li>
              <li>{t('updates.instructionsServerStep3')}</li>
            </ol>
            {/* The command takes the free width, so the copy button sits at the same place whichever tag it names. */}
            <div className="flex items-center gap-3">
              <code className="min-w-0 flex-1 rounded-sm border border-line bg-sunken px-3 py-2 font-mono text-xs break-all text-ink select-all" data-testid="docker-command">
                {dockerCommand}
              </code>
              <CopyButton getText={() => dockerCommand} />
            </div>
            <p>{t('updates.instructionsServerCompose')}</p>
          </div>
        ) : (
          <div className="flex max-w-3xl flex-col gap-3 text-sm leading-relaxed text-ink-muted">
            <p>{data.canInstall ? t('updates.instructionsDesktopOneClick') : t('updates.instructionsDesktopManual')}</p>
            {!data.canInstall && releases && <ExternalLink href={releases}>{t('updates.openReleases')}</ExternalLink>}
          </div>
        )}
      </Section>

      <Section title={t('updates.channel.title')} description={t('updates.channel.text')}>
        <div className="flex max-w-3xl flex-col gap-4" data-testid="update-channel">
          <Segmented
            label={t('updates.channel.title')}
            value={data.channel}
            onChange={(next) => channel.mutate(next)}
            disabled={channel.isPending}
            options={CHANNELS.map((value) => ({ value, label: t(`updates.channel.${value}`) }))}
          />
          {/* The explanations of all channels are drawn invisibly in the same cell, so the card keeps the height of the longest one. */}
          <div className="grid text-sm leading-relaxed text-ink">
            <p className="col-start-1 row-start-1" data-testid="update-channel-text">
              {t(`updates.channel.${data.channel}Text`)}
            </p>
            {CHANNELS.map((value) => (
              <span key={value} aria-hidden="true" data-reserved={t(`updates.channel.${value}Text`)} className="pointer-events-none invisible col-start-1 row-start-1 select-none after:content-[attr(data-reserved)]" />
            ))}
          </div>
          <p className="min-h-4 text-xs text-ink-muted">{data.channelSaved ? '' : t('updates.channel.notSaved')}</p>
          {server ? (
            <AlertSlot plain reserve={CHANNELS.map((value) => t('updates.channel.dockerNote', { image: `${data.dockerImage}:${DOCKER_TAG[value]}` }))}>
              <Notice tone="info">{t('updates.channel.dockerNote', { image: `${data.dockerImage}:${data.dockerTag}` })}</Notice>
            </AlertSlot>
          ) : (
            <p className="text-xs text-ink-muted">{t('updates.channel.desktopNote')}</p>
          )}
          {channel.isError && <ErrorNotice error={channel.error} title={t('updates.channel.saveFailed')} />}
        </div>
      </Section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button icon="sparkles" onClick={() => setNotesOpen(true)}>
          {t('updates.whatsNewButton')}
        </Button>
        {releases && <ExternalLink href={releases}>{t('updates.allReleases')}</ExternalLink>}
      </div>

      <WhatsNewViewer open={notesOpen} onClose={() => setNotesOpen(false)} />
    </div>
  )
}
