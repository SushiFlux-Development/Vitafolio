import { useNavigate } from 'react-router'
import { HintTour } from './HintTour'
import { IntroTour } from './IntroTour'
import type { LiveHelper as LiveHelperState } from './useLiveHelper'

interface LiveHelperProps {
  helper: LiveHelperState
  /** Opens the manual (the viewer lives in the app shell). */
  onOpenHandbook: () => void
}

/** The two parts of the live helper, wired to one state: the introduction and the hints of the current screen. */
export function LiveHelper({ helper, onOpenHandbook }: LiveHelperProps) {
  const navigate = useNavigate()
  const { finishIntro, closeHints, startIntro } = helper

  return (
    <>
      <IntroTour
        open={helper.introOpen}
        onClose={finishIntro}
        onGoToProfile={() => {
          finishIntro()
          void navigate('/profile')
        }}
        onOpenHandbook={() => {
          finishIntro()
          onOpenHandbook()
        }}
      />
      <HintTour
        screen={helper.screen}
        open={helper.hintsOpen}
        onClose={closeHints}
        onShowIntro={() => {
          closeHints()
          startIntro()
        }}
        onOpenHandbook={() => {
          closeHints()
          onOpenHandbook()
        }}
      />
    </>
  )
}
