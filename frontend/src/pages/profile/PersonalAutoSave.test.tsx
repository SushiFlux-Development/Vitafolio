import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { profileApi } from '../../api/endpoints'
import type { PersonalDataPayload, Profile } from '../../api/types'
import { draftKey, readDraft, writeDraft } from '../../hooks/draftStore'
import { personalFingerprint, personalFormOf } from './personalForm'
import { mockProfile, renderPage, settle } from './profileTestSupport'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const personalCopy = () => readDraft(draftKey('u1', 'personal'), (raw) => raw as PersonalDataPayload)

describe('the personal data saves by itself', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(profileApi, 'get').mockResolvedValue(mockProfile)
  })
  afterEach(() => localStorage.clear())

  it('sends at once on Enter', async () => {
    const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
    renderPage()
    const city = await screen.findByLabelText('Ort')
    await userEvent.type(city, ' Mitte')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    expect(updateSpy.mock.calls[0]?.[0]).toMatchObject({ city: 'Berlin Mitte' })
  })

  it('keeps the blank behind a word while the server answers with the trimmed text', async () => {
    // The server trims every text; the answer must not take the blank from somebody who is about to type the next word.
    const updateSpy = vi.spyOn(profileApi, 'update').mockImplementation(async (body) => ({ ...mockProfile, ...body, city: String(body.city).trim() }))
    renderPage()
    const city = await screen.findByLabelText('Ort')
    await userEvent.clear(city)
    await userEvent.type(city, 'Bad ')
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    await settle()
    expect(city).toHaveValue('Bad ')

    await userEvent.type(city, 'Homburg')
    expect(city).toHaveValue('Bad Homburg')
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2))
    expect(updateSpy.mock.calls[1]?.[0]).toMatchObject({ city: 'Bad Homburg' })
  })

  it('puts the answer into the cache without reloading the profile, and the photo address stays', async () => {
    const withPhoto = { ...mockProfile, hasPhoto: true }
    const getSpy = vi.spyOn(profileApi, 'get').mockResolvedValue(withPhoto)
    vi.spyOn(profileApi, 'update').mockResolvedValue({ ...withPhoto, city: 'Hamburg', updatedAt: '2026-11-09T10:00:00Z' })
    const { queryClient } = renderPage()
    const photo = await screen.findByRole('img', { name: 'Max Mustermann' })
    const address = photo.getAttribute('src')
    expect(address).toBe('/api/profile/photo?v=2026-01-01T00:00:00Z')

    const city = screen.getByLabelText('Ort')
    await userEvent.clear(city)
    await userEvent.type(city, 'Hamburg')
    await waitFor(() => expect(queryClient.getQueryData<Profile>(['profile'])?.city).toBe('Hamburg'))
    await settle()

    // Saved without a second request for the profile, and the picture is not loaded again
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData<Profile>(['profile'])?.experiences).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Max Mustermann' })).toHaveAttribute('src', address!)
  })

  it('names what is missing in a new profile, keeps the fields calm, and sends nothing until both names are there', async () => {
    const fresh = { ...mockProfile, firstName: '', lastName: '', email: null, dateOfBirth: null }
    vi.spyOn(profileApi, 'get').mockResolvedValue(fresh)
    const updateSpy = vi.spyOn(profileApi, 'update').mockImplementation(async (body) => ({ ...fresh, ...body }))
    renderPage('personal', { account: true })
    const street = await screen.findByLabelText('Straße und Hausnummer')

    expect(screen.getByRole('status')).toHaveTextContent('Noch nicht gespeichert: Vorname und Nachname fehlen')
    expect(screen.getByLabelText('Vorname')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Nachname')).not.toHaveAttribute('aria-invalid', 'true')

    await userEvent.clear(street)
    await userEvent.type(street, 'Hauptstr. 5')
    await userEvent.type(screen.getByLabelText('Vorname'), 'Erika')
    await settle()
    expect(updateSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Noch nicht gespeichert: Der Nachname fehlt')
    // Nothing is lost meanwhile: the local copy holds it all
    expect(personalCopy()?.value).toMatchObject({ firstName: 'Erika', street: 'Hauptstr. 5' })

    await userEvent.type(screen.getByLabelText('Nachname'), 'Muster')
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    expect(updateSpy.mock.calls[0]?.[0]).toMatchObject({ firstName: 'Erika', lastName: 'Muster', street: 'Hauptstr. 5' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Gespeichert'))
  })

  describe('when saving fails', () => {
    it('keeps the input, says so in the status without a dialog, and offers the complete error', async () => {
      const failing = new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank gesperrt', traceId: 'abc123' })
      const updateSpy = vi.spyOn(profileApi, 'update').mockRejectedValue(failing)
      renderPage('personal', { account: true })
      const city = await screen.findByLabelText('Ort')
      await userEvent.clear(city)
      await userEvent.type(city, 'Kiel')

      await waitFor(() => expect(updateSpy).toHaveBeenCalled())
      expect(await screen.findByText(/Nicht gespeichert, neuer Versuch läuft/)).toBeInTheDocument()
      // No dialog jumps up while typing
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(city).toHaveValue('Kiel')
      // Everything typed is in the local copy
      expect(personalCopy()?.value.city).toBe('Kiel')

      // The error is one click away, complete and copyable
      await userEvent.click(screen.getByRole('button', { name: 'Fehler anzeigen' }))
      const dialog = await screen.findByRole('alertdialog')
      expect(dialog).toHaveTextContent('Datenbank gesperrt')
      expect(dialog).toHaveTextContent('abc123')
      expect(within(dialog).getByRole('button', { name: /Kopieren/ })).toBeInTheDocument()
    })

    it('removes the local copy once the server has the state', async () => {
      const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
      renderPage('personal', { account: true })
      const city = await screen.findByLabelText('Ort')
      await userEvent.type(city, 'x')
      expect(personalCopy()?.value.city).toBe('Berlinx')
      await waitFor(() => expect(updateSpy).toHaveBeenCalled())
      await waitFor(() => expect(personalCopy()).toBeNull())
    })

    it('says when the server refused the values, and does not open a dialog', async () => {
      const refused = new ApiError(400, { status: 400, code: 'validation.failed', errors: { city: [{ code: 'validation.max_length', params: { max: 128 } }] } })
      const updateSpy = vi.spyOn(profileApi, 'update').mockRejectedValue(refused)
      renderPage()
      const city = await screen.findByLabelText('Ort')
      await userEvent.type(city, 'x')
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nicht gespeichert: Der Server lehnt die Eingabe ab'))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      // The answer of the server about the field stands at the field, and goes with the next edit
      expect(screen.getByText('Zu lang: höchstens 128 Zeichen.')).toBeInTheDocument()
      expect(city).toHaveAttribute('aria-invalid', 'true')
      // The same values are not sent again
      await settle()
      expect(updateSpy).toHaveBeenCalledTimes(1)

      await userEvent.type(city, 'y')
      expect(screen.queryByText('Zu lang: höchstens 128 Zeichen.')).toBeNull()
    })
  })

  describe('the local copy of earlier input', () => {
    const copyOf = (changes: Partial<PersonalDataPayload>, base: string) =>
      writeDraft(draftKey('u1', 'personal'), { value: { ...personalFormOf(mockProfile), ...changes }, savedAt: Date.UTC(2026, 10, 9, 8, 30), base })

    it('takes the input over and saves it when the server has not changed since', async () => {
      const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
      copyOf({ city: 'Lübeck' }, personalFingerprint(mockProfile))
      renderPage('personal', { account: true })

      expect(await screen.findByLabelText('Ort')).toHaveValue('Lübeck')
      expect(screen.getByRole('status')).toHaveTextContent(/Eingaben vom .* wiederhergestellt/)
      await waitFor(() => expect(updateSpy).toHaveBeenCalled())
      expect(updateSpy.mock.calls[0]?.[0]).toMatchObject({ city: 'Lübeck' })
    })

    it('asks with the own dialog when the server changed meanwhile, and takes the input on "übernehmen"', async () => {
      const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
      copyOf({ city: 'Lübeck' }, 'an-older-state')
      renderPage('personal', { account: true })

      const dialog = await screen.findByRole('alertdialog')
      expect(dialog).toHaveTextContent(/Eingaben vom .* übernehmen\?/)
      expect(screen.getByLabelText('Ort')).toHaveValue('Berlin')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Meine Eingaben übernehmen' }))

      await waitFor(() => expect(screen.getByLabelText('Ort')).toHaveValue('Lübeck'))
      await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    })

    it('drops the copy on "Serverstand behalten"', async () => {
      const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
      copyOf({ city: 'Lübeck' }, 'an-older-state')
      renderPage('personal', { account: true })

      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Serverstand behalten' }))
      await waitFor(() => expect(personalCopy()).toBeNull())
      expect(screen.getByLabelText('Ort')).toHaveValue('Berlin')
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it.each([
      ['Esc', () => userEvent.keyboard('{Escape}')],
      ['a click beside the dialog', () => fireEvent.mouseDown(screen.getByRole('alertdialog').parentElement!)],
    ])('keeps the copy on %s, shows the server state and asks again at the next opening', async (_name, close) => {
      const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
      copyOf({ city: 'Lübeck' }, 'an-older-state')
      const first = renderPage('personal', { account: true })

      await screen.findByRole('alertdialog')
      await close()
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(screen.getByLabelText('Ort')).toHaveValue('Berlin')
      expect(personalCopy()?.value.city).toBe('Lübeck')
      expect(updateSpy).not.toHaveBeenCalled()

      first.unmount()
      renderPage('personal', { account: true })
      expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Eingaben vom .* übernehmen?/)
    })

    it('replaces the kept copy when the user types after closing the question without an answer', async () => {
      vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
      copyOf({ city: 'Lübeck' }, 'an-older-state')
      renderPage('personal', { account: true })
      await screen.findByRole('alertdialog')
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

      await userEvent.type(screen.getByLabelText('Ort'), 'x')
      expect(personalCopy()?.value.city).toBe('Berlinx')
    })

    it('removes a copy the server already has, without a question', async () => {
      copyOf({ city: 'Berlin ' }, 'an-older-state')
      renderPage('personal', { account: true })
      await screen.findByLabelText('Ort')
      await waitFor(() => expect(personalCopy()).toBeNull())
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
  })
})
