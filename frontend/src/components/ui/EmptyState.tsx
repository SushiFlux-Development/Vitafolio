import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/** The empty list of a page or tab: one icon, one sentence, optionally the action that fills it. Same look everywhere. */
export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1 p-12 text-center">
      <Icon name={icon} size={36} className="mb-2 text-ink-muted" />
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="max-w-lg text-sm text-ink-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
