import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { useGuideContent } from './content'

/** The start screen before the first run: what the guide does, in a few words, and the two ways in. */
export function GuideIntro({ onStart, onOverview }: { onStart: () => void; onOverview: () => void }) {
  const content = useGuideContent()
  return (
    <section className="card flex flex-col gap-5 p-8" aria-labelledby="guide-intro-heading" data-testid="guide-intro">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-select text-select-ink" aria-hidden="true">
          <Icon name="compass" size={26} />
        </span>
        <div className="min-w-0">
          <h2 id="guide-intro-heading" className="text-xl">
            {content.intro.heading}
          </h2>
          <p className="mt-2 max-w-3xl text-ink-muted">{content.intro.text}</p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2">
        {content.intro.points.map((point) => (
          <li key={point} className="badge badge-neutral">
            {point}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="confirm" icon="chevronRight" onClick={onStart} data-testid="guide-start" data-hint="guide-start">
          {content.intro.start}
        </Button>
        <Button icon="book" onClick={onOverview} data-testid="guide-open-overview" data-hint="guide-overview">
          {content.intro.overview}
        </Button>
      </div>
    </section>
  )
}
