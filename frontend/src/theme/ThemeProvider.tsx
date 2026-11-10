import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ThemePreference } from '../api/types'

/** What is shown is always one of the two themes. */
export type ResolvedTheme = ThemePreference

const STORAGE_KEY = 'cv.theme'

interface ThemeContextValue {
  /** The theme the user chose (light or dark; there is no "follow the system" choice). */
  preference: ThemePreference
  /** What is shown right now: the same as the choice. */
  resolved: ResolvedTheme
  /** Applies a theme and remembers it in this browser (the account copy is saved by useAppearance). */
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark'
}

/** The system's own setting; it only decides the very first start. */
function systemTheme(): ThemePreference {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function remember(theme: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked; the choice then only lasts for this page load.
  }
}

/**
 * The theme to start with: the stored choice. At the very first start (nothing stored) the system's setting decides once, and a
 * "system" stored by an earlier version is turned into what it meant at this moment. Either way the result is stored, so from then on
 * the choice stays and no longer follows the system.
 */
function startTheme(): ThemePreference {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Blocked storage: the system decides, on every load.
  }
  if (isThemePreference(stored)) return stored
  const decided = systemTheme()
  remember(decided)
  return decided
}

/** Light or dark; the result lands on <html data-theme>, which the design tokens key off. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(startTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', preference)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    remember(next)
  }, [])

  const value = useMemo(() => ({ preference, resolved: preference, setPreference }), [preference, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme needs <ThemeProvider> above it')
  return context
}
