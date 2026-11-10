import { useMemo } from 'react'
import { TabPanel, Tabs, useTabParam } from '../../components/ui/Tabs'
import { Notice } from '../../components/ui/Notice'
import { useGuideContent } from './content'
import { OVERVIEW_EXAMPLES, OVERVIEW_IDS } from './overview'
import { KindLegend, PlanBlocks } from './PlanBlocks'
import { buildPlan } from './plan'

/**
 * "All situations": the plan for typical answers, one tab per situation, to read without answering anything. The tab stays in
 * the address ("?tab="), so a situation can be linked and survives a reload.
 */
export function GuideOverview() {
  const content = useGuideContent()
  const [active, setActive] = useTabParam(OVERVIEW_IDS)
  const example = OVERVIEW_EXAMPLES[active]
  const plan = useMemo(() => buildPlan(example.answers), [example])

  return (
    <div className="flex flex-col gap-6" data-testid="guide-overview">
      <div>
        <h2 className="text-lg">{content.overview.heading}</h2>
        <p className="mt-1 max-w-3xl text-ink-muted">{content.overview.intro}</p>
      </div>

      <Notice tone="info">
        <strong className="font-semibold">{content.plan.disclaimerTitle}. </strong>
        {content.plan.disclaimer}
      </Notice>

      <div>
        <div data-hint="guide-situations">
          <Tabs
            label={content.overview.tabsLabel}
            active={active}
            onChange={setActive}
            tabs={OVERVIEW_IDS.map((id) => ({ id, label: content.overview.tabs[id] }))}
          />
        </div>
        <TabPanel id={active}>
          <div className="flex flex-col gap-5">
            <Notice tone="info">
              <strong className="font-semibold">{content.overview.exampleLabel}: </strong>
              {content.overview.examples[active]}. {content.overview.note}
            </Notice>
            <PlanBlocks plan={plan} only={example.only} />
          </div>
        </TabPanel>
      </div>

      <section className="card p-5" aria-label={content.plan.legendTitle} data-hint="guide-legend">
        <h2 className="mb-4 text-base">{content.plan.legendTitle}</h2>
        <KindLegend />
      </section>
    </div>
  )
}
