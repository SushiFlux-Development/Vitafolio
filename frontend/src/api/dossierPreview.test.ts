import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { applicationsApi, DOSSIER_SOURCE_HEADER, dossierSourceFrom } from './endpoints'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const pdf = (source?: string) =>
  new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf', ...(source ? { [DOSSIER_SOURCE_HEADER]: source } : {}) } })

describe('dossierSourceFrom', () => {
  it('reads the version of the answer and treats anything else as a fresh render', () => {
    expect(dossierSourceFrom(new Headers({ [DOSSIER_SOURCE_HEADER]: 'archived' }))).toBe('archived')
    expect(dossierSourceFrom(new Headers({ [DOSSIER_SOURCE_HEADER]: ' Archived ' }))).toBe('archived')
    expect(dossierSourceFrom(new Headers({ [DOSSIER_SOURCE_HEADER]: 'current' }))).toBe('current')
    expect(dossierSourceFrom(new Headers({ [DOSSIER_SOURCE_HEADER]: 'surprise' }))).toBe('current')
    expect(dossierSourceFrom(new Headers())).toBe('current')
  })
})

describe('applicationsApi.getPreview', () => {
  it('returns the PDF together with the version the server says it is', async () => {
    fetchMock.mockResolvedValue(pdf('archived'))

    const preview = await applicationsApi.getPreview('app-1')

    expect(preview.source).toBe('archived')
    expect(await preview.blob.text()).toBe('%PDF-1.7')
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/applications/app-1/dossier/preview')
  })

  it('asks for the current state explicitly and passes the abort signal on', async () => {
    fetchMock.mockResolvedValue(pdf('current'))
    const controller = new AbortController()

    const preview = await applicationsApi.getPreview('a/b', { version: 'current', signal: controller.signal })

    expect(preview.source).toBe('current')
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/applications/a%2Fb/dossier/preview?version=current')
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('does not hide a lost archive: the 409 reaches the caller with its code', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 409, code: 'archive.missing', detail: 'The archived dossier of this application is no longer available.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const error = await applicationsApi.getPreview('app-1').catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('archive.missing')
    expect((error as ApiError).status).toBe(409)
  })
})
