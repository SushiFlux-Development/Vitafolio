import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Profile } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { EducationsTab } from '../../pages/profile/EducationsTab'
import { ExperiencesTab } from '../../pages/profile/ExperiencesTab'
import { LanguagesTab } from '../../pages/profile/LanguagesTab'
import { PersonalTab } from '../../pages/profile/PersonalTab'
import { PreviewGate } from '../../pages/profile/PreviewGate'
import { PreviewTab } from '../../pages/profile/PreviewTab'
import type { PersonalForm } from '../../pages/profile/usePersonalForm'
import { SkillsTab } from '../../pages/profile/SkillsTab'

interface ProfileWizardProps {
  profile: Profile
  /** The personal data lives in the page, so it survives leaving and re-entering the wizard. */
  personalForm: PersonalForm
  onExitWizard: () => void
}

const STEPS = [1, 2, 3, 4, 5] as const

export function ProfileWizard({ profile, personalForm, onExitWizard }: ProfileWizardProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState<(typeof STEPS)[number]>(1)

  const go = (step: (typeof STEPS)[number]) => {
    setCurrentStep(step)
    window.scrollTo({ top: 0 })
  }

  const handleNext = () => {
    if (currentStep < STEPS.length) go((currentStep + 1) as (typeof STEPS)[number])
    else onExitWizard()
  }

  return (
    <div className="space-y-6">
      {/* Wizard Header Bar */}
      <div className="card accent-start flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gold-text uppercase">
            <Icon name="sparkles" size={16} />
            {t('profile.wizard.label')}
          </div>
          <h2 className="mt-0.5 text-xl font-semibold text-ink">{t('profile.wizard.stepOf', { current: currentStep, total: STEPS.length, title: t(`profile.wizard.steps.${currentStep}.title`) })}</h2>
          <p className="text-sm text-ink-muted">{t(`profile.wizard.steps.${currentStep}.description`)}</p>
        </div>

        <Button small icon="layoutBoard" onClick={onExitWizard}>
          {t('profile.classicView')}
        </Button>
      </div>

      {/* Step Stepper Progress */}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label={t('profile.wizard.label')}>
        {STEPS.map((step) => {
          const isActive = step === currentStep
          const isDone = step < currentStep
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => go(step)}
                aria-current={isActive ? 'step' : undefined}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  isActive ? 'border-indicator bg-select text-select-ink ring-1 ring-indicator' : isDone ? 'border-line bg-surface text-ink hover:bg-surface-2' : 'border-line bg-surface-2 text-ink-muted hover:bg-surface'
                }`}
              >
                <span className="mb-1 flex items-center justify-between text-xs font-semibold">
                  {t('profile.wizard.step', { number: step })}
                  {isDone && <Icon name="circleCheck" size={14} className="text-success-soft-ink" />}
                </span>
                <span className="block text-xs">{t(`profile.wizard.steps.${step}.title`)}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Step Content */}
      <div className="card min-h-[400px] p-6">
        {currentStep === 1 && <PersonalTab profile={profile} form={personalForm} />}
        {currentStep === 2 && <ExperiencesTab profile={profile} />}
        {currentStep === 3 && <EducationsTab profile={profile} />}
        {currentStep === 4 && (
          <div className="space-y-8">
            <div>
              <h3 className="mb-3 text-base font-semibold text-ink">{t('profile.wizard.skillsHeading')}</h3>
              <SkillsTab profile={profile} />
            </div>
            <div className="border-t border-line pt-6">
              <h3 className="mb-3 text-base font-semibold text-ink">{t('profile.wizard.languagesHeading')}</h3>
              <LanguagesTab profile={profile} />
            </div>
          </div>
        )}
        {currentStep === 5 && (
          <PreviewGate form={personalForm}>
            <PreviewTab />
          </PreviewGate>
        )}
      </div>

      {/* Wizard Footer Controls */}
      <div className="flex items-center justify-between pt-2">
        <Button icon="chevronLeft" disabled={currentStep === 1} onClick={() => go((currentStep - 1) as (typeof STEPS)[number])}>
          {t('common.back')}
        </Button>

        <Button variant="confirm" icon={currentStep === STEPS.length ? 'check' : 'chevronRight'} onClick={handleNext}>
          {currentStep === STEPS.length ? t('profile.wizard.finish') : t('profile.wizard.next')}
        </Button>
      </div>
    </div>
  )
}
