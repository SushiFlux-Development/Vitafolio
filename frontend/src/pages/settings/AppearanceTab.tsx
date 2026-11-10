import { useTranslation } from 'react-i18next'
import type { LanguageCode, ThemePreference } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Section } from '../../components/ui/Page'
import { Segmented } from '../../components/ui/Segmented'
import { SelectField } from '../../components/ui/SelectField'
import { restartLiveHelper } from '../../features/live-helper/storage'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useAppearance } from '../../theme/useAppearance'
import { DATE_FORMAT_PREFERENCES, formatDayParts, isDateFormatPreference, resolveDateFormat } from '../../validation/dates'
import type { DateFormatId, DateFormatPreference } from '../../validation/dates'

/** Darstellung: theme (light, dark), language and date format. Applied at once, saved to the account when signed in. */
export function AppearanceTab() {
  const { t, i18n } = useTranslation()
  const appearance = useAppearance()
  const language: LanguageCode = i18n.language.startsWith('en') ? 'en' : 'de'
  const dates = useDateFormat()
  const today = new Date()
  // One example for every notation: a day and a month, so the choice can be judged before it is made.
  const example = (format: DateFormatId) => formatDayParts(1990, 4, 23, format)
  const optionLabel = (preference: DateFormatPreference) =>
    preference === 'auto'
      ? `${t('settings.dateFormat.auto')} – ${example(resolveDateFormat('auto', language))}`
      : `${t(`settings.dateFormat.formats.${preference}`)} – ${example(preference)}`

  return (
    <div className="card-grid items-start gap-6 [--card-min:30rem]">
      <Section title={t('settings.theme.title')} description={t('settings.theme.text')}>
        <Segmented<ThemePreference>
          label={t('settings.theme.title')}
          value={appearance.preference}
          onChange={appearance.setTheme}
          options={[
            { value: 'light', label: t('settings.theme.light'), icon: 'sun' },
            { value: 'dark', label: t('settings.theme.dark'), icon: 'moon' },
          ]}
        />
      </Section>

      <Section title={t('settings.language.title')} description={t('settings.language.text')}>
        <Segmented<LanguageCode>
          label={t('settings.language.title')}
          value={language}
          onChange={(next) => void appearance.setLanguage(next)}
          options={[
            { value: 'de', label: 'Deutsch', icon: 'language' },
            { value: 'en', label: 'English', icon: 'language' },
          ]}
        />
      </Section>

      <Section title={t('settings.dateFormat.title')} description={t('settings.dateFormat.text')}>
        <SelectField
          label={t('settings.dateFormat.title')}
          hideLabel
          value={dates.preference}
          onChange={(event) => {
            if (isDateFormatPreference(event.target.value)) appearance.setDateFormat(event.target.value)
          }}
          hint={t('settings.dateFormat.preview', {
            date: formatDayParts(today.getFullYear(), today.getMonth() + 1, today.getDate(), dates.format),
            month: dates.stored(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`),
          })}
        >
          {DATE_FORMAT_PREFERENCES.map((preference) => (
            <option key={preference} value={preference}>
              {optionLabel(preference)}
            </option>
          ))}
        </SelectField>
      </Section>

      <div data-hint="settings-helper">
        <Section title={t('liveHelper.settings.title')} description={t('liveHelper.settings.text')}>
          <Button icon="compass" onClick={restartLiveHelper} data-testid="restart-helper">
            {t('liveHelper.settings.restart')}
          </Button>
        </Section>
      </div>
    </div>
  )
}
