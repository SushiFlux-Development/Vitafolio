import { describe, expect, it } from 'vitest'
import type { Rules } from '../api/types'
import {
  aiHostCheck,
  DAY_OPTIONAL,
  FOLLOW_UP_DAY,
  hexColorCheck,
  MONTH_OPTIONAL,
  MONTH_REQUIRED,
  dateCheck,
  displayNameCheck,
  emailCheck,
  integerCheck,
  isLoginCodeComplete,
  isStoredDateValid,
  isTotpCodeComplete,
  isValid,
  jsonObjectCheck,
  loginCodeCheck,
  normalizeSetupToken,
  passwordCheck,
  repeatCheck,
  required,
  requiredField,
  setupTokenCheck,
  totpCheck,
  urlCheck,
  userNameCheck,
} from './rules'

const live = { settled: false }
const settled = { settled: true }
const rules: Rules = {
  username: { minLength: 3, maxLength: 32, pattern: '^[A-Za-z0-9._-]+$' },
  displayName: { minLength: 1, maxLength: 64 },
  password: { minLength: 12, maxLength: 128 },
}

describe('password', () => {
  const check = passwordCheck(rules.password)

  it('is required, and too short while typing with the live count', () => {
    expect(check('', live)?.key).toBe('rules.password.required')
    expect(check('short', live)).toEqual({ key: 'rules.password.tooShort', values: { length: 5, min: 12 } })
    expect(check('long enough pass', live)).toBeUndefined()
  })

  it('is too long above the server limit', () => {
    expect(check('x'.repeat(129), live)?.key).toBe('rules.password.tooLong')
  })

  it('only asks for something until the policy is known', () => {
    expect(passwordCheck(undefined)('a', live)).toBeUndefined()
    expect(passwordCheck(undefined)('', live)?.key).toBe('rules.password.required')
  })

  it('lists every message it can show so the room can be reserved', () => {
    expect(check.problems.map((problem) => problem.key)).toEqual(['rules.password.required', 'rules.password.tooShort', 'rules.password.tooLong'])
  })
})

describe('aiHost', () => {
  it('takes names and addresses and refuses what is clearly a whole URL', () => {
    expect(aiHostCheck('ollama.lan', live)).toBeUndefined()
    expect(aiHostCheck('192.168.1.20', live)).toBeUndefined()
    expect(aiHostCheck('::1', live)).toBeUndefined()
    expect(aiHostCheck('', live)?.key).toBe('rules.aiHost.required')
    expect(aiHostCheck('http://ollama.lan/v1', live)?.key).toBe('rules.aiHost.invalid')
    expect(aiHostCheck('ollama lan', live)?.key).toBe('rules.aiHost.invalid')
  })
})

describe('repeat', () => {
  const check = repeatCheck('secret password')

  it('treats an unfinished beginning as work in progress, not as an error', () => {
    expect(check('secret', live)).toBeUndefined()
    expect(check('secret', settled)?.key).toBe('rules.password.mismatch')
  })

  it('flags a repeat that can no longer become the password at once', () => {
    expect(check('sx', live)?.key).toBe('rules.password.mismatch')
  })

  it('accepts the same password and asks for it when empty', () => {
    expect(check('secret password', settled)).toBeUndefined()
    expect(check('', live)?.key).toBe('rules.password.repeatRequired')
  })
})

describe('username and display name', () => {
  const check = userNameCheck(rules.username)

  it('reports a forbidden character before the length', () => {
    expect(check('a b', live)?.key).toBe('rules.userName.characters')
  })

  it('checks the length with the typed count, trimmed like the server', () => {
    expect(check('ab', live)).toEqual({ key: 'rules.userName.tooShort', values: { length: 2, min: 3 } })
    expect(check('  abc  ', live)).toBeUndefined()
    expect(check('a'.repeat(33), live)?.key).toBe('rules.userName.tooLong')
  })

  it('survives a pattern the browser cannot compile instead of throwing while typing', () => {
    expect(() => userNameCheck({ ...rules.username, pattern: '([' })('abc', live)).not.toThrow()
  })

  it('checks the display name length', () => {
    const name = displayNameCheck(rules.displayName)
    expect(name('', live)?.key).toBe('rules.displayName.required')
    expect(name('x'.repeat(65), live)?.key).toBe('rules.displayName.tooLong')
    expect(name('Ada', live)).toBeUndefined()
  })
})

describe('codes', () => {
  it('treats an unfinished authenticator code as fine but a wrong character or too many digits as a problem', () => {
    expect(totpCheck('123', live)).toBeUndefined()
    expect(totpCheck('12a', live)?.key).toBe('rules.totp.digitsOnly')
    expect(totpCheck('1234567', live)?.key).toBe('rules.totp.length')
    expect(totpCheck('123 456', live)).toBeUndefined()
  })

  it('only counts a complete code as sendable', () => {
    expect(isTotpCodeComplete('123456')).toBe(true)
    expect(isTotpCodeComplete('123 456')).toBe(true)
    expect(isTotpCodeComplete('12345')).toBe(false)
    expect(isTotpCodeComplete('12345a')).toBe(false)
  })

  it('accepts an app code or a recovery code at sign-in', () => {
    expect(loginCodeCheck('1234567', live)?.key).toBe('rules.totp.length')
    expect(loginCodeCheck('ab12-cd34-ef56', live)).toBeUndefined()
    expect(isLoginCodeComplete('123456')).toBe(true)
    expect(isLoginCodeComplete('12345')).toBe(false)
    expect(isLoginCodeComplete('abcd-efgh-ijkl')).toBe(true)
    expect(isLoginCodeComplete('')).toBe(false)
  })
})

describe('setup code', () => {
  it('is normalised to groups of four: any case, with or without dashes, spaces or underscores', () => {
    expect(normalizeSetupToken('abcd-efgh-jkmn-pqrs-tuvw-xyz2-3456')).toBe('ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456')
    expect(normalizeSetupToken('abcdefghjkmnpqrstuvwxyz23456')).toBe('ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456')
    expect(normalizeSetupToken(' abcd efgh_jkmn  pqrs tuvw xyz2 3456 ')).toBe('ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456')
    expect(normalizeSetupToken('abcd-ef')).toBe('ABCD-EF')
    expect(normalizeSetupToken('')).toBe('')
  })

  it('is required, and an unfinished code is no problem until the field is settled', () => {
    expect(setupTokenCheck('', live)?.key).toBe('rules.setupToken.required')
    expect(setupTokenCheck('ABCD-EF', live)).toBeUndefined()
    expect(setupTokenCheck('ABCD-EF', settled)?.key).toBe('rules.setupToken.incomplete')
    expect(setupTokenCheck('ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456', settled)).toBeUndefined()
    expect(setupTokenCheck('abcdefghjkmnpqrstuvwxyz23456', settled)).toBeUndefined()
    expect(setupTokenCheck('ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2', settled)?.key).toBe('rules.setupToken.incomplete')
  })

  it('flags a wrong character or a too long code at once', () => {
    expect(setupTokenCheck('ABCD-EF!H', live)?.key).toBe('rules.setupToken.characters')
    expect(setupTokenCheck('ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2-3456-Q', live)?.key).toBe('rules.setupToken.tooLong')
    // The alphabet has no look-alikes: 0, 1, I, L and O can never be part of the code.
    for (const wrong of ['ABCD-0000', 'ABCD-1111', 'ABCD-IIII', 'ABCD-LLLL', 'ABCD-OOOO']) expect(setupTokenCheck(wrong, live)?.key, wrong).toBe('rules.setupToken.characters')
  })

  it('lists every message it can show so the room can be reserved', () => {
    expect(setupTokenCheck.problems).toHaveLength(4)
  })
})

describe('helpers', () => {
  it('required trims', () => {
    expect(required('x')('   ', live)).toEqual({ key: 'x' })
    expect(required('x')(' a ', live)).toBeUndefined()
  })

  it('integerCheck takes whole numbers in range only', () => {
    const check = integerCheck('k', 5, 500)
    expect(isValid(check, '5')).toBe(true)
    expect(isValid(check, '500')).toBe(true)
    expect(isValid(check, '4')).toBe(false)
    expect(isValid(check, '501')).toBe(false)
    expect(isValid(check, '1.5')).toBe(false)
    expect(isValid(check, '')).toBe(false)
  })
})

describe('form rules of the profile and tracker', () => {
  it('requires a filled free-text field', () => {
    expect(requiredField('', live)).toEqual({ key: 'rules.field.required' })
    expect(requiredField('   ', live)).toEqual({ key: 'rules.field.required' })
    expect(requiredField('Kellner', live)).toBeUndefined()
  })

  it('accepts a month in the active notation or a year, and calls an unfinished start work in progress until settled', () => {
    const start = dateCheck(MONTH_REQUIRED, 'dmy')
    expect(start('03.2024', live)).toBeUndefined()
    expect(start('2024', live)).toBeUndefined()
    expect(start('', live)).toEqual({ key: 'rules.date.required.month.dmy' })
    // typing "03." or "0" is fine while typing, wrong once the field is left
    expect(start('03.', live)).toBeUndefined()
    expect(start('03.', settled)).toEqual({ key: 'rules.date.invalid.month.dmy' })
    // a wrong month or another notation is wrong at once
    expect(start('13.2024', live)).toEqual({ key: 'rules.date.invalid.month.dmy' })
    expect(start('00.2024', live)).toEqual({ key: 'rules.date.invalid.month.dmy' })
    expect(start('2024-03', live)).toEqual({ key: 'rules.date.invalid.month.dmy' })
    expect(start('Mai 2024', live)).toEqual({ key: 'rules.date.invalid.month.dmy' })
    // optional: empty is fine
    expect(dateCheck(MONTH_OPTIONAL, 'dmy')('', settled)).toBeUndefined()
  })

  it('says the same in the other two notations, each in its own', () => {
    expect(dateCheck(MONTH_REQUIRED, 'iso')('2024-03', live)).toBeUndefined()
    expect(dateCheck(MONTH_REQUIRED, 'iso')('2024-13', live)).toEqual({ key: 'rules.date.invalid.month.iso' })
    expect(dateCheck(MONTH_REQUIRED, 'iso')('', live)).toEqual({ key: 'rules.date.required.month.iso' })
    expect(dateCheck(MONTH_OPTIONAL, 'ymd_slash')('2024/03', live)).toBeUndefined()
    expect(dateCheck(MONTH_OPTIONAL, 'ymd_slash')('2024/1', settled)).toEqual({ key: 'rules.date.invalid.month.ymd_slash' })
    expect(dateCheck(DAY_OPTIONAL, 'ymd_slash')('1990/04/23', live)).toBeUndefined()
    expect(dateCheck(DAY_OPTIONAL, 'ymd_slash')('1990/13', live)).toEqual({ key: 'rules.date.invalid.day.ymd_slash' })
  })

  it('accepts only existing calendar days', () => {
    const day = dateCheck(DAY_OPTIONAL, 'dmy')
    expect(day('23.04.1990', live)).toBeUndefined()
    expect(day('', settled)).toBeUndefined()
    // the day the month does not have is wrong as soon as the month is known, before the year is typed
    expect(day('30.02.', live)).toEqual({ key: 'rules.date.nonexistent' })
    expect(day('30.02.1990', live)).toEqual({ key: 'rules.date.nonexistent' })
    expect(day('31.04.1990', live)).toEqual({ key: 'rules.date.nonexistent' })
    // 29 February: only in leap years (2000 is one, 1900 is not)
    expect(day('29.02.', live)).toBeUndefined()
    expect(day('29.02.2000', live)).toBeUndefined()
    expect(day('29.02.1900', live)).toEqual({ key: 'rules.date.nonexistent' })
    expect(day('32.01.1990', live)).toEqual({ key: 'rules.date.invalid.day.dmy' })
    expect(day('1990-04-23', live)).toEqual({ key: 'rules.date.invalid.day.dmy' })
    expect(day('23.04.', live)).toBeUndefined()
    expect(day('23.04.', settled)).toEqual({ key: 'rules.date.invalid.day.dmy' })
    expect(dateCheck(DAY_OPTIONAL, 'iso')('1990-02-30', live)).toEqual({ key: 'rules.date.nonexistent' })
  })

  it('accepts a follow-up day only as an existing day between 2000 and 2100, and empty', () => {
    const followUp = dateCheck(FOLLOW_UP_DAY, 'dmy')
    const range = { key: 'rules.date.range', values: { min: 2000, max: 2100 } }
    expect(followUp('30.11.2026', live)).toBeUndefined()
    expect(followUp('', settled)).toBeUndefined()
    expect(followUp('01.01.2000', live)).toBeUndefined()
    expect(followUp('31.12.2100', live)).toBeUndefined()
    expect(followUp('31.12.1999', live)).toEqual(range)
    expect(followUp('01.01.2101', live)).toEqual(range)
    expect(followUp('30.02.2026', live)).toEqual({ key: 'rules.date.nonexistent' })
    expect(followUp('2026-11-30', live)).toEqual({ key: 'rules.date.invalid.day.dmy' })
    // the beginning of a day is work in progress until the field is left
    expect(followUp('30.11.', live)).toBeUndefined()
    expect(followUp('30.11.', settled)).toEqual({ key: 'rules.date.invalid.day.dmy' })
    // a year that cannot reach the range any more is reported while it is typed
    expect(followUp('30.11.19', live)).toEqual(range)
    expect(followUp('30.11.20', live)).toBeUndefined()
    expect(followUp('30.11.22', live)).toEqual(range)
    // in a year-first notation the year comes first, so the very first digit already decides
    expect(dateCheck(FOLLOW_UP_DAY, 'iso')('1', live)).toEqual(range)
    expect(dateCheck(FOLLOW_UP_DAY, 'iso')('2', live)).toBeUndefined()
  })

  it('judges the value a form stores in a format-free way: ISO text of an existing date, or empty where allowed', () => {
    expect(isStoredDateValid(MONTH_REQUIRED, '2024-03')).toBe(true)
    expect(isStoredDateValid(MONTH_REQUIRED, '2024')).toBe(true)
    expect(isStoredDateValid(MONTH_REQUIRED, '')).toBe(false)
    expect(isStoredDateValid(MONTH_OPTIONAL, '')).toBe(true)
    // half typed, wrong, or an old value that fits no pattern: not usable, and never silently dropped
    expect(isStoredDateValid(MONTH_OPTIONAL, '03.')).toBe(false)
    expect(isStoredDateValid(MONTH_OPTIONAL, '2024-13')).toBe(false)
    expect(isStoredDateValid(MONTH_OPTIONAL, 'Q3 2024')).toBe(false)
    expect(isStoredDateValid(DAY_OPTIONAL, '1990-04-23')).toBe(true)
    expect(isStoredDateValid(DAY_OPTIONAL, '1990-02-30')).toBe(false)
    expect(isStoredDateValid(DAY_OPTIONAL, '1990-04')).toBe(false)
    expect(isStoredDateValid(FOLLOW_UP_DAY, '2026-11-30')).toBe(true)
    expect(isStoredDateValid(FOLLOW_UP_DAY, '1999-12-31')).toBe(false)
    expect(isStoredDateValid(FOLLOW_UP_DAY, '')).toBe(true)
  })

  it('accepts only http(s) links and lets the beginning of one pass while typing', () => {
    expect(urlCheck('https://example.com/in/max', live)).toBeUndefined()
    expect(urlCheck('http://example.com', live)).toBeUndefined()
    expect(urlCheck('', settled)).toBeUndefined()
    expect(urlCheck('htt', live)).toBeUndefined()
    expect(urlCheck('https://', live)).toBeUndefined()
    expect(urlCheck('htt', settled)).toEqual({ key: 'rules.url.invalid' })
    expect(urlCheck('ftp://example.com', live)).toEqual({ key: 'rules.url.invalid' })
    expect(urlCheck('javascript:alert(1)', live)).toEqual({ key: 'rules.url.invalid' })
    expect(urlCheck('https://exa mple.com', live)).toEqual({ key: 'rules.url.invalid' })
  })

  it('accepts an e-mail address leniently; a blank or a second @ is wrong at once, a missing part once settled', () => {
    expect(emailCheck('max@example.com', live)).toBeUndefined()
    expect(emailCheck('', settled)).toBeUndefined()
    expect(emailCheck('max@', live)).toBeUndefined()
    expect(emailCheck('max@', settled)).toEqual({ key: 'rules.email.invalid' })
    expect(emailCheck('max mustermann@example.com', live)).toEqual({ key: 'rules.email.invalid' })
    expect(emailCheck('a@b@c', live)).toEqual({ key: 'rules.email.invalid' })
  })

  it('reads pasted JSON as an object, but only complains once the field is settled', () => {
    expect(jsonObjectCheck('{"basics":{}}', settled)).toBeUndefined()
    expect(jsonObjectCheck('{"basics":', live)).toBeUndefined()
    expect(jsonObjectCheck('{"basics":', settled)).toEqual({ key: 'rules.json.invalid' })
    expect(jsonObjectCheck('[1,2]', settled)).toEqual({ key: 'rules.json.invalid' })
    expect(jsonObjectCheck('42', settled)).toEqual({ key: 'rules.json.invalid' })
    expect(jsonObjectCheck('', settled)).toBeUndefined()
  })

  it('lists every message a rule can give, so the room under the field can be reserved', () => {
    expect(dateCheck(MONTH_REQUIRED, 'dmy').problems.map((problem) => problem.key)).toEqual(['rules.date.required.month.dmy', 'rules.date.invalid.month.dmy'])
    expect(dateCheck(FOLLOW_UP_DAY, 'iso').problems.map((problem) => problem.key)).toEqual(['rules.date.invalid.day.iso', 'rules.date.nonexistent', 'rules.date.range'])
    expect(isValid(urlCheck, 'https://example.com')).toBe(true)
    expect(isValid(urlCheck, 'example.com')).toBe(false)
  })
})

describe('hexColorCheck', () => {
  it('is calm while a colour is on its way and flags it once the field is left', () => {
    for (const unfinished of ['#', '#1', '#14', '#14213', '#14213D8']) {
      expect(hexColorCheck(unfinished, live), unfinished).toBeUndefined()
      expect(hexColorCheck(unfinished, settled)?.key, unfinished).toBe('rules.color.incomplete')
    }
  })

  it('accepts exactly what the server accepts, with or without the hash, any case, with blanks around', () => {
    for (const ok of ['#abc', '#ABCD', '#14213D', '#14213d80', '14213D', ' #14213D ', 'abc']) {
      expect(hexColorCheck(ok, settled), ok).toBeUndefined()
    }
  })

  it('flags a character that cannot be part of a colour at once, with the live count for a too long one', () => {
    expect(hexColorCheck('#14g', live)?.key).toBe('rules.color.characters')
    expect(hexColorCheck('red', live)?.key).toBe('rules.color.characters')
    expect(hexColorCheck('#14213D; x', live)?.key).toBe('rules.color.characters')
    expect(hexColorCheck('#14213D801', live)).toEqual({ key: 'rules.color.tooLong', values: { length: 9, max: 8 } })
  })

  it('asks for a colour when the field is empty and lists every problem so their room can be reserved', () => {
    expect(hexColorCheck('', live)?.key).toBe('rules.color.required')
    expect(hexColorCheck.problems.map((p) => p.key).sort()).toEqual(['rules.color.characters', 'rules.color.incomplete', 'rules.color.required', 'rules.color.tooLong'])
  })
})
