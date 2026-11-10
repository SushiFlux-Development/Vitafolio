import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { profileApi } from '../../api/endpoints'
import { mockProfile, renderPage, settle } from './profileTestSupport'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(profileApi, 'get').mockResolvedValue(mockProfile)
  })

  it('renders all sections in the sidebar and the personal info', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Stammprofil' })).toBeInTheDocument()
    })

    // No tab bar on the page any more: the nine sections are the sidebar's sub-navigation, "Zurück" leads out of it
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    const sections = await screen.findByRole('navigation', { name: 'Bereiche des Stammprofils' })
    const names = within(sections)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(names).toEqual([
      'Persönliches',
      'Berufserfahrung',
      'Ausbildung, Studium & Schule',
      'Kenntnisse',
      'Sprachen',
      'Zertifikate',
      'Interessen & Aktivitäten',
      'Eigene Abschnitte',
      'Vorschau & Export',
    ])
    expect(screen.getByTestId('sidebar-back')).toHaveTextContent('Zurück')
    // The open section is marked like the open page in the main navigation, and only that one
    expect(within(sections).getByRole('link', { name: 'Persönliches' })).toHaveAttribute('aria-current', 'page')
    expect(within(sections).getAllByRole('link').filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1)
    // Every section is a real address, so a reload and a link keep working
    expect(within(sections).getByRole('link', { name: 'Berufserfahrung' })).toHaveAttribute('href', '/profile?tab=experiences')

    // Form values
    expect(screen.getByLabelText('Vorname')).toHaveValue('Max')
    expect(screen.getByLabelText('Nachname')).toHaveValue('Mustermann')
    expect(screen.getByLabelText('Berufsbezeichnung / Untertitel')).toHaveValue('Senior Architekt')
  })

  it('saves the personal data by itself after typing, without a save button', async () => {
    const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue({
      ...mockProfile,
      firstName: 'Maximilian',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Vorname')).toHaveValue('Max')
    })
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Gespeichert')

    const firstNameInput = screen.getByLabelText('Vorname')
    await userEvent.clear(firstNameInput)
    await userEvent.type(firstNameInput, 'Maximilian')
    expect(updateSpy).not.toHaveBeenCalled() // not yet: the quiet period has not passed

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    // One request with the end result, not one per key
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy.mock.calls[0]?.[0]).toMatchObject({
      firstName: 'Maximilian',
      lastName: 'Mustermann',
    })
  })

  it('renders experiences tab with existing station', async () => {
    renderPage('experiences')

    await waitFor(() => {
      expect(screen.getByText('Senior Software Engineer')).toBeInTheDocument()
      expect(screen.getByText('bei Tech GmbH')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Station hinzufügen' })).toBeInTheDocument()
  })

  it('shows the periods of the stations and educations in the chosen date format, not as stored', async () => {
    const { unmount } = renderPage('experiences')
    expect(await screen.findByText(/^01.2022 – /)).toBeInTheDocument()
    expect(screen.queryByText(/2022-01/)).toBeNull()
    unmount()
    renderPage('educations')
    expect(await screen.findByText('10.2016 – 09.2019')).toBeInTheDocument()
    expect(screen.queryByText(/2016-10/)).toBeNull()
  })

  it('shows the birth date in the date format, and saves what was typed as ISO text', async () => {
    const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
    renderPage()
    const birth = await screen.findByLabelText('Geburtsdatum')
    expect(birth).toHaveValue('01.01.1990')

    await userEvent.clear(birth)
    await userEvent.type(birth, '23041990')
    expect(birth).toHaveValue('23.04.1990')

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy.mock.calls.at(-1)?.[0]).toMatchObject({ dateOfBirth: '1990-04-23' })
    // The answer (here with the old date) does not push anything back into the field
    await settle()
    expect(birth).toHaveValue('23.04.1990')
  })

  it('sends nothing while the birth date is unfinished or does not exist; unfinished is not red, a day that does not exist is', async () => {
    const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
    renderPage()
    const birth = await screen.findByLabelText('Geburtsdatum')

    await userEvent.clear(birth)
    await userEvent.type(birth, '2304')
    await settle()
    expect(updateSpy).not.toHaveBeenCalled()
    // Unfinished: calm, but the status says that something is not saved yet
    expect(birth).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Noch nicht gespeichert: Eingabe unvollständig')

    // Enter counts as a submit attempt: every problem is marked
    await userEvent.keyboard('{Enter}')
    expect(birth).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Bitte als TT.MM.JJJJ angeben, z. B. 23.04.1990.')).toBeInTheDocument()
    expect(updateSpy).not.toHaveBeenCalled()

    await userEvent.type(birth, '1990')
    await userEvent.clear(birth)
    await userEvent.type(birth, '31021990')
    expect(screen.getByText('Diesen Tag gibt es im Kalender nicht.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Noch nicht gespeichert: Markierte Felder korrigieren')
    await settle()
    expect(updateSpy).not.toHaveBeenCalled()

    // A real date goes out
    await userEvent.clear(birth)
    await userEvent.type(birth, '23041990')
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
  })

  it('saves a station with the months typed as digits, as ISO months', async () => {
    const addSpy = vi.spyOn(profileApi, 'addExperience').mockResolvedValue(mockProfile.experiences[0]!)
    renderPage('experiences')
    await userEvent.click(await screen.findByRole('button', { name: 'Station hinzufügen' }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.type(within(dialog).getByLabelText('Position / Berufsbezeichnung'), 'Entwickler')
    await userEvent.type(within(dialog).getByLabelText('Arbeitgeber / Unternehmen'), 'Firma')
    await userEvent.type(within(dialog).getByLabelText('Beginn (Monat/Jahr)'), '032020')
    // A bare year is a year, not a month and a cut-off year.
    await userEvent.type(within(dialog).getByLabelText('Ende (Monat/Jahr)'), '2023')
    expect(within(dialog).getByLabelText('Beginn (Monat/Jahr)')).toHaveValue('03.2020')
    expect(within(dialog).getByLabelText('Ende (Monat/Jahr)')).toHaveValue('2023')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(addSpy).toHaveBeenCalled())
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ startDate: '2020-03', endDate: '2023' })
  })

  it('does not save a station whose start month is only half typed', async () => {
    const addSpy = vi.spyOn(profileApi, 'addExperience').mockResolvedValue(mockProfile.experiences[0]!)
    renderPage('experiences')
    await userEvent.click(await screen.findByRole('button', { name: 'Station hinzufügen' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Position / Berufsbezeichnung'), 'Entwickler')
    await userEvent.type(within(dialog).getByLabelText('Arbeitgeber / Unternehmen'), 'Firma')
    await userEvent.type(within(dialog).getByLabelText('Beginn (Monat/Jahr)'), '03')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(addSpy).not.toHaveBeenCalled()
    expect(within(dialog).getByLabelText('Beginn (Monat/Jahr)')).toHaveAttribute('aria-invalid', 'true')
  })

  describe('education period (school: the year of graduation is enough)', () => {
    const open = async () => {
      renderPage('educations')
      await userEvent.click(await screen.findByRole('button', { name: 'Ausbildung hinzufügen' }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText('Abschluss / Titel'), 'Abitur')
      await userEvent.type(within(dialog).getByLabelText('Einrichtung / Schule / Hochschule'), 'Gymnasium')
      return dialog
    }

    it('saves an education with only the end, the beginning going out as empty text', async () => {
      const addSpy = vi.spyOn(profileApi, 'addEducation').mockResolvedValue(mockProfile.educations[0]!)
      const dialog = await open()

      // The hint tells that the year of graduation is enough, and the beginning is no longer marked as required
      expect(within(dialog).getByText('Beginn oder Ende genügt. Bei der Schule reicht das Abschlussjahr.')).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Beginn')).not.toBeRequired()
      await userEvent.type(within(dialog).getByLabelText('Ende'), '2009')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))

      await waitFor(() => expect(addSpy).toHaveBeenCalled())
      expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ startDate: '', endDate: '2009', isCurrent: false })
    })

    it('saves an education with only a beginning, and a running one without any date', async () => {
      const addSpy = vi.spyOn(profileApi, 'addEducation').mockResolvedValue(mockProfile.educations[0]!)
      const dialog = await open()
      await userEvent.type(within(dialog).getByLabelText('Beginn'), '2005')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
      await waitFor(() => expect(addSpy).toHaveBeenCalledTimes(1))
      expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ startDate: '2005', endDate: null })
    })

    it('says what is missing at once when beginning and end are both empty, and lets "ongoing" fix it', async () => {
      const addSpy = vi.spyOn(profileApi, 'addEducation').mockResolvedValue(mockProfile.educations[0]!)
      const dialog = await open()
      const start = within(dialog).getByLabelText('Beginn')
      const message = 'Bitte Beginn oder Ende angeben oder „Laufende Ausbildung“ einschalten. Bei der Schule genügt das Abschlussjahr.'

      // Nothing typed yet: only the calm hint
      expect(within(dialog).queryByText(message)).toBeNull()

      // Typing and deleting again in a date field is live feedback, before any save
      await userEvent.type(start, '2')
      await userEvent.clear(start)
      expect(within(dialog).getByText(message)).toBeInTheDocument()
      expect(start).toHaveAttribute('aria-invalid', 'true')

      await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
      expect(addSpy).not.toHaveBeenCalled()

      await userEvent.click(within(dialog).getByRole('switch', { name: 'Laufende Ausbildung' }))
      expect(within(dialog).queryByText(message)).toBeNull()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
      await waitFor(() => expect(addSpy).toHaveBeenCalled())
      expect(addSpy.mock.calls[0]?.[0]).toMatchObject({ startDate: '', isCurrent: true })
    })

    it('shows the end alone as one date in the list, and "laufend" for a running one without a beginning', async () => {
      const school = { ...mockProfile.educations[0]!, id: 'school', degree: 'Abitur', startDate: '', endDate: '2009-06', isCurrent: false }
      const running = { ...mockProfile.educations[0]!, id: 'running', degree: 'Studium', startDate: '', endDate: null, isCurrent: true }
      vi.spyOn(profileApi, 'get').mockResolvedValue({ ...mockProfile, educations: [school, running] })
      renderPage('educations')

      expect(await screen.findByText('06.2009')).toBeInTheDocument()
      expect(screen.getByText('laufend')).toBeInTheDocument()
      expect(screen.queryByText(/–/)).toBeNull()
    })
  })

  it('renders skills tab with grouped skill', async () => {
    renderPage('skills')

    await waitFor(() => {
      expect(screen.getByText('TypeScript')).toBeInTheDocument()
      expect(screen.getByText('Programmiersprachen')).toBeInTheDocument()
    })
  })

  it('renders preview tab when selected', async () => {
    vi.spyOn(profileApi, 'getPreviewPdf').mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-pdf')
    global.URL.revokeObjectURL = vi.fn()

    renderPage('preview')

    await waitFor(() => {
      expect(screen.getByText('Lebenslauf-Vorschau')).toBeInTheDocument()
      expect(screen.getByText('Klassisch')).toBeInTheDocument()
      expect(screen.getByTestId('design-gallery-toggle')).toBeInTheDocument()
    })
  })

  it('keeps what was typed in the personal data when the tab is switched and back, and sends it on leaving', async () => {
    const updateSpy = vi.spyOn(profileApi, 'update').mockImplementation(async (body) => ({ ...mockProfile, ...body }))
    renderPage()
    const firstName = await screen.findByLabelText('Vorname')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Maximilian')

    await userEvent.click(await screen.findByRole('link', { name: /Berufserfahrung/ }))
    expect(await screen.findByText('Senior Software Engineer')).toBeInTheDocument()
    // Leaving the section sends at once; nobody has to wait for the quiet period
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('link', { name: /Persönliches/ }))

    expect(await screen.findByLabelText('Vorname')).toHaveValue('Maximilian')
    expect(screen.getByRole('status')).toHaveTextContent('Gespeichert')
  })

  it('switches the section from the sidebar, marks the open one and shows its content', async () => {
    renderPage()
    const sections = await screen.findByRole('navigation', { name: 'Bereiche des Stammprofils' })
    expect(await screen.findByLabelText('Vorname')).toBeInTheDocument()

    await userEvent.click(within(sections).getByRole('link', { name: 'Berufserfahrung' }))
    expect(await screen.findByText('Senior Software Engineer')).toBeInTheDocument()
    expect(screen.queryByLabelText('Vorname')).toBeNull()
    expect(within(sections).getByRole('link', { name: 'Berufserfahrung' })).toHaveAttribute('aria-current', 'page')
    expect(within(sections).getByRole('link', { name: 'Persönliches' })).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('profile-content')).toBeInTheDocument()
  })

  it('keeps assistant mode and JSON Resume in the page header; a section in the sidebar leaves the assistant mode', async () => {
    renderPage()
    const sections = await screen.findByRole('navigation', { name: 'Bereiche des Stammprofils' })
    await userEvent.click(await screen.findByRole('button', { name: 'Assistenten-Modus' }))
    expect(await screen.findByRole('list', { name: /Assistent/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JSON Resume' })).toBeInTheDocument()
    // In assistant mode none of the nine sections is the open one
    expect(within(sections).getAllByRole('link').filter((link) => link.hasAttribute('aria-current'))).toHaveLength(0)

    await userEvent.click(within(sections).getByRole('link', { name: 'Sprachen' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: /Assistent/ })).toBeNull())
    expect(within(sections).getByRole('link', { name: 'Sprachen' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('Englisch')).toBeInTheDocument()
  })

  it('shows a wrong e-mail address while typing and sends nothing until it is right', async () => {
    const updateSpy = vi.spyOn(profileApi, 'update').mockResolvedValue(mockProfile)
    renderPage()
    const email = await screen.findByLabelText('E-Mail-Adresse')
    await userEvent.clear(email)
    await userEvent.type(email, 'max mustermann')
    expect(screen.getByText(/Bitte eine gültige E-Mail-Adresse eingeben/)).toBeInTheDocument()
    await settle()
    expect(updateSpy).not.toHaveBeenCalled()

    await userEvent.clear(email)
    await userEvent.type(email, 'max@example.com')
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy.mock.calls.at(-1)?.[0]).toMatchObject({ email: 'max@example.com' })
  })

  it('names every edit and delete button after its entry', async () => {
    renderPage('experiences')
    expect(await screen.findByRole('button', { name: 'Station bearbeiten: Senior Software Engineer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Station löschen: Senior Software Engineer' })).toBeInTheDocument()
  })

  it('checks the station form while typing, keeps the end date field when the position is current, and does not close on a click beside it', async () => {
    const addSpy = vi.spyOn(profileApi, 'addExperience')
    renderPage('experiences')
    await userEvent.click(await screen.findByRole('button', { name: 'Station hinzufügen' }))
    const dialog = await screen.findByRole('dialog')

    // Digits only: the separator appears by itself, and a month that cannot exist is named at once (in the notation of the German interface).
    const start = within(dialog).getByLabelText('Beginn (Monat/Jahr)')
    await userEvent.type(start, '03')
    expect(start).toHaveValue('03.')
    expect(within(dialog).queryByText(/Bitte als MM\.JJJJ angeben/)).toBeNull()
    await userEvent.clear(start)
    await userEvent.type(start, '00')
    expect(within(dialog).getByText(/Bitte als MM\.JJJJ angeben/)).toBeInTheDocument()

    // "current position" disables the end date; the field stays where it is.
    const end = within(dialog).getByLabelText('Ende (Monat/Jahr)')
    expect(end).toBeEnabled()
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Aktuelle Position (bis heute)' }))
    expect(within(dialog).getByLabelText('Ende (Monat/Jahr)')).toBeDisabled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(addSpy).not.toHaveBeenCalled()
    // Both required text fields (position, employer) now show their problem.
    expect(within(dialog).getAllByText('Bitte ausfüllen.')).toHaveLength(2)

    fireEvent.mouseDown(dialog.parentElement!)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('offers the gap with months in the chosen date format', async () => {
    renderPage('experiences')
    await userEvent.click(await screen.findByRole('button', { name: /Details & Tipps anzeigen/ }))
    expect(screen.getByText(/10\.2019 – 12\.2021/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '+ Berufliche Neuorientierung' }))
    const dialog = await screen.findByRole('dialog')
    // The form holds ISO months; the fields show them in the notation of the interface language.
    expect(within(dialog).getByLabelText('Beginn (Monat/Jahr)')).toHaveValue('10.2019')
    expect(within(dialog).getByLabelText('Ende (Monat/Jahr)')).toHaveValue('12.2021')
    expect(within(dialog).getByLabelText('Position / Berufsbezeichnung')).toHaveValue('Berufliche Neuorientierung')
    expect(within(dialog).getByLabelText('Arbeitgeber / Unternehmen')).toHaveValue('Selbststudium / Orientierung')
    // No blank "()" and no error on a field that was filled in correctly.
    expect(within(dialog).queryByText('Bitte als MM.JJJJ angeben, z. B. 03.2024 (oder nur das Jahr).')).toBeNull()
  })

  it('writes the gap entry in the interface language', async () => {
    await i18n.changeLanguage('en')
    try {
      renderPage('experiences')
      await userEvent.click(await screen.findByRole('button', { name: /Show details & tips/ }))
      await userEvent.click(screen.getByRole('button', { name: '+ Career reorientation' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByLabelText('Employer / Company')).toHaveValue('Self-study / orientation')
    } finally {
      await i18n.changeLanguage('de')
    }
  })
})
