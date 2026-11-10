import { useMemo } from 'react'
import type { GuideAnswers } from '../../api/types'
import { Notice } from '../../components/ui/Notice'
import { useGuideContent } from './content'
import type { GuideContent } from './content'
import { KindLegend, PlanBlocks } from './PlanBlocks'
import { buildPlan } from './plan'

/** The answers as short labels for the summary line. */
export function answerLabels(answers: GuideAnswers, content: GuideContent): string[] {
  const summary = content.summary
  return [
    summary.situation[answers.situation],
    ...(answers.yearsOfExperience === null ? [] : [summary.years(answers.yearsOfExperience)]),
    summary.plan[answers.plan],
    ...(answers.explain.length === 0 ? [summary.explainNone] : answers.explain.map((item) => summary.explain[item])),
    summary.region[answers.region],
  ]
}

/** The plan for the saved answers: a summary of the answers, the note on how firm the advice is, the blocks, the legend and the sources. */
export function GuidePlanView({ answers }: { answers: GuideAnswers }) {
  const content = useGuideContent()
  const plan = useMemo(() => buildPlan(answers), [answers])
  const labels = answerLabels(answers, content)

  return (
    <div className="flex flex-col gap-6" data-testid="guide-plan">
      <section className="card p-5" aria-labelledby="guide-plan-heading">
        <h2 id="guide-plan-heading" className="text-lg">
          {content.plan.heading}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={content.plan.answersLabel} data-testid="guide-answers-summary" data-hint="guide-answers">
          {labels.map((label) => (
            <li key={label} className="badge badge-select">
              {label}
            </li>
          ))}
        </ul>
      </section>

      <Notice tone="info">
        <strong className="font-semibold">{content.plan.disclaimerTitle}. </strong>
        {content.plan.disclaimer}
      </Notice>

      <PlanBlocks plan={plan} />

      <section className="card p-5" aria-labelledby="guide-legend-heading">
        <h2 id="guide-legend-heading" className="mb-4 text-base">
          {content.plan.legendTitle}
        </h2>
        <KindLegend />
        <h3 className="mt-6 mb-1 text-sm font-semibold">{content.plan.sourcesTitle}</h3>
        <p className="max-w-4xl text-sm text-ink-muted">{content.plan.sources}</p>
      </section>
    </div>
  )
}
