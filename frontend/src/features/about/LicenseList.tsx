import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { get } from '../../api/client'
import { Icon } from '../../components/ui/Icon'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading } from '../../components/ui/Page'
import { TextField } from '../../components/ui/TextField'
import { safeHttpUrl } from '../../format'

/** One third-party component as the build lists it (static file next to the app). */
export interface LicenseEntry {
  name: string
  version: string
  license: string
  url: string | null
  component: string
  text: string | null
}

/** The entries whose name, licence or part of the program contains every word of the search (case does not matter). */
export function filterLicenses(entries: readonly LicenseEntry[], search: string): LicenseEntry[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...entries]
  return entries.filter((entry) => {
    const haystack = `${entry.name} ${entry.version} ${entry.license} ${entry.component}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

function LicenseRow({ entry }: { entry: LicenseEntry }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const link = safeHttpUrl(entry.url)

  return (
    <li className="px-3 py-2" data-testid="license-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xs text-left"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className="shrink-0 text-ink-muted" />
          <span className="min-w-0 break-words text-sm font-semibold text-ink">{entry.name}</span>
          <span className="shrink-0 font-mono text-xs text-ink-muted">{entry.version}</span>
        </button>
        <span className="badge badge-neutral">{entry.license}</span>
        <span className="text-xs text-ink-muted">{entry.component}</span>
      </div>
      {open && (
        <div id={panelId} className="mt-2 space-y-2 pl-6">
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold">
              {link}
              <Icon name="externalLink" size={14} />
            </a>
          )}
          {entry.text ? (
            <pre className="max-h-72 overflow-auto rounded-sm border border-line bg-sunken p-3 font-mono text-xs break-words whitespace-pre-wrap text-ink select-text">
              {entry.text}
            </pre>
          ) : (
            <p className="text-sm text-ink-muted">{t('about.noLicenseText')}</p>
          )}
        </div>
      )}
    </li>
  )
}

/** The list of third-party components with their licences: searchable, each licence text opens on demand. */
export function LicenseList({ url }: { url: string }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const entries = useQuery({ queryKey: ['third-party-licenses', url], queryFn: () => get<LicenseEntry[]>(url), staleTime: Infinity, retry: false })
  const shown = useMemo(() => filterLicenses(entries.data ?? [], search), [entries.data, search])

  if (entries.isPending) return <Loading />
  if (entries.isError) return <ErrorNotice error={entries.error} title={t('about.licensesLoadFailed')} />

  return (
    <div className="space-y-3" data-testid="license-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TextField
          className="w-full max-w-sm"
          label={t('about.search')}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('about.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-sm text-ink-muted" role="status">
          {t('about.licensesCount', { shown: shown.length, total: entries.data.length })}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-sm border border-line px-3 py-6 text-center text-sm text-ink-muted">{t('about.licensesNone')}</p>
      ) : (
        <ul className="max-h-[30rem] divide-y divide-line overflow-y-auto rounded-sm border border-line" aria-label={t('about.licensesTitle')}>
          {shown.map((entry) => (
            <LicenseRow key={`${entry.component}/${entry.name}/${entry.version}`} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  )
}
