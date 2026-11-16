import { useTranslation } from 'react-i18next'
import { Button } from './Button'

interface ItemActionsProps {
  /** The name of the entry; it makes every button's accessible name unique ("Station bearbeiten: Entwickler"). */
  itemName: string
  /** Entries that cannot be edited (an uploaded file) leave out both edit props. */
  editLabel?: string | undefined
  deleteLabel: string
  onEdit?: (() => void) | undefined
  onDelete: () => void
  /** Only lists with an order show the arrows. */
  onMoveUp?: (() => void) | undefined
  onMoveDown?: (() => void) | undefined
  disableMoveUp?: boolean
  disableMoveDown?: boolean
  busy?: boolean
}

/**
 * The buttons at the end of an entry in the profile: move up / down (ordered lists), edit, delete. One look and one order
 * everywhere an entry can be changed: plain icons without frame or fill (delete in the danger colour), each a 48 px target with
 * a visible focus ring, a tooltip and an accessible name that includes the entry. Icons rather than words, because they share
 * the head of small cards (a language, a skill) with the entry's name.
 */
export function ItemActions({ itemName, editLabel, deleteLabel, onEdit, onDelete, onMoveUp, onMoveDown, disableMoveUp, disableMoveDown, busy }: ItemActionsProps) {
  const { t } = useTranslation()
  const name = (label: string) => `${label}: ${itemName}`
  return (
    <div className="flex shrink-0 items-center gap-2">
      {onMoveUp && (
        <Button variant="ghost" small iconOnly icon="chevronUp" disabled={disableMoveUp || busy} onClick={onMoveUp} title={t('common.moveUp')}>
          <span className="sr-only">{name(t('common.moveUp'))}</span>
        </Button>
      )}
      {onMoveDown && (
        <Button variant="ghost" small iconOnly icon="chevronDown" disabled={disableMoveDown || busy} onClick={onMoveDown} title={t('common.moveDown')}>
          <span className="sr-only">{name(t('common.moveDown'))}</span>
        </Button>
      )}
      {onEdit && editLabel && (
        <Button variant="ghost" small iconOnly icon="pencil" onClick={onEdit} title={editLabel}>
          <span className="sr-only">{name(editLabel)}</span>
        </Button>
      )}
      <Button variant="danger-text" small iconOnly icon="trash" onClick={onDelete} title={deleteLabel}>
        <span className="sr-only">{name(deleteLabel)}</span>
      </Button>
    </div>
  )
}
