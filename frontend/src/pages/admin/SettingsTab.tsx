import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../../api/endpoints'
import type { Reauth } from '../../api/endpoints'
import type { AdminSettings } from '../../api/types'
import { useAppState } from '../../auth/AppState'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { Icon } from '../../components/ui/Icon'
import { LiveTextField } from '../../components/ui/LiveTextField'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading, Section } from '../../components/ui/Page'
import { Toggle } from '../../components/ui/Toggle'
import { ReauthDialog } from '../../features/backups/ReauthDialog'
import { aiHostCheck, isValid } from '../../validation/rules'
import { AiServerSection } from './AiServerSection'

const KEY = ['admin', 'settings'] as const

/** The changes the server only accepts with the password again: whatever opens the instance further. */
function weakensProtection(before: AdminSettings, after: AdminSettings) {
  return (
    (!before.registrationOpen && after.registrationOpen) ||
    (before.requireTwoFactor && !after.requireTwoFactor) ||
    after.aiAllowedHosts.some((host) => !before.aiAllowedHosts.includes(host))
  )
}

/** Instance-wide switches, stored in the database and effective at once. Each change saves itself. */
export function SettingsTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const showError = useErrorDialog()
  const { bootstrap, session } = useAppState()
  const settings = useQuery({ queryKey: KEY, queryFn: adminApi.settings, retry: false })
  const [pending, setPending] = useState<AdminSettings | null>(null)
  const server = bootstrap.mode === 'server'

  const save = useMutation({
    mutationFn: adminApi.saveSettings,
    onSuccess: (saved, sent) => queryClient.setQueryData<AdminSettings>(KEY, saved ?? sent),
    onError: (error) => showError(error, t('admin.settings.saveFailed')),
  })

  if (settings.isPending) return <Loading />
  if (settings.isError) return <ErrorNotice error={settings.error} title={t('admin.settings.loadFailed')} />
  const current = settings.data

  async function change(patch: Partial<AdminSettings>) {
    if (patch.requireTwoFactor === true) {
      const ok = await confirm({
        title: t('admin.settings.confirm2faTitle'),
        message: t('admin.settings.confirm2faText'),
        confirmLabel: t('admin.settings.confirm2faAction'),
      })
      if (!ok) return
    }
    const next = { ...current, ...patch }
    if (server && weakensProtection(current, next)) setPending(next)
    else save.mutate(next)
  }

  async function confirmPending(credentials: Reauth) {
    if (pending === null) return
    const saved = await adminApi.saveSettings({ ...pending, ...credentials })
    queryClient.setQueryData<AdminSettings>(KEY, saved ?? pending)
    setPending(null)
  }

  return (
    <div className="card-grid items-start gap-6 [--card-min:30rem]">
      <Section title={t('admin.settings.accessTitle')} description={t('admin.settings.accessText')}>
        <div className="flex flex-col gap-6" data-testid="admin-settings">
          <Toggle
            checked={current.registrationOpen}
            onChange={(value) => void change({ registrationOpen: value })}
            label={t('admin.settings.registrationOpen')}
            description={t('admin.settings.registrationOpenHint')}
            disabled={save.isPending}
          />
          <div className="border-t border-line" />
          <Toggle
            checked={current.requireTwoFactor}
            onChange={(value) => void change({ requireTwoFactor: value })}
            label={t('admin.settings.requireTwoFactor')}
            description={t('admin.settings.requireTwoFactorHint')}
            disabled={save.isPending}
          />
        </div>
      </Section>

      {server && <AiServerSection />}

      {server && <AiHostsSection hosts={current.aiAllowedHosts} disabled={save.isPending} onChange={(aiAllowedHosts) => void change({ aiAllowedHosts })} />}

      {pending !== null && (
        <ReauthDialog
          open
          onClose={() => setPending(null)}
          title={t('admin.settings.stepUpTitle')}
          icon="alertTriangle"
          confirmLabel={t('admin.settings.stepUpAction')}
          askPassword={server}
          askCode={session.user?.twoFactorEnabled ?? false}
          onConfirm={confirmPending}
        >
          {t('admin.settings.stepUpText')}
        </ReauthDialog>
      )}
    </div>
  )
}

/** The hosts own AI base URLs may point to on this server. Adding one needs the password again; removing one does not. */
function AiHostsSection({ hosts, disabled, onChange }: { hosts: string[]; disabled: boolean; onChange: (hosts: string[]) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [attempted, setAttempted] = useState(false)

  function add(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!isValid(aiHostCheck, value)) return
    const host = value.trim().toLowerCase()
    if (!hosts.includes(host)) onChange([...hosts, host])
    setValue('')
    setAttempted(false)
  }

  return (
    <Section title={t('admin.settings.aiHostsTitle')} description={t('admin.settings.aiHostsText')}>
      <div className="flex max-w-xl flex-col gap-4" data-testid="admin-ai-hosts">
        <form onSubmit={add} noValidate className="flex items-start gap-3">
          <div className="flex-1">
            <LiveTextField
              label={t('admin.settings.aiHostsField')}
              name="aiHost"
              autoComplete="off"
              spellCheck={false}
              maxLength={253}
              value={value}
              onValueChange={setValue}
              check={aiHostCheck}
              attempted={attempted}
              hint={t('admin.settings.aiHostsHint')}
            />
          </div>
          <Button type="submit" variant="create" icon="plus" disabled={disabled} className="mt-[1.6rem]">
            {t('admin.settings.aiHostsAdd')}
          </Button>
        </form>
        {hosts.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('admin.settings.aiHostsEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-sm border border-line" aria-label={t('admin.settings.aiHostsTitle')}>
            {hosts.map((host) => (
              <li key={host} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="font-mono text-sm text-ink break-all">{host}</span>
                <Button
                  variant="ghost"
                  small
                  disabled={disabled}
                  aria-label={t('admin.settings.aiHostsRemove', { host })}
                  onClick={() => onChange(hosts.filter((entry) => entry !== host))}
                >
                  <Icon name="trash" size={15} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
