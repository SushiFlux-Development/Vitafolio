import { useIsFetching } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { findHintTargets, isMainPath, screenOf, useHintScreenOverride } from './hints'
import type { HintScreen } from './hints'
import { isIntroDone, isScreenSeen, markIntroDone, markScreenSeen, RESTART_EVENT } from './storage'

/** The introduction waits this long after the page appeared, so a window that opens right at the start gets there first. */
const INTRO_DELAY_MS = 700
/** How often the page is checked for the controls of a screen whose hints are due, and for how long. */
const POLL_MS = 400
const POLL_TRIES = 30

/**
 * True when a dialog of the app (or the system) owns the screen: any modal element that does not belong to the helper itself.
 * Our own dialogs all carry aria-modal, so this covers confirmations, errors, "What's new", the update window and the question about
 * a local copy of unsaved input alike, without each of them having to announce itself.
 */
export function hasForeignModal(): boolean {
  return [...document.querySelectorAll('[aria-modal="true"]')].some((element) => !element.hasAttribute('data-live-helper') && !element.querySelector('[data-live-helper]'))
}

function useForeignModal(): boolean {
  const [open, setOpen] = useState(hasForeignModal)
  useEffect(() => {
    const check = () => setOpen(hasForeignModal())
    check()
    // Dialogs are portals into the body: a change in the tree is the moment one comes or goes (also while it fades out).
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return open
}

export interface LiveHelper {
  /** The screen being shown, or null when it has no hints. */
  screen: HintScreen | null
  introOpen: boolean
  hintsOpen: boolean
  startIntro: () => void
  /** Closes the introduction (finished or skipped) and remembers that it was seen. */
  finishIntro: () => void
  closeHints: () => void
  /** The "?" button: the hints of this screen again; the introduction where the screen has none. */
  help: () => void
}

/**
 * The state of the live helper. Opens the introduction by itself once, the hints of a screen by themselves on its first visit,
 * and keeps both away while something else owns the screen. Place it in the frame of the signed-in app, never around the
 * sign-in, the setup or an error page.
 */
export function useLiveHelper(): LiveHelper {
  const location = useLocation()
  const override = useHintScreenOverride()
  const screen = screenOf(location.pathname, location.search, override)
  const eligible = isMainPath(location.pathname)

  const foreignModal = useForeignModal()
  // The notes of a new version ask the server first and open a moment later: until the answer is in, the helper stays back.
  const whatsNewPending = useIsFetching({ queryKey: ['whats-new'] }) > 0
  const blocked = foreignModal || whatsNewPending

  const [introDone, setIntroDone] = useState(isIntroDone)
  const [introOpen, setIntroOpen] = useState(false)
  // The screen whose hints are being shown, or null. They belong to that screen: leaving it ends them.
  const [hintsFor, setHintsFor] = useState<HintScreen | null>(null)
  if (hintsFor !== null && hintsFor !== screen) setHintsFor(null)
  const hintsOpen = hintsFor !== null
  const screenRef = useRef(screen)
  useEffect(() => {
    screenRef.current = screen
  })

  const startIntro = useCallback(() => {
    setHintsFor(null)
    setIntroOpen(true)
  }, [])

  const finishIntro = useCallback(() => {
    markIntroDone()
    setIntroDone(true)
    setIntroOpen(false)
    // The introduction covered the basics of this screen; its own hints wait for the next visit (or the "?" button).
    if (screenRef.current) markScreenSeen(screenRef.current)
  }, [])

  // The settings restart everything: the flags are gone, the introduction opens right away.
  useEffect(() => {
    const onRestart = () => {
      setIntroDone(false)
      startIntro()
    }
    window.addEventListener(RESTART_EVENT, onRestart)
    return () => window.removeEventListener(RESTART_EVENT, onRestart)
  }, [startIntro])

  // The introduction by itself, once: on the first main page that is shown and not covered by something else.
  useEffect(() => {
    if (introOpen || introDone || blocked || !eligible) return
    const timer = window.setTimeout(() => {
      if (!isIntroDone()) setIntroOpen(true)
    }, INTRO_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [introOpen, introDone, blocked, eligible, location.pathname])

  // The hints of a screen by themselves on its first visit: once the same controls are on the page on two checks in a row (the page
  // is done loading), so a tour does not start with half of its controls.
  const waiting = !screen || !eligible || !introDone || introOpen || blocked || hintsOpen
  useEffect(() => {
    if (waiting || !screen || isScreenSeen(screen)) return
    let tries = 0
    let previous = ''
    const timer = window.setInterval(() => {
      tries += 1
      const found = findHintTargets(screen).map((hint) => hint.target).join(',')
      if (found !== '' && found === previous) {
        window.clearInterval(timer)
        markScreenSeen(screen)
        setHintsFor(screen)
      } else if (tries >= POLL_TRIES) {
        window.clearInterval(timer)
      }
      previous = found
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [screen, waiting])

  const help = useCallback(() => {
    const current = screenRef.current
    if (current && findHintTargets(current).length > 0) {
      markScreenSeen(current)
      setHintsFor(current)
    } else {
      startIntro()
    }
  }, [startIntro])

  const closeHints = useCallback(() => setHintsFor(null), [])

  return { screen, introOpen, hintsOpen: hintsOpen && !introOpen && !blocked, startIntro, finishIntro, closeHints, help }
}
