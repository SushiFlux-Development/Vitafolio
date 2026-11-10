import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading, PageHeader } from '../../components/ui/Page'
import { useGuideContent } from '../../features/guide/content'
import { GuideIntro } from '../../features/guide/GuideIntro'
import { GuideOverview } from '../../features/guide/GuideOverview'
import { GuidePlanView } from '../../features/guide/GuidePlanView'
import { GuideWizard } from '../../features/guide/GuideWizard'
import { useGuideAnswers } from '../../features/guide/useGuideAnswers'

type GuideView = 'wizard' | 'overview'

/**
 * The guide (Ratgeber): a click wizard for everybody who applies - school leavers, people with years in a job, career changers,
 * people returning after a break - and the plan that follows from the answers. The answers are saved per account, so the next
 * visit shows the plan straight away. "All situations" is a second view for reading without answering. The view is in the address
 * ("?view="), so the browser's back button leaves the wizard and a reload stays where it was.
 */
export function GuidePage() {
  const content = useGuideContent()
  const [params, setParams] = useSearchParams()
  const requested = params.get('view')
  const view: GuideView | null = requested === 'wizard' || requested === 'overview' ? requested : null
  const query = useGuideAnswers()
  const answers = query.data

  const open = (next: GuideView) => setParams({ view: next })
  // Leaving a view replaces its history entry: back from the plan does not return into a finished wizard.
  const close = () => setParams({}, { replace: true })

  const header = (actions?: ReactNode) => <PageHeader title={content.title} subtitle={content.subtitle} actions={actions} />

  if (view === 'overview') {
    return (
      <>
        {header(
          <Button icon="chevronLeft" onClick={close} data-testid="guide-overview-back">
            {content.overview.back}
          </Button>,
        )}
        <GuideOverview />
      </>
    )
  }

  if (answers === undefined) {
    return (
      <>
        {header()}
        {query.isError ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorNotice error={query.error} title={content.loadFailed} />
            <Button icon="refresh" onClick={() => void query.refetch()}>
              {content.retry}
            </Button>
          </div>
        ) : (
          <Loading label={content.loading} />
        )}
      </>
    )
  }

  if (view === 'wizard') {
    return (
      <>
        {header()}
        <GuideWizard initial={answers} onCancel={close} onSaved={close} />
      </>
    )
  }

  if (answers === null) {
    return (
      <>
        {header()}
        <GuideIntro onStart={() => open('wizard')} onOverview={() => open('overview')} />
      </>
    )
  }

  return (
    <>
      {header(
        <>
          <Button icon="book" onClick={() => open('overview')} data-testid="guide-open-overview" data-hint="guide-overview">
            {content.plan.overview}
          </Button>
          <Button icon="pencil" onClick={() => open('wizard')} data-testid="guide-change" data-hint="guide-change">
            {content.plan.changeAnswers}
          </Button>
        </>,
      )}
      <GuidePlanView answers={answers} />
    </>
  )
}
