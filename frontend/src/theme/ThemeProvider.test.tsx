import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isThemePreference, ThemeProvider, useTheme } from './ThemeProvider'

function systemSays(theme: 'light' | 'dark') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: theme === 'dark' && query.includes('dark'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('the theme', () => {
  it('knows only light and dark', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('system')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })

  it.each(['light', 'dark'] as const)('lets the system decide the very first start once (%s) and keeps that', (system) => {
    systemSays(system)
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.preference).toBe(system)
    expect(document.documentElement.getAttribute('data-theme')).toBe(system)
    expect(localStorage.getItem('cv.theme')).toBe(system)
  })

  it('does not follow the system afterwards: the stored choice holds', () => {
    localStorage.setItem('cv.theme', 'light')
    systemSays('dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.preference).toBe('light')
  })

  it('turns a stored "system" into what it meant at this moment', () => {
    localStorage.setItem('cv.theme', 'system')
    systemSays('dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.preference).toBe('dark')
    expect(localStorage.getItem('cv.theme')).toBe('dark')
  })

  it('applies a choice at once and remembers it', () => {
    systemSays('light')
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setPreference('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('cv.theme')).toBe('dark')
  })
})
