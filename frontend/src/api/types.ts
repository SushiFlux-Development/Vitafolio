/** Wire types of the API contract. All JSON is camelCase. */

import type { DateFormatPreference } from '../validation/dates'

export type Role = 'admin' | 'user'
/** The two themes there are. An account saved before this may still hold "system" on the server (see User.theme); it is turned into one of these on load. */
export type ThemePreference = 'light' | 'dark'
export type LanguageCode = 'de' | 'en'
export type HostMode = 'server' | 'desktop'

export interface User {
  id: string
  username: string
  displayName: string
  role: Role
  twoFactorEnabled: boolean
  mustSetupTwoFactor: boolean
  language: LanguageCode | null
  theme: ThemePreference | 'system' | null
  /** How dates are typed and shown ('auto' = by the interface language); a server without the setting leaves it out. */
  dateFormat?: DateFormatPreference | null
}

export interface TextRule {
  minLength: number
  maxLength: number
}

/** The only source of form rules for the UI (delivered by /api/bootstrap). */
export interface Rules {
  username: TextRule & { pattern: string }
  displayName: TextRule
  password: TextRule
}

export interface Bootstrap {
  productName: string
  mode: HostMode
  setupRequired: boolean
  /** The first account needs the one-time setup code from the server's log (only while setup is required). */
  setupTokenRequired?: boolean
  registrationOpen: boolean
  rules: Rules
  languages: LanguageCode[]
  /** The fonts documents can use - the only list there is (shipped with the server). */
  documentFonts?: DocumentFont[]
  /** The CV designs on offer - the only list there is (names and descriptions are translations in the UI). */
  documentDesigns?: DocumentDesign[]
}

export interface DocumentDesign {
  id: string
  /** How the gallery groups the design; none = the ordinary group. */
  group?: string
}

export interface DocumentFont {
  family: string
  serif: boolean
}

export interface VersionInfo {
  /** The readable form, e.g. "v2026.11.12.13.557" (release), "v2026.11.12.13.557 (β)" (beta), "(α)" (nightly), "(</>)" (dev) - shown as it is. */
  version: string
  short: string
  buildId: string
  channel: 'dev' | 'beta' | 'nightly' | 'release' | string
}

export interface UserEnvelope {
  user: User
}

export type LoginResult = UserEnvelope | { twoFactorRequired: true; challengeId: string }

export interface TotpSetup {
  secret: string
  otpauthUri: string
}

export interface SessionInfo {
  id: string
  createdAt: string
  lastUsedAt: string
  ip: string | null
  userAgent: string | null
  current: boolean
}

export interface AdminUser {
  id: string
  username: string
  displayName: string
  role: Role
  disabled: boolean
  twoFactorEnabled: boolean
  createdAt?: string
  lastLoginAt?: string | null
}

export interface AdminSettings {
  registrationOpen: boolean
  requireTwoFactor: boolean
  /** Host names or IPs own AI base URLs may point to on this server. */
  aiAllowedHosts: string[]
}

export interface UpdateReleaseDto {
  tag: string
  display: string
  channel: string
  htmlUrl?: string | null
  publishedAt?: string | null
  notes?: string | null
}

export interface UpdateStatusDto {
  currentVersion: string
  currentTag: string
  currentChannel: string
  host: 'desktop' | 'server' | string
  /** 'unknownVersion': the running version cannot be compared, nothing is offered. */
  state: 'upToDate' | 'available' | 'devBuild' | 'unknownVersion' | 'error' | 'checking' | string
  hasUpdate: boolean
  available?: UpdateReleaseDto | null
  latestRelease?: UpdateReleaseDto | null
  latestBeta?: UpdateReleaseDto | null
  latestNightly?: UpdateReleaseDto | null
  checkedAt?: string | null
  nextManualCheckAt?: string | null
  throttled: boolean
  error?: string | null
  dockerImage: string
  /** The chosen update channel; while nothing is saved, the channel of the running build. */
  channel: UpdateChannel
  channelSaved: boolean
  /** The image tag this channel needs on Docker/Unraid: 'latest', 'beta' or 'nightly'. */
  dockerTag: string
  /** Windows program, installed by the setup program, not a development run. */
  canInstall: boolean
  install: UpdateInstall
}

export type UpdateChannel = 'none' | 'beta' | 'nightly'

export type UpdateInstallState = 'idle' | 'downloading' | 'backingUp' | 'restarting' | 'failed'

export interface UpdateInstall {
  state: UpdateInstallState
  /** 0-100 while downloading, otherwise null. */
  progress?: number | null
  targetTag?: string | null
  targetDisplay?: string | null
  /** updates.download_failed, updates.checksum_failed, updates.backup_failed, updates.no_package, updates.busy, ... */
  errorCode?: string | null
  error?: string | null
  /** The complete technical text for "Technical details" and the Copy button. */
  errorDetails?: string | null
  /** Name of the backup made before the update. */
  backupFile?: string | null
}

export interface ChangelogSection {
  /** new | changed | fixed | security | removed | deprecated | other */
  category: string
  title: string
  /** May contain inline Markdown (**bold**). */
  items: string[]
}

export interface WhatsNew {
  show: boolean
  version?: string | null
  tag?: string | null
  language: string
  summary?: string | null
  sections: ChangelogSection[]
}

export interface AboutInfo {
  product: string
  license: string
  sourceUrl: string
  /** Static file of the app with the third-party licences. */
  thirdPartyLicensesUrl: string
  handbook: { de: boolean; en: boolean }
}

export interface ActivityItem {
  id: string | number
  /** UTC time of the event. */
  at: string
  actorId: string | null
  actorName: string | null
  action: string
  target: string | null
  ip: string | null
  details: unknown
}

export interface ActivityPage {
  items: ActivityItem[]
  total: number
}

export type BackupKind = 'start' | 'shutdown' | 'scheduled' | 'manual' | 'pre-restore' | 'pre-update' | 'uploaded'

export interface BackupEntry {
  id: string
  file: string
  createdAt: string
  sizeBytes: number
  kind: BackupKind | string
  tier: 'recent' | 'daily' | string
  /** "database": an old backup without photos, signatures and attachments. */
  format?: 'archive' | 'database'
}

export type ScheduleKind = 'off' | 'interval' | 'times'

export interface BackupSchedule {
  kind: ScheduleKind
  /** 1-168 */
  intervalHours: number
  /** 24-hour "HH:mm", at most 12 entries. */
  times: string[]
  /** 1 = Monday ... 7 = Sunday. */
  weekdays: number[]
}

export interface BackupSettings {
  /** Master switch of all automatic backups (start, shutdown, schedule); manual actions always work. */
  automaticEnabled: boolean
  onStart: boolean
  beforeShutdown: boolean
  schedule: BackupSchedule
  catchUpMissed: boolean
  /** 5-500 */
  keepRecent: number
  /** 0-3650 */
  keepDailyDays: number
}

/** What GET /api/admin/backups/settings returns: the settings plus read-only facts about this instance. */
export interface BackupSettingsInfo extends BackupSettings {
  /** The planned runs of the next 7 days (ISO), as the server computes them. */
  nextRuns: string[]
  timeZone: string
  directory: string
  /** The largest backup file this server accepts. */
  maxUploadBytes?: number
}

/** One error entry of a field: a stable code plus the values for its message. */
export interface FieldProblem {
  code: string
  params?: Record<string, string | number | boolean>
}

/** RFC 7807 problem details as the server extends them. */
export interface ProblemDetails {
  status?: number
  title?: string
  detail?: string
  code?: string
  params?: Record<string, string | number | boolean>
  errors?: Record<string, FieldProblem[]>
  traceId?: string
}

export interface Experience {
  id: string
  jobTitle: string
  employer: string
  employmentType?: string | null
  city?: string | null
  country?: string | null
  startDate: string
  endDate?: string | null
  isCurrent: boolean
  description?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Education {
  id: string
  degree: string
  fieldOfStudy?: string | null
  institution: string
  city?: string | null
  country?: string | null
  startDate: string
  endDate?: string | null
  isCurrent: boolean
  grade?: string | null
  description?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Skill {
  id: string
  name: string
  category?: string | null
  level: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface LanguageSkill {
  id: string
  language: string
  level: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Certificate {
  id: string
  title: string
  issuer?: string | null
  issueDate?: string | null
  expiryDate?: string | null
  credentialUrl?: string | null
  credentialId?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Interest {
  id: string
  name: string
  category?: string | null
  description?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CustomSectionItem {
  id: string
  title: string
  subtitle?: string | null
  dateRange?: string | null
  description?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CustomSection {
  id: string
  title: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  items: CustomSectionItem[]
}

export interface Profile {
  id: string
  firstName: string
  lastName: string
  academicTitle?: string | null
  professionalTitle?: string | null
  email?: string | null
  phone?: string | null
  street?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  dateOfBirth?: string | null
  placeOfBirth?: string | null
  nationality?: string | null
  maritalStatus?: string | null
  website?: string | null
  linkedIn?: string | null
  gitHub?: string | null
  xing?: string | null
  bio?: string | null
  hasPhoto: boolean
  createdAt: string
  updatedAt: string
  experiences: Experience[]
  educations: Education[]
  skills: Skill[]
  languages: LanguageSkill[]
  certificates: Certificate[]
  interests: Interest[]
  customSections: CustomSection[]
  /** What "Preview & export" shows of this profile (the suggestion and the person's own corrections); missing = follow the suggestion. */
  cvContentSettings?: CvContentSettings | null
  /** The last chosen options of "Preview & export"; null while nothing has been saved yet. */
  previewOptions?: PreviewOptions | null
}

export interface PersonalDataPayload {
  firstName: string
  lastName: string
  academicTitle?: string | null
  professionalTitle?: string | null
  email?: string | null
  phone?: string | null
  street?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  dateOfBirth?: string | null
  placeOfBirth?: string | null
  nationality?: string | null
  maritalStatus?: string | null
  website?: string | null
  linkedIn?: string | null
  gitHub?: string | null
  xing?: string | null
  bio?: string | null
}

export type CvLevel = 'full' | 'short' | 'hidden'

/**
 * What the master profile shows in its own CV (preview and export). With `useSuggestion` the suggestion of the app decides what is
 * shown in full, shortened or left out; `overrides` are the person's own corrections to it (an entry that is not listed follows the
 * suggestion). Without `useSuggestion` everything is shown except what the overrides leave out.
 */
export interface CvContentSettings {
  useSuggestion: boolean
  overrides: {
    experiences: Record<string, CvLevel>
    educations: Record<string, CvLevel>
    certificates: Record<string, 'full' | 'hidden'>
    hiddenSections: string[]
  }
}

export interface CvRenderOptions {
  /** A design id from the server's list (Bootstrap.documentDesigns). */
  design?: string
  accentColor?: string
  font?: string
  showPhoto?: boolean
  photoShape?: 'round' | 'rounded' | 'rect'
  language?: 'de' | 'en'
  /** Asks the server to apply the effective selection of the master profile (what the person left out); the page always sends it. */
  applySelection?: boolean
}

/** The remembered choice on "Preview & export" (all six values; the server normalises them). */
export type PreviewOptions = Required<Omit<CvRenderOptions, 'applySelection'>>

export interface CoverLetter {
  id: string
  title: string
  senderName?: string | null
  senderStreet?: string | null
  senderPostalCode?: string | null
  senderCity?: string | null
  senderPhone?: string | null
  senderEmail?: string | null
  recipientCompany: string
  recipientDepartment?: string | null
  recipientContactPerson?: string | null
  recipientStreet?: string | null
  recipientPostalCode?: string | null
  recipientCity: string
  recipientCountry?: string | null
  place?: string | null
  date?: string | null
  subject: string
  salutation: string
  body: string
  closing: string
  signatureName?: string | null
  hasSignature: boolean
  attachmentsNote?: string | null
  language: 'de' | 'en'
  font?: string | null
  accentColor?: string | null
  /** Fold and punch marks on the printed letter, also inside a dossier. Saved with the letter; on for letters that existed before the choice. */
  includeFoldMarks: boolean
  createdAt: string
  updatedAt: string
}

export interface CoverLetterListItem {
  id: string
  title: string
  recipientCompany: string
  subject: string
  date?: string | null
  updatedAt: string
}

export interface CoverLetterPayload {
  title: string
  senderName?: string | null
  senderStreet?: string | null
  senderPostalCode?: string | null
  senderCity?: string | null
  senderPhone?: string | null
  senderEmail?: string | null
  recipientCompany: string
  recipientDepartment?: string | null
  recipientContactPerson?: string | null
  recipientStreet?: string | null
  recipientPostalCode?: string | null
  recipientCity: string
  recipientCountry?: string | null
  place?: string | null
  date?: string | null
  subject: string
  salutation: string
  body: string
  closing?: string | null
  signatureName?: string | null
  attachmentsNote?: string | null
  language?: 'de' | 'en'
  font?: string | null
  accentColor?: string | null
  /** Left out = unchanged on an edit (an older client must not switch the marks on again), on for a new letter. */
  includeFoldMarks?: boolean
}

export interface CoverLetterRenderOptions {
  font?: string
  accentColor?: string
  language?: 'de' | 'en'
  /** Left out = the saved choice of the letter; a value overrides it for this render only (the editor shows the unsaved state). */
  includeFoldMarks?: boolean
}

export interface CoverSheetOptions {
  targetJob?: string
  targetCompany?: string
  contents?: string[]
  accentColor?: string
  font?: string
  showPhoto?: boolean
  photoShape?: 'round' | 'rounded' | 'rect'
  language?: 'de' | 'en'
}

export type ApplicationStatus =
  | 'draft'
  | 'applied'
  | 'acknowledged'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

/**
 * What of the master profile an application leaves out of its CV. Stations and educations: `short` (without the description) or
 * `hidden`; certificates: `hidden`; `hiddenSections` holds "summary", "skills", "languages", "interests" and "custom:<guid>".
 * An id that is not listed is shown in full, so an empty selection (or none at all) is the complete profile.
 */
export interface CvSelection {
  experiences: Record<string, 'short' | 'hidden'>
  educations: Record<string, 'short' | 'hidden'>
  certificates: Record<string, 'hidden'>
  hiddenSections: string[]
}

export interface ApplicationEvent {
  id: string
  applicationId: string
  status: ApplicationStatus
  date: string
  title: string | null
  note: string | null
  createdAt: string
}

export interface ApplicationListItem {
  id: string
  jobTitle: string
  company: string
  location?: string | null
  status: ApplicationStatus
  appliedAt?: string | null
  followUpAt?: string | null
  isFollowUpDue: boolean
  coverLetterTitle?: string | null
  hasArchivedPdf: boolean
  /** The name the downloaded dossier gets (company and job title), as the server builds it. */
  dossierFileName?: string | null
  updatedAt: string
}

export interface Application {
  id: string
  jobTitle: string
  company: string
  location?: string | null
  contactPerson?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  jobPostingUrl?: string | null
  jobDescription?: string | null
  salaryExpectation?: string | null
  status: ApplicationStatus
  appliedAt?: string | null
  followUpAt?: string | null
  isFollowUpDue: boolean
  coverLetterId?: string | null
  coverLetterTitle?: string | null
  cvDesign: string
  cvAccentColor?: string | null
  cvFont?: string | null
  cvLanguage: 'de' | 'en'
  cvShowPhoto: boolean
  cvPhotoShape: 'round' | 'rounded' | 'rect'
  includeCoverSheet: boolean
  attachmentIds: string[]
  /** What the CV of this application leaves out; null or missing = the complete master profile. */
  cvSelection?: CvSelection | null
  hasArchivedPdf: boolean
  /** The name the downloaded dossier gets (company and job title), as the server builds it. */
  dossierFileName?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
  events: ApplicationEvent[]
  /** Only on the answer of an action that tried to freeze the dossier and could not ("archive.failed", "archive.attachments_unavailable"). */
  archiveWarning?: 'archive.failed' | 'archive.attachments_unavailable' | null
}

export interface Attachment {
  id: string
  title: string
  fileName: string
  category?: string | null
  contentType: string
  sizeBytes: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * The body of an edit (PUT) replaces the editable fields as a whole: send everything the form shows. Optional text fields left out are
 * cleared; so are `followUpAt` (the 14-day rule applies again) and `coverLetterId`. Left out = unchanged: `appliedAt` (a sent application
 * keeps its date; it can be corrected, not removed), `attachmentIds`, and the CV options (`cv*`, `includeCoverSheet`).
 * `cvDesign` is classic, modern or plain; `cvLanguage` de or en; `cvPhotoShape` round, rounded or rect; dates between 2000 and 2100.
 */
export interface ApplicationPayload {
  jobTitle: string
  company: string
  location?: string | null
  contactPerson?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  jobPostingUrl?: string | null
  jobDescription?: string | null
  salaryExpectation?: string | null
  status?: ApplicationStatus
  appliedAt?: string | null
  followUpAt?: string | null
  coverLetterId?: string | null
  cvDesign?: string
  cvAccentColor?: string
  cvFont?: string
  cvLanguage?: 'de' | 'en'
  cvShowPhoto?: boolean
  cvPhotoShape?: 'round' | 'rounded' | 'rect'
  includeCoverSheet?: boolean
  attachmentIds?: string[]
  /**
   * What the CV leaves out. The form always sends it: `{}` is "complete" and also clears an earlier selection on a change (a missing or
   * null value means "unchanged" there). Entries that are shown in full are left out, `full` is not a value.
   */
  cvSelection?: Partial<CvSelection>
  notes?: string | null
}

export type ContentStage = 'entry' | 'some' | 'long'

/** The suggestion of the server for what an application of this person should contain (`GET /api/applications/content-suggestion`). */
export interface ContentSuggestion {
  yearsOfExperience: number
  stage: ContentStage
  /** The answers of the guide page that shaped this suggestion, and its plan. Their shape is the server's business: not used here. */
  situation?: unknown
  plan?: unknown
  /** Every `reason` is a code of the server; an unknown one is shown as a general text. */
  experiences: { id: string; suggestion: CvLevel; reason: string; effective?: CvLevel; override?: CvLevel | null }[]
  educations: { id: string; suggestion: CvLevel; reason: string; effective?: CvLevel; override?: CvLevel | null }[]
  certificates: { id: string; suggestion: 'full' | 'hidden'; reason: string; effective?: 'full' | 'hidden'; override?: 'full' | 'hidden' | null }[]
  attachments: { id: string; suggestion: 'include' | 'omit'; reason: string }[]
  checklist: { key: string; state: 'ok' | 'missing' | 'optional' | 'not_needed' }[]
}

/** Which version of the dossier a preview shows: the filed snapshot ("archived") or a fresh render of the current state ("current"). */
export type DossierSource = 'archived' | 'current'

export interface DossierPreview {
  blob: Blob
  source: DossierSource
}

export interface ApplicationStatusUpdatePayload {
  status: ApplicationStatus
  date?: string | null
  note?: string | null
}

export interface ApplicationEventPayload {
  date?: string | null
  status?: ApplicationStatus
  title: string
  note?: string | null
}

export interface ApplicationStats {
  total: number
  draft: number
  applied: number
  acknowledged: number
  interview: number
  offer: number
  rejected: number
  withdrawn: number
  followUpsDue: number
}

// ==================== AI ASSISTANT TYPES ====================

export type AiProvider = 'copy_paste' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'lmstudio' | 'custom'

export type AiTask =
  | 'generate_cover_letter'
  | 'analyze_job'
  | 'generate_summary'
  | 'improve_bullet'
  | 'translate_content'

export interface AiConfig {
  provider: AiProvider
  model: string
  baseUrl: string | null
  hasApiKey: boolean
  pseudonymize: boolean
  /** The administrator set up an AI service for the whole server: direct generation works without an own key. */
  hasServerFallback?: boolean
  serverFallbackProvider?: string | null
}

/** The AI service of the whole server (administrators only); the key itself never comes back. */
export interface AdminAiConfig {
  enabled: boolean
  provider: AiProvider | null
  model: string | null
  baseUrl: string | null
  hasApiKey: boolean
}

export interface UpdateAdminAiConfigPayload {
  enabled: boolean
  provider: AiProvider
  model: string
  baseUrl: string | null
  /** Empty/absent = keep the stored key. */
  apiKey?: string | null
  /** Step-up: the administrator's current password (and 2FA code). */
  password?: string
  code?: string
}

export interface UpdateAiConfigPayload {
  provider?: AiProvider
  model?: string
  baseUrl?: string | null
  apiKey?: string | null
  pseudonymize?: boolean
}

export interface TestAiConnectionResult {
  success: boolean
  message: string | null
  /** Stable error code of a failed test, translated by the UI. */
  code?: string | null
}

export interface AiPromptPayload {
  task: AiTask
  jobTitle?: string | null
  company?: string | null
  jobDescription?: string | null
  recipientPerson?: string | null
  tone?: string | null
  language?: string | null
  inputText?: string | null
  coverLetterId?: string | null
}

export interface AiPromptResult {
  task: AiTask
  systemPrompt: string
  userPrompt: string
  fullCopyPasteText: string
  pseudonymized: boolean
}

export interface AiParsePayload {
  task: AiTask
  rawResponse: string
  pseudonymized: boolean
  language?: string | null
}

export interface AiCoverLetterResult {
  subject: string
  salutation: string
  opening: string
  body: string
  closing: string
  keyMatches?: string[]
}

export interface MatchedRequirement {
  requirement: string
  candidateMatch: string
}

export interface MissingRequirement {
  requirement: string
  suggestion: string
}

export interface AiJobAnalysisResult {
  matchScore: number
  summary: string
  matchedRequirements: MatchedRequirement[]
  missingRequirements: MissingRequirement[]
  tips: string[]
}

export interface AiSummaryResult {
  shortSummary: string
  bulletPoints: string[]
}

export interface AiImproveBulletResult {
  improved: string
  alternatives: string[]
  explanation: string
}

export interface TranslatedItem {
  key: string
  translation: string
}

export interface AiTranslateResult {
  translatedText: string
  items?: TranslatedItem[]
}

/** Where the user stands in working life, as answered in the guide (Ratgeber). */
export type GuideSituation = 'school' | 'training_or_studies' | 'working' | 'returning'
export type GuidePlanKind = 'same_field' | 'new_field' | 'first_job'
export type GuideExplain = 'gap' | 'parental_leave' | 'illness' | 'unemployment' | 'dropped_out' | 'frequent_changes'
export type GuideRegion = 'de' | 'uk' | 'us'

/** The answers of the guide's wizard, saved per account (`/api/profile/guide-answers`). */
export interface GuideAnswers {
  situation: GuideSituation
  /** Whole years in working life; null when the question does not apply (school, training, studies). */
  yearsOfExperience: number | null
  plan: GuidePlanKind
  /** Empty = nothing to explain. */
  explain: GuideExplain[]
  region: GuideRegion
}





