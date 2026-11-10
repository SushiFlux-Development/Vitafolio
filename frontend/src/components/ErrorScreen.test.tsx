import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import '../i18n'
import { ErrorScreen, errorKindOf } from './ErrorScreen'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>

function show(error: ApiError) {
  render(wrap(
    <MemoryRouter>
      <ErrorScreen kind={errorKindOf(error)} error={error} />
    </MemoryRouter>),
  )
  return screen.getByTestId('error-figure').textContent
}

describe('ErrorScreen figure', () => {
  it.each([502, 503, 504])('shows the real status %i', (status) => {
    expect(show(new ApiError(status))).toBe(String(status))
    // 503 has its own wording without a number; 502/504 fall back to the generic text naming the status
    if (status !== 503) expect(screen.getByTestId('error-notice').textContent).toContain(String(status))
  })

  it('shows a word, not an invented number, when the server did not answer', () => {
    expect(show(new ApiError(0))).toBe('Offline')
  })

  it('keeps the own number on the /error/503 route', () => {
    render(
      <MemoryRouter initialEntries={['/error/503']}>
        <Routes>
          <Route path="/error/:kind" element={<ErrorScreen kind="503" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('error-figure').textContent).toBe('503')
  })
})
