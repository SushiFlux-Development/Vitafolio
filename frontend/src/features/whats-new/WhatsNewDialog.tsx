import { useTranslation } from 'react-i18next'
import type { WhatsNew } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { renderInlineMarkdown } from './inlineMarkdown'

/** One icon per category of the changelog; anything unknown is shown as a plain note. */
const CATEGORY_ICON: Record<string, IconName> = {
  new: 'sparkles',
  changed: 'refresh',
  fixed: 'circleCheck',
  security: 'shieldCheck',
  removed: 'trash',
  deprecated: 'alertTriangle',
  other: 'infoCircle',
}

export function WhatsNewBody({ notes }: { notes: WhatsNew }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6" data-testid="whats-new-body">
      {notes.summary && <p className="text-[0.9375rem] leading-relaxed text-ink">{renderInlineMarkdown(notes.summary)}</p>}
      {notes.sections.map((section, index) => (
        <section key={`${section.category}-${index}`} aria-label={section.title}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="flex h-6 w-6 items-center justify-center rounded-xs bg-select text-select-ink">
              <Icon name={CATEGORY_ICON[section.category] ?? 'infoCircle'} size={15} />
            </span>
            {section.title}
          </h3>
          <ul className="list-disc space-y-1.5 pl-9 text-sm leading-relaxed text-ink marker:text-ink-muted">
            {section.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>
        </section>
      ))}
      {notes.sections.length === 0 && !notes.summary && <p className="text-sm text-ink-muted">{t('whatsNew.empty')}</p>}
    </div>
  )
}

interface WhatsNewDialogProps {
  open: boolean
  onClose: () => void
  notes: WhatsNew
}

/**
 * "What's new": the notes of the running version in the app's own dialog - version as heading, one block per category, the
 * content scrolls inside. Closes with the button, Esc or a click beside it.
 */
export function WhatsNewDialog({ open, onClose, notes }: WhatsNewDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={notes.version ? t('whatsNew.title', { version: notes.version }) : t('whatsNew.titleNoVersion')}
      icon="sparkles"
      size="lg"
      footer={
        <Button variant="confirm" onClick={onClose} data-autofocus>
          {t('whatsNew.close')}
        </Button>
      }
    >
      <WhatsNewBody notes={notes} />
    </Dialog>
  )
}
