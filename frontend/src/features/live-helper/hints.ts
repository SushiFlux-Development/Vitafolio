import { useEffect, useSyncExternalStore } from 'react'

/**
 * The screens that have hints. A screen is a page of the app, or a distinct view of one (the preview tab of the profile, the
 * editor of a cover letter). Each shows its hints by itself on the first visit.
 */
export type HintScreen = 'overview' | 'guide' | 'guideOverview' | 'profile' | 'experiences' | 'preview' | 'coverLetters' | 'coverLetterEditor' | 'applications' | 'export' | 'settings'

export interface HintDefinition {
  /** Value of the data-hint attribute on the real control. */
  target: string
  /** The texts are liveHelper.hints.<id>.title and .text. */
  id: string
}

/**
 * The hints of every screen, in the order they are shown. A control that is not on the page right now (no gaps to report, an
 * empty list, a page that is not built yet) is skipped, so a hint never points at nothing. A new main control gets its hint here and
 * its data-hint attribute in the same change.
 */
export const HINTS: Record<HintScreen, readonly HintDefinition[]> = {
  overview: [
    { target: 'overview-actions', id: 'overviewActions' },
    { target: 'overview-next', id: 'overviewNext' },
    { target: 'overview-board', id: 'overviewBoard' },
    { target: 'nav-profile', id: 'navProfile' },
    { target: 'nav-export', id: 'navExport' },
    { target: 'nav-guide', id: 'navGuide' },
    { target: 'shell-ai', id: 'shellAi' },
    { target: 'shell-handbook', id: 'shellHandbook' },
    { target: 'shell-help', id: 'shellHelp' },
    { target: 'shell-collapse', id: 'shellCollapse' },
  ],
  guide: [
    { target: 'guide-start', id: 'guideStart' },
    { target: 'guide-answers', id: 'guideAnswers' },
    { target: 'guide-plan', id: 'guidePlan' },
    { target: 'guide-change', id: 'guideChange' },
    { target: 'guide-overview', id: 'guideOverviewButton' },
  ],
  guideOverview: [
    { target: 'guide-situations', id: 'guideSituations' },
    { target: 'guide-plan', id: 'guideSituationPlan' },
    { target: 'guide-legend', id: 'guideLegend' },
  ],
  profile: [
    { target: 'sidebar-sections', id: 'profileSections' },
    { target: 'profile-autosave', id: 'profileAutosave' },
    { target: 'profile-assistant', id: 'profileAssistant' },
    { target: 'profile-ai', id: 'profileAi' },
  ],
  experiences: [
    { target: 'experiences-add', id: 'experiencesAdd' },
    { target: 'profile-gaps', id: 'profileGaps' },
  ],
  preview: [
    { target: 'preview-design', id: 'previewDesign' },
    { target: 'preview-color', id: 'previewColor' },
    { target: 'preview-font', id: 'previewFont' },
    { target: 'preview-export', id: 'previewExport' },
    { target: 'preview-pane', id: 'previewPane' },
  ],
  coverLetters: [
    { target: 'letters-new', id: 'lettersNew' },
    { target: 'letters-list', id: 'lettersList' },
  ],
  coverLetterEditor: [
    { target: 'letter-tabs', id: 'letterTabs' },
    { target: 'letter-autosave', id: 'letterAutosave' },
    { target: 'letter-ai', id: 'letterAi' },
    { target: 'letter-export', id: 'letterExport' },
  ],
  applications: [
    { target: 'applications-new', id: 'applicationsNew' },
    { target: 'applications-attachments', id: 'applicationsAttachments' },
    { target: 'applications-views', id: 'applicationsViews' },
    { target: 'applications-board', id: 'applicationsBoard' },
  ],
  export: [
    { target: 'export-tabs', id: 'exportTabs' },
    { target: 'export-bulk', id: 'exportBulk' },
    { target: 'export-list', id: 'exportList' },
  ],
  settings: [
    { target: 'settings-tabs', id: 'settingsTabs' },
    { target: 'settings-helper', id: 'settingsHelper' },
  ],
}

/** The pages of the signed-in app; the introduction only opens on one of them (never on an error page). */
const MAIN_PATHS: readonly string[] = ['/', '/profile', '/cover-letters', '/applications', '/export', '/guide', '/settings', '/admin']

export function isMainPath(pathname: string): boolean {
  return MAIN_PATHS.includes(pathname)
}

/** Which screen an address shows, or null for a page without hints (and for views the user is in the middle of, like the assistant). */
export function screenOf(pathname: string, search: string, override: HintScreen | null): HintScreen | null {
  if (override) return override
  const params = new URLSearchParams(search)
  switch (pathname) {
    case '/':
      return 'overview'
    case '/profile': {
      if (params.get('view') === 'wizard') return null
      const tab = params.get('tab')
      return tab === 'preview' ? 'preview' : tab === 'experiences' ? 'experiences' : 'profile'
    }
    case '/guide': {
      // The questions themselves are a flow the user is in the middle of: no hints there
      const view = params.get('view')
      return view === 'wizard' ? null : view === 'overview' ? 'guideOverview' : 'guide'
    }
    case '/cover-letters':
      return 'coverLetters'
    case '/applications':
      return 'applications'
    // The CV tab is the preview of the master profile, so it has the same hints.
    case '/export':
      return params.get('tab') === 'cv' ? 'preview' : 'export'
    case '/settings':
      return 'settings'
    default:
      return null
  }
}

/** The element a hint points at, if it is on the page now. */
export function hintElement(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-hint="${target}"]`)
}

/** The hints of a screen whose control is on the page right now (it has a size, so it is really shown). */
export function findHintTargets(screen: HintScreen): HintDefinition[] {
  return HINTS[screen].filter((hint) => {
    const element = hintElement(hint.target)
    if (!element) return false
    const box = element.getBoundingClientRect()
    return box.width > 0 && box.height > 0
  })
}

// ---- a page can name its own view ---------------------------------------------------------------------------------------------
// One address can show two different views (the list of cover letters, one letter in the editor). The page says which one is
// open; the helper reads it like it reads the address.

let override: HintScreen | null = null
const listeners = new Set<() => void>()

function setOverride(next: HintScreen | null): void {
  if (override === next) return
  override = next
  listeners.forEach((listener) => listener())
}

export function useHintScreenOverride(): HintScreen | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => override,
    () => null,
  )
}

/** Called by a page that shows a distinct view: the helper then uses this screen instead of the one the address names. */
export function useHintScreen(screen: HintScreen): void {
  useEffect(() => {
    setOverride(screen)
    return () => setOverride(null)
  }, [screen])
}
