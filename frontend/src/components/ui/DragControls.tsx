import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'

/**
 * The visible handle of a window that can be moved: the head of the window is dragged with the pointer, and this button does the
 * same with the arrow keys (Shift in larger steps). It is part of the head, so the head's own pointer handling covers it too.
 */
export function DragGrip({ onKeyDown }: { onKeyDown: (event: KeyboardEvent<HTMLElement>) => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-label={t('dragWindow.handle')}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
      onKeyDown={onKeyDown}
      data-testid="drag-grip"
      className="hit inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-xs text-ink-muted hover:text-ink active:cursor-grabbing"
    >
      <Icon name="gripHorizontal" size={18} />
    </button>
  )
}

/**
 * "Reset position". It always takes its room and is only invisible while the window sits where it was put, so that it appearing
 * moves nothing next to it (an invisible button is out of the tab order as well).
 */
export function DragReset({ shown, onClick, withLabel = false }: { shown: boolean; onClick: () => void; withLabel?: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-no-drag=""
      data-testid="drag-reset"
      aria-label={t('dragWindow.reset')}
      onClick={onClick}
      className={`hit inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-xs text-xs font-medium text-link hover:underline ${withLabel ? 'px-1' : 'w-7'} ${shown ? '' : 'invisible'}`}
    >
      <Icon name="arrowBackUp" size={16} />
      {withLabel && t('dragWindow.reset')}
    </button>
  )
}
