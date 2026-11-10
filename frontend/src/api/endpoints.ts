import { api, apiResponse, del, get, patch, post, put } from './client'
import type { RequestOptions } from './client'
import { downloadPost, fileFromResponse } from './download'
import type {
  ActivityPage,
  AdminSettings,
  AdminUser,
  AdminAiConfig,
  AiConfig,
  AiParsePayload,
  AiPromptPayload,
  AiPromptResult,
  AboutInfo,
  Application,
  ApplicationEvent,
  ApplicationEventPayload,
  ApplicationListItem,
  ApplicationPayload,
  ApplicationStats,
  ApplicationStatusUpdatePayload,
  Attachment,
  BackupEntry,
  BackupSettings,
  BackupSettingsInfo,
  Bootstrap,
  Certificate,
  CvContentSettings,
  ContentSuggestion,
  CoverLetter,
  CoverLetterListItem,
  CoverLetterPayload,
  GuideAnswers,
  CoverLetterRenderOptions,
  CoverSheetOptions,
  CustomSection,
  CustomSectionItem,
  CvRenderOptions,
  DossierPreview,
  DossierSource,
  Education,
  Experience,
  Interest,
  LanguageCode,
  LanguageSkill,
  PreviewOptions,
  LoginResult,
  PersonalDataPayload,
  Profile,
  Role,
  SessionInfo,
  Skill,
  TestAiConnectionResult,
  ThemePreference,
  TotpSetup,
  UpdateAdminAiConfigPayload,
  UpdateAiConfigPayload,
  UpdateChannel,
  UpdateStatusDto,
  UserEnvelope,
  VersionInfo,
  WhatsNew,
} from './types'
import type { DateFormatPreference } from '../validation/dates'

/** Thin typed wrappers around the endpoints of the API contract; no logic lives here. */

export const publicApi = {
  bootstrap: () => get<Bootstrap>('/api/bootstrap'),
  version: () => get<VersionInfo>('/api/version'),
  /** Licence and source code: public, also before signing in. */
  about: () => get<AboutInfo>('/api/about'),
}

export const updatesApi = {
  status: () => get<UpdateStatusDto>('/api/updates/status'),
  check: () => post<UpdateStatusDto>('/api/admin/updates/check'),
  setChannel: (channel: UpdateChannel) => put<UpdateStatusDto>('/api/admin/updates/channel', { channel }),
  /** Starts the one-click update of the Windows program; the run is followed through `install` in the status. */
  install: () => post<UpdateStatusDto>('/api/admin/updates/install'),
}

export const whatsNewApi = {
  /** After a restart: `show` says whether the notes of the running version are due for this person. */
  pending: (lang: LanguageCode) => get<WhatsNew>(`/api/whats-new?lang=${encodeURIComponent(lang)}`),
  /** The same notes for reading later; 404 `whats_new.not_available` when there are none. */
  current: (lang: LanguageCode) => get<WhatsNew>(`/api/whats-new/current?lang=${encodeURIComponent(lang)}`),
  markSeen: () => post('/api/whats-new/seen'),
}

export const docsApi = {
  /** The manual as PDF (signed in); 404 `handbook.not_available` until it is part of the build. Availability per language: `publicApi.about`. */
  handbookPdf: async (lang: LanguageCode, signal?: AbortSignal): Promise<Blob> => {
    const res = await apiResponse('GET', `/api/docs/handbook?lang=${encodeURIComponent(lang)}`, undefined, signal)
    return res.blob()
  },
}

export interface NewAccount {
  username: string
  displayName: string
  password: string
  /** Only for the first account while the server asks for its setup code (normalised: XXXX-XXXX-XXXX-XXXX). */
  setupToken?: string
}

export const authApi = {
  setup: (body: NewAccount) => post<UserEnvelope>('/api/setup', body),
  register: (body: NewAccount) => post<UserEnvelope>('/api/auth/register', body),
  login: (body: { username: string; password: string }) => post<LoginResult>('/api/auth/login', body),
  loginTwoFactor: (body: { challengeId: string; code: string }) => post<UserEnvelope>('/api/auth/login/2fa', body),
  logout: () => post('/api/auth/logout'),
  me: () => get<UserEnvelope>('/api/auth/me'),
  requestEmergencyReset: () => post<{ requested: boolean }>('/api/auth/emergency-reset/request', {}),
  confirmEmergencyReset: (body: { code: string; newPassword: string }) =>
    post<{ success: boolean; username: string }>('/api/auth/emergency-reset/confirm', body),
}

export const accountApi = {
  savePreferences: (body: { language?: LanguageCode; theme?: ThemePreference; dateFormat?: DateFormatPreference }) => put('/api/account/preferences', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) => post('/api/account/password', body),
  totpSetup: () => post<TotpSetup>('/api/account/2fa/totp/setup'),
  /** The current password is required except right after a fresh sign-in during the forced setup (the server says so). */
  totpEnable: (body: { code: string; currentPassword?: string }) => post<{ recoveryCodes: string[] }>('/api/account/2fa/totp/enable', body),
  twoFactorDisable: (body: { password: string; code: string }) => post('/api/account/2fa/disable', body),
  sessions: () => get<SessionInfo[]>('/api/account/sessions'),
  revokeSession: (id: string) => del(`/api/account/sessions/${encodeURIComponent(id)}`),
}

export interface ActivityQuery {
  page: number
  pageSize: number
  action?: string
  userId?: string
}

export const adminApi = {
  users: () => get<AdminUser[]>('/api/admin/users'),
  createUser: (body: NewAccount & { role: Role }) => post<AdminUser>('/api/admin/users', body),
  updateUser: (id: string, body: { displayName?: string; role?: Role; disabled?: boolean }) =>
    patch<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`, body),
  resetTwoFactor: (id: string) => post(`/api/admin/users/${encodeURIComponent(id)}/reset-2fa`),
  setPassword: (id: string, body: { newPassword: string }) => post(`/api/admin/users/${encodeURIComponent(id)}/password`, body),
  deleteUser: (id: string) => del(`/api/admin/users/${encodeURIComponent(id)}`),
  settings: () => get<AdminSettings>('/api/admin/settings'),
  saveSettings: (body: AdminSettings & Reauth) => put<AdminSettings>('/api/admin/settings', body),
  activity: (query: ActivityQuery) => {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) })
    if (query.action) params.set('action', query.action)
    if (query.userId) params.set('userId', query.userId)
    return get<ActivityPage>(`/api/admin/activity?${params}`)
  },
  backups: () => get<BackupEntry[]>('/api/admin/backups'),
  runBackup: () => post<BackupEntry>('/api/admin/backups'),
  deleteBackup: (id: string, credentials: Reauth) => api<void>('DELETE', `/api/admin/backups/${encodeURIComponent(id)}`, credentials),
  backupSettings: () => get<BackupSettingsInfo>('/api/admin/backups/settings'),
  saveBackupSettings: (body: BackupSettings) => put('/api/admin/backups/settings', body),
  /** Download, upload and restore contain everybody's data: the server asks for the password (and 2FA code) again. */
  downloadBackup: (id: string, credentials: Reauth, fallbackName: string) =>
    downloadPost(`/api/admin/backups/${encodeURIComponent(id)}/download`, credentials, fallbackName),
  downloadCurrent: (credentials: Reauth, fallbackName: string) => downloadPost('/api/admin/backups/current/download', credentials, fallbackName),
  uploadBackup: (file: File, credentials: Reauth) => {
    const form = new FormData()
    form.append('file', file)
    if (credentials.password) form.append('password', credentials.password)
    if (credentials.code) form.append('code', credentials.code)
    return post<BackupEntry>('/api/admin/backups/upload', form)
  },
  restoreBackup: (id: string, credentials: Reauth) =>
    post<{ restored: boolean }>(`/api/admin/backups/${encodeURIComponent(id)}/restore`, credentials),
}

/** The admin's current password (and 2FA code when 2FA is on); empty in the desktop program (no password there). */
export interface Reauth {
  password?: string
  code?: string
}

export const profileApi = {
  get: () => get<Profile>('/api/profile'),
  update: (body: PersonalDataPayload, options?: RequestOptions) => put<Profile>('/api/profile', body, options),
  uploadPhoto: (file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return post<Profile>('/api/profile/photo', form)
  },
  deletePhoto: () => del('/api/profile/photo'),

  // Answers of the guide (Ratgeber): null until the wizard has been completed once
  getGuideAnswers: () => get<GuideAnswers | null>('/api/profile/guide-answers'),
  saveGuideAnswers: (body: GuideAnswers) => put<GuideAnswers>('/api/profile/guide-answers', body),

  // Experiences
  addExperience: (body: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>) => post<Experience>('/api/profile/experiences', body),
  updateExperience: (id: string, body: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>) => put<Experience>(`/api/profile/experiences/${encodeURIComponent(id)}`, body),
  deleteExperience: (id: string) => del(`/api/profile/experiences/${encodeURIComponent(id)}`),
  reorderExperiences: (ids: string[]) => put('/api/profile/experiences/reorder', { ids }),

  // Educations
  addEducation: (body: Omit<Education, 'id' | 'createdAt' | 'updatedAt'>) => post<Education>('/api/profile/educations', body),
  updateEducation: (id: string, body: Omit<Education, 'id' | 'createdAt' | 'updatedAt'>) => put<Education>(`/api/profile/educations/${encodeURIComponent(id)}`, body),
  deleteEducation: (id: string) => del(`/api/profile/educations/${encodeURIComponent(id)}`),
  reorderEducations: (ids: string[]) => put('/api/profile/educations/reorder', { ids }),

  // Skills
  addSkill: (body: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>) => post<Skill>('/api/profile/skills', body),
  updateSkill: (id: string, body: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>) => put<Skill>(`/api/profile/skills/${encodeURIComponent(id)}`, body),
  deleteSkill: (id: string) => del(`/api/profile/skills/${encodeURIComponent(id)}`),
  reorderSkills: (ids: string[]) => put('/api/profile/skills/reorder', { ids }),

  // Languages
  addLanguage: (body: Omit<LanguageSkill, 'id' | 'createdAt' | 'updatedAt'>) => post<LanguageSkill>('/api/profile/languages', body),
  updateLanguage: (id: string, body: Omit<LanguageSkill, 'id' | 'createdAt' | 'updatedAt'>) => put<LanguageSkill>(`/api/profile/languages/${encodeURIComponent(id)}`, body),
  deleteLanguage: (id: string) => del(`/api/profile/languages/${encodeURIComponent(id)}`),
  reorderLanguages: (ids: string[]) => put('/api/profile/languages/reorder', { ids }),

  // Certificates
  addCertificate: (body: Omit<Certificate, 'id' | 'createdAt' | 'updatedAt'>) => post<Certificate>('/api/profile/certificates', body),
  updateCertificate: (id: string, body: Omit<Certificate, 'id' | 'createdAt' | 'updatedAt'>) => put<Certificate>(`/api/profile/certificates/${encodeURIComponent(id)}`, body),
  deleteCertificate: (id: string) => del(`/api/profile/certificates/${encodeURIComponent(id)}`),
  reorderCertificates: (ids: string[]) => put('/api/profile/certificates/reorder', { ids }),

  // Interests
  addInterest: (body: Omit<Interest, 'id' | 'createdAt' | 'updatedAt'>) => post<Interest>('/api/profile/interests', body),
  updateInterest: (id: string, body: Omit<Interest, 'id' | 'createdAt' | 'updatedAt'>) => put<Interest>(`/api/profile/interests/${encodeURIComponent(id)}`, body),
  deleteInterest: (id: string) => del(`/api/profile/interests/${encodeURIComponent(id)}`),
  reorderInterests: (ids: string[]) => put('/api/profile/interests/reorder', { ids }),

  // Custom sections
  addCustomSection: (body: { title: string; sortOrder: number }) => post<CustomSection>('/api/profile/custom-sections', body),
  updateCustomSection: (id: string, body: { title: string; sortOrder: number }) => put<CustomSection>(`/api/profile/custom-sections/${encodeURIComponent(id)}`, body),
  deleteCustomSection: (id: string) => del(`/api/profile/custom-sections/${encodeURIComponent(id)}`),
  reorderCustomSections: (ids: string[]) => put('/api/profile/custom-sections/reorder', { ids }),

  addCustomSectionItem: (sectionId: string, body: Omit<CustomSectionItem, 'id' | 'createdAt' | 'updatedAt'>) =>
    post<CustomSectionItem>(`/api/profile/custom-sections/${encodeURIComponent(sectionId)}/items`, body),
  updateCustomSectionItem: (sectionId: string, id: string, body: Omit<CustomSectionItem, 'id' | 'createdAt' | 'updatedAt'>) =>
    put<CustomSectionItem>(`/api/profile/custom-sections/${encodeURIComponent(sectionId)}/items/${encodeURIComponent(id)}`, body),
  deleteCustomSectionItem: (sectionId: string, id: string) =>
    del(`/api/profile/custom-sections/${encodeURIComponent(sectionId)}/items/${encodeURIComponent(id)}`),
  reorderCustomSectionItems: (sectionId: string, ids: string[]) =>
    put(`/api/profile/custom-sections/${encodeURIComponent(sectionId)}/items/reorder`, { ids }),

  // PDF Preview & Export
  /** Saves what the master profile shows in its own CV; the answer is the normalised settings. */
  saveCvContentSettings: (body: CvContentSettings) => put<CvContentSettings>('/api/profile/cv-content-settings', body),
  savePreviewOptions: (body: PreviewOptions, options?: RequestOptions) => put<PreviewOptions>('/api/profile/preview-options', body, options),
  getPreviewPdf: async (options: CvRenderOptions, signal?: AbortSignal): Promise<Blob> => {
    const res = await apiResponse('POST', '/api/profile/preview/pdf', options, signal)
    return res.blob()
  },
  exportPdf: async (options: CvRenderOptions) =>
    fileFromResponse(await apiResponse('POST', '/api/profile/export/pdf', options), options.language === 'en' ? 'Resume.pdf' : 'Lebenslauf.pdf'),

  exportDocx: async (options: CvRenderOptions) =>
    fileFromResponse(await apiResponse('POST', '/api/profile/export/docx', options), options.language === 'en' ? 'Resume.docx' : 'Lebenslauf.docx'),

  getPreviewCoverSheetPdf: async (options: CoverSheetOptions, signal?: AbortSignal): Promise<Blob> => {
    const res = await apiResponse('POST', '/api/profile/preview/cover-sheet/pdf', options, signal)
    return res.blob()
  },

  exportCoverSheetPdf: async (options: CoverSheetOptions) =>
    fileFromResponse(await apiResponse('POST', '/api/profile/export/cover-sheet/pdf', options), options.language === 'en' ? 'CoverSheet.pdf' : 'Deckblatt.pdf'),

  // JSON Resume Standard (Import & Export - v1.0.0)
  getJsonResume: () => get<Record<string, unknown>>('/api/profile/json-resume'),
  importJsonResume: (resume: Record<string, unknown>, replace = false) =>
    post<Profile>(`/api/profile/json-resume/import?replace=${replace}`, resume),
}

export const coverLettersApi = {
  list: () => get<CoverLetterListItem[]>('/api/cover-letters'),
  get: (id: string) => get<CoverLetter>(`/api/cover-letters/${encodeURIComponent(id)}`),
  create: (body: CoverLetterPayload) => post<CoverLetter>('/api/cover-letters', body),
  update: (id: string, body: CoverLetterPayload, options?: RequestOptions) => put<CoverLetter>(`/api/cover-letters/${encodeURIComponent(id)}`, body, options),
  delete: (id: string) => del(`/api/cover-letters/${encodeURIComponent(id)}`),

  uploadSignature: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<CoverLetter>(`/api/cover-letters/${encodeURIComponent(id)}/signature`, form)
  },
  deleteSignature: (id: string) => del<CoverLetter>(`/api/cover-letters/${encodeURIComponent(id)}/signature`),

  getPreviewPdf: async (id: string, options: CoverLetterRenderOptions, signal?: AbortSignal): Promise<Blob> => {
    const res = await apiResponse('POST', `/api/cover-letters/${encodeURIComponent(id)}/preview/pdf`, options, signal)
    return res.blob()
  },

  exportPdf: async (id: string, options: CoverLetterRenderOptions) =>
    fileFromResponse(
      await apiResponse('POST', `/api/cover-letters/${encodeURIComponent(id)}/export/pdf`, options),
      options.language === 'en' ? 'Cover_Letter.pdf' : 'Anschreiben.pdf',
    ),

  exportDocx: async (id: string, options: CoverLetterRenderOptions) =>
    fileFromResponse(
      await apiResponse('POST', `/api/cover-letters/${encodeURIComponent(id)}/export/docx`, options),
      options.language === 'en' ? 'Cover_Letter.docx' : 'Anschreiben.docx',
    ),
}

/** The header that tells which version a dossier preview is (see `ApplicationsController.DossierSourceHeader`). */
export const DOSSIER_SOURCE_HEADER = 'X-Dossier-Source'

/** Reads which version a preview answer is; an answer without the header is a fresh render. */
export function dossierSourceFrom(headers: Headers): DossierSource {
  return headers.get(DOSSIER_SOURCE_HEADER)?.trim().toLowerCase() === 'archived' ? 'archived' : 'current'
}

/** The header that tells how many dossiers of a ZIP could not be built (see `ApplicationsController`, route `dossiers/archive`). */
export const DOSSIERS_FAILED_HEADER = 'X-Dossiers-Failed'

/** The most applications one ZIP request takes; the server refuses more. */
export const DOSSIER_ARCHIVE_LIMIT = 100

/** Reads the number of dossiers that were not built; a missing or unreadable header means none. */
export function dossiersFailedFrom(headers: Headers): number {
  const count = Number.parseInt(headers.get(DOSSIERS_FAILED_HEADER)?.trim() ?? '', 10)
  return Number.isFinite(count) && count > 0 ? count : 0
}

export const applicationsApi = {
  list: (params?: { status?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.search) query.set('search', params.search)
    const qs = query.toString()
    return get<ApplicationListItem[]>(`/api/applications${qs ? `?${qs}` : ''}`)
  },
  stats: () => get<ApplicationStats>('/api/applications/stats'),
  /** What an application of this person should contain, by their career (a suggestion; the user decides). */
  contentSuggestion: () => get<ContentSuggestion>('/api/applications/content-suggestion'),
  get: (id: string) => get<Application>(`/api/applications/${encodeURIComponent(id)}`),
  create: (body: ApplicationPayload) => post<Application>('/api/applications', body),
  update: (id: string, body: ApplicationPayload) => put<Application>(`/api/applications/${encodeURIComponent(id)}`, body),
  delete: (id: string) => del(`/api/applications/${encodeURIComponent(id)}`),
  updateStatus: (id: string, body: ApplicationStatusUpdatePayload) =>
    post<Application>(`/api/applications/${encodeURIComponent(id)}/status`, body),
  addEvent: (id: string, body: ApplicationEventPayload) =>
    post<ApplicationEvent>(`/api/applications/${encodeURIComponent(id)}/events`, body),
  deleteEvent: (id: string, eventId: string) =>
    del(`/api/applications/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`),
  getPreviewPdf: async (id: string, signal?: AbortSignal): Promise<Blob> => {
    const res = await apiResponse('GET', `/api/applications/${encodeURIComponent(id)}/dossier/preview`, undefined, signal)
    return res.blob()
  },
  /**
   * The dossier preview together with the version it shows. With a filed snapshot the default is that snapshot (what was sent), otherwise
   * the current state; `version: 'current'` asks for the current state on purpose. A filed snapshot whose file is lost answers 409
   * `archive.missing` (as the download does) - `version: 'current'` still works then.
   */
  getPreview: async (id: string, options: { version?: 'auto' | 'current'; signal?: AbortSignal } = {}): Promise<DossierPreview> => {
    const query = options.version === 'current' ? '?version=current' : ''
    const res = await apiResponse('GET', `/api/applications/${encodeURIComponent(id)}/dossier/preview${query}`, undefined, options.signal)
    return { blob: await res.blob(), source: dossierSourceFrom(res.headers) }
  },
  downloadDossier: async (id: string) =>
    fileFromResponse(await apiResponse('GET', `/api/applications/${encodeURIComponent(id)}/dossier/download`), 'Bewerbung.pdf'),
  /**
   * The dossiers of several applications as one ZIP (at most {@link DOSSIER_ARCHIVE_LIMIT} ids). `failed` is the number of dossiers the
   * server could not build (header `X-Dossiers-Failed`; the reasons are in a text file inside the ZIP) - the ZIP holds all the others.
   */
  downloadDossierArchive: async (ids: readonly string[], language: 'de' | 'en') => {
    const response = await apiResponse('POST', '/api/applications/dossiers/archive', { ids, language })
    const { blob, filename } = await fileFromResponse(response, language === 'en' ? 'Applications.zip' : 'Bewerbungen.zip')
    return { blob, filename, failed: dossiersFailedFrom(response.headers) }
  },
  /** Freezes the dossier. An existing snapshot is only replaced with `replace` (the page asks the user first). */
  archiveSnapshot: (id: string, replace = false) =>
    post<Application>(`/api/applications/${encodeURIComponent(id)}/dossier/archive${replace ? '?replace=true' : ''}`),
}

export const aiApi = {
  getConfig: () => get<AiConfig>('/api/ai/config'),
  saveConfig: (body: UpdateAiConfigPayload) => put<AiConfig>('/api/ai/config', body),
  /** The AI service of the whole server (administrators); saving asks for the password again. */
  getAdminConfig: () => get<AdminAiConfig>('/api/ai/admin-config'),
  saveAdminConfig: (body: UpdateAdminAiConfigPayload) => put<AdminAiConfig>('/api/ai/admin-config', body),
  testConnection: () => post<TestAiConnectionResult>('/api/ai/test-connection', {}),
  buildPrompt: (body: AiPromptPayload) => post<AiPromptResult>('/api/ai/prompt', body),
  parseResponse: <T>(body: AiParsePayload) => post<T>('/api/ai/parse', body),
  generate: <T>(body: AiPromptPayload) => post<T>('/api/ai/generate', body),
}

export const attachmentsApi = {
  list: () => get<Attachment[]>('/api/attachments'),
  upload: (file: File, title?: string, category?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (title) form.append('title', title)
    if (category) form.append('category', category)
    return post<Attachment>('/api/attachments', form)
  },
  update: (id: string, body: { title?: string; category?: string; sortOrder?: number }) =>
    put<Attachment>(`/api/attachments/${encodeURIComponent(id)}`, body),
  delete: (id: string) => del(`/api/attachments/${encodeURIComponent(id)}`),
  reorder: (ids: string[]) => put('/api/attachments/reorder', { ids }),
  downloadUrl: (id: string) => `/api/attachments/${encodeURIComponent(id)}/file`,
}

