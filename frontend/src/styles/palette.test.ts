import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '..')
const css = readFileSync(resolve(import.meta.dirname, 'index.css'), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

/**
 * Files that may use fixed colours on purpose: the crash console is a self-contained diagnostic tool that must stay legible when the
 * theme itself is what broke; the navy brand panel (sign-in side, welcome banner) is part of the brand in both themes, like the logo
 * plate, and so is the credit line on it (Brand.tsx: lighter green on the dark panel, and the two wordmark images swapped by theme).
 */
const FIXED_COLOUR_FILES = new Set(['components/ErrorBoundary.tsx', 'components/layout/AuthLayout.tsx', 'pages/OverviewPage.tsx', 'components/ui/Brand.tsx'])

const FILES = sourceFiles(SRC)
  .map((path) => ({ file: relative(SRC, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }))
  .filter(({ file }) => !FIXED_COLOUR_FILES.has(file))

const UTILITIES = '(?:bg|text|border|ring|ring-offset|divide|placeholder|fill|stroke|from|via|to|outline|accent|caret|decoration|shadow)'
const PALETTE = '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)'
/** Tokens that existed only in the imagination of earlier code: they produced no CSS at all, so the element silently had no colour. */
const MISSING_TOKENS = 'primary|canvas|canvas-subtle|success|success-strong|warning|warning-strong|border'

function offences(pattern: RegExp): string[] {
  return FILES.flatMap(({ file, text }) => [...text.matchAll(pattern)].map((match) => `${file}: ${match[0]}`))
}

describe('colours come from the design tokens', () => {
  it('uses no raw palette colour (bg-blue-500, text-neutral-600 ...)', () => {
    expect(offences(new RegExp(`\\b${UTILITIES}-${PALETTE}-\\d{2,3}(?:/\\d+)?\\b`, 'g'))).toEqual([])
  })

  it('uses no white/black utility and no hard-coded hex colour in a class', () => {
    expect(offences(new RegExp(`\\b${UTILITIES}-(?:white|black)\\b`, 'g'))).toEqual([])
    expect(offences(new RegExp(`\\b${UTILITIES}-\\[#[0-9a-fA-F]{3,8}\\]`, 'g'))).toEqual([])
  })

  it('has no dark: variants (the tokens already switch with the theme)', () => {
    expect(offences(/\bdark:[a-z[]/g)).toEqual([])
  })

  it('uses no token that does not exist', () => {
    expect(offences(new RegExp(`\\b${UTILITIES}-(?:${MISSING_TOKENS})(?![\\w-])`, 'g'))).toEqual([])
    expect(offences(/\bbtn-primary\b/g)).toEqual([])
  })

  it('only uses badge, notice and button classes that exist in the stylesheet', () => {
    const used = new Set(FILES.flatMap(({ text }) => [...text.matchAll(/\b(?:badge|notice|btn)-[a-z]+(?:-[a-z]+)*/g)].map((match) => match[0])))
    // Classes built from a name (badge-${tone}) are checked by their possible values below.
    const dynamic = ['badge-neutral', 'badge-info', 'badge-highlight', 'badge-success', 'badge-danger']
    // notice-gap, notice-footer, notice-icon are CSS variables of the notice box, not classes.
    const variables = new Set(['notice-gap', 'notice-footer', 'notice-icon', 'notice-pad-x'])
    const missing = [...used, ...dynamic].filter((name) => !variables.has(name) && !new RegExp(`\\.${name}(?![\\w-])`).test(css))
    expect(missing).toEqual([])
  })
})
