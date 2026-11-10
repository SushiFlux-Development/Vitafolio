import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { useGuideContent } from './content'
import { EXTERNAL_LINK_TARGETS, LINK_TARGETS } from './plan'
import type { BlockId, GuidePlan, ItemKind, PlanBlock, PlanItem } from './plan'

const BLOCK_ICONS: Record<BlockId, IconName> = {
  contents: 'listCheck',
  region: 'world',
  cvStructure: 'fileText',
  trim: 'scissors',
  attachments: 'paperclip',
  coverLetter: 'mail',
  sensitive: 'alertTriangle',
  findData: 'search',
}

/** The badge colours reuse the app's soft tones; the label always says it in words, so colour is never the only signal. */
const BADGE_CLASS: Record<ItemKind, string | null> = {
  rule: null,
  ruleOfThumb: 'badge-neutral',
  recommendation: 'badge-highlight',
  disputed: 'badge-warning',
  thin: 'badge-info',
  unproven: 'badge-warning',
  app: 'badge-success',
  example: 'badge-neutral',
}

interface PlanBlocksProps {
  plan: GuidePlan
  /** Show only these blocks (a tab of the overview is about one topic). */
  only?: readonly BlockId[] | undefined
}

/** The blocks of a plan as cards side by side as far as the window is wide. They come in one after the other, calmly. */
export function PlanBlocks({ plan, only }: PlanBlocksProps) {
  const reduce = useReducedMotion() ?? false
  const blocks = only ? plan.blocks.filter((block) => only.includes(block.id)) : plan.blocks
  return (
    <div className="card-grid items-start [--card-min:32rem]" data-testid="guide-blocks" data-hint="guide-plan">
      {blocks.map((block, index) => (
        <motion.div
          key={block.id}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.22, delay: reduce ? 0 : Math.min(index, 6) * 0.04, ease: 'easeOut' }}
        >
          <BlockCard block={block} />
        </motion.div>
      ))}
    </div>
  )
}

function BlockCard({ block }: { block: PlanBlock }) {
  const content = useGuideContent()
  const text = content.blocks[block.id]
  return (
    <section className="card p-5" aria-labelledby={`guide-block-${block.id}`} data-testid={`guide-block-${block.id}`}>
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-select text-select-ink" aria-hidden="true">
          <Icon name={BLOCK_ICONS[block.id]} size={21} />
        </span>
        <div className="min-w-0">
          <h2 id={`guide-block-${block.id}`} className="text-base">
            {text.title}
          </h2>
          <p className="text-sm text-ink-muted">{text.intro}</p>
        </div>
      </header>

      <ul className="mt-4 flex flex-col gap-4">
        {block.items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </ul>

      <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="text-sm text-ink-muted">{content.plan.goTo}:</span>
        {block.links.map((link) => (
          <Link key={link} to={LINK_TARGETS[link]} className="btn btn-secondary btn-sm" data-testid={`guide-link-${link}`}>
            {content.links[link]}
            <Icon name="chevronRight" size={15} />
          </Link>
        ))}
      </footer>
    </section>
  )
}

function ItemRow({ item }: { item: PlanItem }) {
  const content = useGuideContent()
  const text = content.items[item.id]
  const badge = BADGE_CLASS[item.kind]
  return (
    <li className="min-w-0" data-testid={`guide-item-${item.id}`} data-kind={item.kind}>
      {badge && <span className={`badge ${badge} mb-1.5`}>{content.kinds[item.kind]}</span>}
      <p className="break-words">{text.text}</p>
      {text.points && (
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 marker:text-ink-muted">
          {text.points.map((point) => (
            <li key={point} className="break-words">
              {point}
            </li>
          ))}
        </ul>
      )}
      {item.external && (
        <ul className="mt-2 flex flex-col gap-1">
          {item.external.map((link) => (
            <li key={link}>
              {/* Opens in the user's own browser; the address is shown by the browser, nothing is requested before the click. */}
              <a
                href={EXTERNAL_LINK_TARGETS[link]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold"
                data-testid={`guide-external-${link}`}
              >
                {content.externalLinks[link]}
                <span className="sr-only"> ({content.plan.externalHint})</span>
                <Icon name="externalLink" size={14} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** The legend of the badges: what "Faustregel", "Empfehlung" and the others mean. */
export function KindLegend() {
  const content = useGuideContent()
  const kinds = (Object.keys(BADGE_CLASS) as ItemKind[]).filter((kind) => BADGE_CLASS[kind] !== null)
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {kinds.map((kind) => (
        <div key={kind} className="flex min-w-0 items-start gap-3">
          <dt className="w-40 shrink-0">
            <span className={`badge ${BADGE_CLASS[kind]}`}>{content.kinds[kind]}</span>
          </dt>
          <dd className="min-w-0 text-sm text-ink-muted">{content.kindHelp[kind]}</dd>
        </div>
      ))}
    </dl>
  )
}
