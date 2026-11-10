import type { AboutInfo, Bootstrap, UpdateInstall, UpdateStatusDto, User, VersionInfo, WhatsNew } from '../api/types'

export const IDLE_INSTALL: UpdateInstall = { state: 'idle' }

/** A status as the server delivers it; the defaults describe an installed Windows program without an update. */
export function statusOf(overrides: Partial<UpdateStatusDto> = {}): UpdateStatusDto {
  return {
    currentVersion: 'v2026.11.12.13.557',
    currentTag: 'v2026.11.12',
    currentChannel: 'release',
    host: 'desktop',
    state: 'upToDate',
    hasUpdate: false,
    available: null,
    latestRelease: null,
    latestBeta: null,
    latestNightly: null,
    checkedAt: '2026-11-08T10:00:00Z',
    nextManualCheckAt: null,
    throttled: false,
    error: null,
    dockerImage: 'ghcr.io/example/vitafolio',
    channel: 'none',
    channelSaved: false,
    dockerTag: 'latest',
    canInstall: true,
    install: IDLE_INSTALL,
    ...overrides,
  }
}

/** A status with an update on offer. */
export function offeredStatus(overrides: Partial<UpdateStatusDto> = {}): UpdateStatusDto {
  return statusOf({
    state: 'available',
    hasUpdate: true,
    available: { tag: 'v2026.12.1', display: 'v2026.12.1 (4.200)', channel: 'release', htmlUrl: 'https://example.com/releases/v2026.12.1', publishedAt: '2026-12-01T09:00:00Z', notes: 'Notes' },
    ...overrides,
  })
}

export const ADMIN: User = {
  id: 'u1',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
  twoFactorEnabled: false,
  mustSetupTwoFactor: false,
  language: null,
  theme: null,
}

export const MEMBER: User = { ...ADMIN, id: 'u2', username: 'member', displayName: 'Member', role: 'user' }

export function bootstrapOf(mode: 'server' | 'desktop'): Bootstrap {
  return {
    productName: 'Vitafolio',
    mode,
    setupRequired: false,
    registrationOpen: false,
    rules: { username: { minLength: 3, maxLength: 32, pattern: '^[a-z]+$' }, displayName: { minLength: 1, maxLength: 80 }, password: { minLength: 12, maxLength: 128 } },
    languages: ['de', 'en'],
    documentDesigns: [{ id: 'classic' }, { id: 'modern' }, { id: 'plain' }],
  }
}

export function versionOf(version: string, channel: VersionInfo['channel'] = 'release'): VersionInfo {
  return { version, short: version.split(' ')[0] ?? version, buildId: 'v2026.11.12.13.557', channel }
}

export function notesOf(overrides: Partial<WhatsNew> = {}): WhatsNew {
  return {
    show: true,
    version: 'v2026.12.1 (4.200)',
    tag: 'v2026.12.1',
    language: 'de',
    summary: null,
    sections: [
      { category: 'new', title: 'Neu', items: ['Der **Lebenslauf** hat ein neues Design.', 'Befehl `docker pull` zeigt den Tag.'] },
      { category: 'fixed', title: 'Behoben', items: ['Ein Absturz beim Speichern.'] },
    ],
    ...overrides,
  }
}

export const ABOUT: AboutInfo = {
  product: 'Vitafolio',
  license: 'AGPL-3.0-only',
  sourceUrl: 'https://example.com/org/vitafolio',
  thirdPartyLicensesUrl: '/third-party-licenses.json',
  handbook: { de: true, en: true },
}
