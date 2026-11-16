import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { profileApi } from '../../api/endpoints'
import type { Profile } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading, PageHeader } from '../../components/ui/Page'
import { useTabParam } from '../../components/ui/Tabs'
import { useSidebarNav } from '../../components/layout/SidebarNav'
import { ProfileWizard } from '../../features/profile/ProfileWizard'
import { UnsavedChangesGuard, useLeaveTexts } from '../../hooks/useUnsavedChangesGuard'
import { CertificatesTab } from './CertificatesTab'
import { CustomSectionsTab } from './CustomSectionsTab'
import { EducationsTab } from './EducationsTab'
import { ExperiencesTab } from './ExperiencesTab'
import { InterestsTab } from './InterestsTab'
import { JsonResumeModal } from './JsonResumeModal'
import { LanguagesTab } from './LanguagesTab'
import { PersonalTab } from './PersonalTab'
import { PreviewGate } from './PreviewGate'
import { PreviewTab } from './PreviewTab'
import { usePersonalForm } from './usePersonalForm'
import { SkillsTab } from './SkillsTab'

type ProfileTab = 'personal' | 'experiences' | 'educations' | 'skills' | 'languages' | 'certificates' | 'interests' | 'customSections' | 'preview'

const TABS: readonly ProfileTab[] = ['personal', 'experiences', 'educations', 'skills', 'languages', 'certificates', 'interests', 'customSections', 'preview']

/**
 * The master profile. Its nine sections are not a tab bar on the page but the sub-pages of its row in the sidebar (the active
 * one stays in the address as "?tab="); "assistant mode" is a second view of the page ("?view=wizard") that none of the sections
 * belongs to - choosing a section in the sidebar leaves it, because the link drops the view.
 */
export function ProfilePage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const wizardMode = params.get('view') === 'wizard'
  const setWizardMode = useCallback(
    (on: boolean) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (on) next.set('view', 'wizard')
          else next.delete('view')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const [active] = useTabParam(TABS)

  const sidebarSection = useMemo(
    () => ({
      label: t('profile.sections'),
      items: TABS.map((id) => ({ id, label: t(`profile.tabs.${id}`), to: `?tab=${id}` })),
      activeId: wizardMode ? null : active,
    }),
    [t, active, wizardMode],
  )
  useSidebarNav(sidebarSection)

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
  })

  const profile = profileQuery.data
  if (profile === undefined) {
    if (!profileQuery.isError) return <Loading />
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorNotice error={profileQuery.error} title={t('profile.loadFailed')} />
        <Button icon="refresh" onClick={() => void profileQuery.refetch()}>
          {t('preview.retry')}
        </Button>
      </div>
    )
  }

  // A reload that failed while the profile is on the screen keeps showing it: the form must not vanish under the typing.
  return <ProfileContent profile={profile} reloading={profileQuery.isFetching} wizardMode={wizardMode} setWizardMode={setWizardMode} active={active} />
}

interface ProfileContentProps {
  profile: Profile
  /** A reload of the profile is running: what is shown may be older than what the server has. */
  reloading: boolean
  wizardMode: boolean
  setWizardMode: (on: boolean) => void
  active: ProfileTab
}

/**
 * The loaded profile. The personal data is a form that saves by itself and lives here, not in its tab, so the typing survives a
 * switch of section or view and a save that is on its way is not cut off by leaving the tab.
 */
function ProfileContent({ profile, reloading, wizardMode, setWizardMode, active }: ProfileContentProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [jsonResumeOpen, setJsonResumeOpen] = useState(false)
  const personal = usePersonalForm(profile, !reloading)
  const leaveTexts = useLeaveTexts()

  return (
    <>
      {/* Only input that could not be saved is worth a question; whatever is on its way is sent when the page is left. */}
      <UnsavedChangesGuard when={personal.state.unsent} texts={leaveTexts} />
      <PageHeader
        title={t('profile.title')}
        subtitle={t('profile.description')}
        actions={
          <>
            <Button icon={wizardMode ? 'layoutBoard' : 'sparkles'} onClick={() => setWizardMode(!wizardMode)} data-hint="profile-assistant">
              {wizardMode ? t('profile.classicView') : t('profile.wizardMode')}
            </Button>
            <Button icon="files" onClick={() => setJsonResumeOpen(true)}>
              {t('profile.jsonResume.button')}
            </Button>
          </>
        }
      />

      {wizardMode ? (
        <ProfileWizard profile={profile} personalForm={personal} onExitWizard={() => setWizardMode(false)} />
      ) : (
        <div data-testid="profile-content">
          {active === 'personal' && <PersonalTab profile={profile} form={personal} />}
          {active === 'experiences' && <ExperiencesTab profile={profile} />}
          {active === 'educations' && <EducationsTab profile={profile} />}
          {active === 'skills' && <SkillsTab profile={profile} />}
          {active === 'languages' && <LanguagesTab profile={profile} />}
          {active === 'certificates' && <CertificatesTab profile={profile} />}
          {active === 'interests' && <InterestsTab profile={profile} />}
          {active === 'customSections' && <CustomSectionsTab profile={profile} />}
          {active === 'preview' && (
            <PreviewGate form={personal}>
              <PreviewTab saved={profile.previewOptions} />
            </PreviewGate>
          )}
        </div>
      )}

      <JsonResumeModal
        open={jsonResumeOpen}
        onClose={() => setJsonResumeOpen(false)}
        hasUnsavedPersonalData={personal.state.unsent}
        onImportSuccess={(imported) => {
          // The import replaced what the server has; a half-typed form of before would only show old values.
          personal.adopt(imported)
          queryClient.setQueryData(['profile'], imported)
          void queryClient.invalidateQueries({ queryKey: ['profile'] })
        }}
      />
    </>
  )
}
