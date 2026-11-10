import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { applicationsApi, DOSSIERS_FAILED_HEADER, dossiersFailedFrom } from './endpoints'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const zip = (headers: Record<string, string> = {}) =>
  new Response('PK', { status: 200, headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Bewerbungen_2026-11-09.zip"', ...headers } })

describe('dossiersFailedFrom', () => {
  it('reads the count and treats anything else as none', () => {
    expect(dossiersFailedFrom(new Headers({ [DOSSIERS_FAILED_HEADER]: '2' }))).toBe(2)
    expect(dossiersFailedFrom(new Headers({ [DOSSIERS_FAILED_HEADER]: ' 12 ' }))).toBe(12)
    expect(dossiersFailedFrom(new Headers({ [DOSSIERS_FAILED_HEADER]: '0' }))).toBe(0)
    expect(dossiersFailedFrom(new Headers({ [DOSSIERS_FAILED_HEADER]: '-3' }))).toBe(0)
    expect(dossiersFailedFrom(new Headers({ [DOSSIERS_FAILED_HEADER]: 'many' }))).toBe(0)
    expect(dossiersFailedFrom(new Headers())).toBe(0)
  })
})

describe('applicationsApi.downloadDossierArchive', () => {
  it('posts the ids and the language and returns the ZIP with the name the server proposed and the number of missing dossiers', async () => {
    fetchMock.mockResolvedValue(zip({ [DOSSIERS_FAILED_HEADER]: '1' }))

    const result = await applicationsApi.downloadDossierArchive(['a', 'b'], 'en')

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('/api/applications/dossiers/archive')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['a', 'b'], language: 'en' })
    expect(result.filename).toBe('Bewerbungen_2026-11-09.zip')
    expect(result.failed).toBe(1)
    expect(await result.blob.text()).toBe('PK')
  })

  it('has no missing dossiers without the header and falls back to a name of its own', async () => {
    fetchMock.mockResolvedValue(new Response('PK', { status: 200 }))

    const result = await applicationsApi.downloadDossierArchive(['a', 'b'], 'de')

    expect(result.failed).toBe(0)
    expect(result.filename).toBe('Bewerbungen.zip')
  })

  it('throws the server error with its code, so the error dialog can say what happened', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 400, code: 'dossiers.too_many', detail: 'At most 100' }), { status: 400, headers: { 'Content-Type': 'application/problem+json' } })),
    )

    await expect(applicationsApi.downloadDossierArchive(['a'], 'de')).rejects.toMatchObject({ status: 400, code: 'dossiers.too_many' })
    await expect(applicationsApi.downloadDossierArchive(['a'], 'de')).rejects.toBeInstanceOf(ApiError)
  })
})
