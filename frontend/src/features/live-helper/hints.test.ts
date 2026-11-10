import { afterEach, describe, expect, it, vi } from 'vitest'
import de from '../../i18n/locales/de.json'
import en from '../../i18n/locales/en.json'
import { findHintTargets, HINTS, isMainPath, screenOf } from './hints'
import type { HintScreen } from './hints'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('which screen an address shows', () => {
  it.each([
    ['/', '', null, 'overview'],
    ['/profile', '', null, 'profile'],
    ['/profile', '?tab=skills', null, 'profile'],
    ['/profile', '?tab=experiences', null, 'experiences'],
    ['/profile', '?tab=preview', null, 'preview'],
    ['/cover-letters', '', null, 'coverLetters'],
    ['/cover-letters', '', 'coverLetterEditor', 'coverLetterEditor'],
    ['/applications', '', null, 'applications'],
    ['/export', '', null, 'export'],
    ['/export', '?tab=applications', null, 'export'],
    // The CV tab is the preview of the master profile and has its hints.
    ['/export', '?tab=cv', null, 'preview'],
    ['/settings', '?tab=about', null, 'settings'],
    ['/guide', '', null, 'guide'],
    ['/guide', '?view=overview&tab=long', null, 'guideOverview'],
  ] as const)('%s%s is %s', (path, search, override, screen) => {
    expect(screenOf(path, search, override)).toBe(screen)
  })

  it('has no hints for the assistant view of the profile, the questions of the guide, the administration and unknown addresses', () => {
    expect(screenOf('/profile', '?view=wizard', null)).toBeNull()
    expect(screenOf('/guide', '?view=wizard', null)).toBeNull()
    expect(screenOf('/admin', '', null)).toBeNull()
    expect(screenOf('/error/404', '', null)).toBeNull()
  })

  it('opens the introduction only on the pages of the app', () => {
    for (const path of ['/', '/profile', '/cover-letters', '/applications', '/export', '/guide', '/settings', '/admin']) expect(isMainPath(path)).toBe(true)
    for (const path of ['/login', '/setup', '/error/503', '/nonsense']) expect(isMainPath(path)).toBe(false)
  })
})

describe('the hints', () => {
  const screens = Object.keys(HINTS) as HintScreen[]

  it('have a title and a text in German and in English', () => {
    for (const locale of [de, en]) {
      const texts = locale.liveHelper.hints as unknown as Record<string, { title?: string; text?: string }>
      for (const hint of screens.flatMap((screen) => HINTS[screen])) {
        expect(texts[hint.id]?.title, hint.id).toBeTruthy()
        expect(texts[hint.id]?.text, hint.id).toBeTruthy()
      }
    }
  })

  it('point at each control once per screen', () => {
    for (const screen of screens) {
      const targets = HINTS[screen].map((hint) => hint.target)
      expect(new Set(targets).size, screen).toBe(targets.length)
    }
  })

  function control(target: string, size: { width: number; height: number }) {
    const element = document.createElement('div')
    element.setAttribute('data-hint', target)
    element.getBoundingClientRect = () => ({ ...size, x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height, toJSON: () => ({}) })
    document.body.appendChild(element)
  }

  it('skip a control that is not on the page, instead of pointing at nothing', () => {
    control('applications-new', { width: 120, height: 36 })
    control('applications-views', { width: 200, height: 36 })
    expect(findHintTargets('applications').map((hint) => hint.id)).toEqual(['applicationsNew', 'applicationsViews'])
  })

  it('skip a control that has no size (hidden)', () => {
    control('applications-new', { width: 120, height: 36 })
    control('applications-board', { width: 0, height: 0 })
    expect(findHintTargets('applications').map((hint) => hint.id)).toEqual(['applicationsNew'])
  })

  it('keep the order of the list, not the order of the page', () => {
    control('applications-board', { width: 300, height: 300 })
    control('applications-new', { width: 120, height: 36 })
    expect(findHintTargets('applications').map((hint) => hint.id)).toEqual(['applicationsNew', 'applicationsBoard'])
  })

  it('the guide entry is skipped when the navigation does not have it', () => {
    control('nav-profile', { width: 200, height: 36 })
    expect(findHintTargets('overview').map((hint) => hint.id)).toEqual(['navProfile'])
  })
})
