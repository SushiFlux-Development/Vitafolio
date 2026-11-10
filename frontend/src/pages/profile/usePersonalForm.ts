import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { profileApi } from '../../api/endpoints'
import type { PersonalDataPayload, Profile } from '../../api/types'
import { useOptionalAppState } from '../../auth/AppState'
import { draftKey } from '../../hooks/draftStore'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useAutoSave } from '../../hooks/useAutoSave'
import type { AutoSaveSnapshot } from '../../hooks/useAutoSave'
import { useRestoreDraft } from '../../hooks/useRestoreDraft'
import { acceptPersonal, isPersonalSendable, normalizePersonal, personalFingerprint, personalFormOf, personalIssues, withPersonalFields } from './personalForm'
import type { PersonalIssues } from './personalForm'

/** Everything the personal-data form and the pages around it need; the page that owns the profile creates it once. */
export interface PersonalForm {
  /** What is on the screen. The server's answer never replaces it. */
  value: PersonalDataPayload
  /** A field was typed into (or an assistant filled it). */
  change: (changes: Partial<PersonalDataPayload>) => void
  state: AutoSaveSnapshot<PersonalDataPayload>
  issues: PersonalIssues
  /** Sends the newest state at once; true when the server has everything afterwards. */
  flush: () => Promise<boolean>
  /** When input from the local copy was put back, until the next change. */
  restoredAt: number | null
  /** The profile was replaced as a whole (import): start over from the server's data. */
  adopt: (profile: Profile) => void
  /**
   * Changes only when the photo is uploaded or removed - not with every save. The address of the picture carries it, so the
   * picture is loaded again exactly then.
   */
  photoVersion: string
  photoChanged: () => void
}

/**
 * The personal data of the master profile as a form that saves by itself (see useAutoSave). The state lives with the profile
 * page, not with the tab, so the typing survives a change of section or view and a save in the background is never cut off.
 * `settled`: the profile on the screen is the server's current one (no reload running); only then a local copy is compared with it.
 */
export function usePersonalForm(profile: Profile, settled = true): PersonalForm {
  const queryClient = useQueryClient()
  const { format } = useDateFormat()
  const accountId = useOptionalAppState()?.session.user?.id
  const fingerprint = personalFingerprint(profile)
  // The personal fields of the server as the typing is based on them: from the profile at the start, then from our own answers.
  const serverFingerprint = useRef(fingerprint)
  // What the profile in the cache looked like at the last look, and every state that came from our own saves: only a change
  // that is not ours (another device) may replace the form. Our own answers arrive in the cache a moment after the form
  // reports the save, so "not the same as the last answer" is not enough to tell them apart.
  const seenFingerprint = useRef(fingerprint)
  const ownFingerprints = useRef(new Set<string>())
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  const [photoVersion, setPhotoVersion] = useState(profile.updatedAt)

  const autosave = useAutoSave<PersonalDataPayload, Profile>({
    initial: personalFormOf(profile),
    // The values go out as typed - the server trims, the screen keeps the blank behind a word the user is about to continue.
    save: (value, { keepalive }) => (keepalive ? profileApi.update(value, { keepalive }) : profileApi.update(value)),
    isSendable: isPersonalSendable,
    onSaved: (answer) => {
      serverFingerprint.current = personalFingerprint(answer)
      ownFingerprints.current.add(serverFingerprint.current)
      // The answer is the server's truth: it goes into the cache (only the personal fields, the lists there may be newer).
      queryClient.setQueryData<Profile>(['profile'], (cached) => withPersonalFields(cached, answer))
    },
    draft: { accountId, form: 'personal', base: () => serverFingerprint.current },
  })

  const { setValue, reset, peek } = autosave
  const change = useCallback(
    (changes: Partial<PersonalDataPayload>) => {
      setRestoredAt(null)
      setValue({ ...peek(), ...changes })
    },
    [setValue, peek],
  )

  // Another device changed the personal data: an untouched form follows, a form with input keeps it (it is the newer will).
  const clean = !autosave.state.changed && autosave.state.phase === 'clean'
  useEffect(() => {
    if (fingerprint === seenFingerprint.current) return
    seenFingerprint.current = fingerprint
    if (ownFingerprints.current.has(fingerprint)) return
    serverFingerprint.current = fingerprint
    if (clean) reset(personalFormOf(profile))
  }, [fingerprint, clean, profile, reset])

  useRestoreDraft<PersonalDataPayload>({
    key: accountId ? draftKey(accountId, 'personal') : null,
    ready: settled,
    accept: acceptPersonal,
    server: { value: personalFormOf(profile), base: fingerprint },
    normalize: normalizePersonal,
    onRestore: (value, savedAt) => {
      setValue(value)
      setRestoredAt(savedAt)
    },
  })

  const adopt = useCallback(
    (imported: Profile) => {
      serverFingerprint.current = personalFingerprint(imported)
      ownFingerprints.current.add(serverFingerprint.current)
      setRestoredAt(null)
      reset(personalFormOf(imported))
    },
    [reset],
  )

  const photoChanged = useCallback(() => setPhotoVersion(String(Date.now())), [])

  return {
    value: autosave.value,
    change,
    state: autosave.state,
    issues: personalIssues(autosave.value, format),
    flush: autosave.flush,
    restoredAt,
    adopt,
    photoVersion,
    photoChanged,
  }
}
