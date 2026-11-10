import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/ui/Icon'
import { MessageSlot } from '../../components/ui/MessageSlot'
import type { DocumentDesign } from '../../api/types'
import { groupDesigns } from './useDocumentDesigns'

interface DesignGalleryProps {
  designs: DocumentDesign[]
  value: string
  onChange: (design: string) => void
}

// The real first page of each design, made by the script scripts/build-design-previews.cs.
const previewOf = (id: string) => `${import.meta.env.BASE_URL}designs/${id}.png`

/** Moves the choice on the arrow keys: left/right by one, up/down by one row of the grid, wrapping around at the ends. */
function nextIndex(key: string, index: number, count: number, columns: number): number | null {
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  if (key === 'ArrowDown') return index + columns < count ? index + columns : index % columns
  if (key === 'ArrowUp') return index - columns >= 0 ? index - columns : Math.min(count - 1, index + columns * Math.floor((count - 1 - index) / columns))
  return null
}

/**
 * The choice of the CV design: the current one as a compact line that unfolds into a gallery of all designs, so the PDF preview
 * keeps its space until the user asks to compare. The gallery is a radio group (as Segmented): Tab reaches the chosen design, the
 * arrow keys move the choice and the focus. Each picture has a fixed format, so nothing moves while the pictures load.
 */
export function DesignGallery({ designs, value, onChange }: DesignGalleryProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const grid = useRef<HTMLDivElement>(null)
  const label = t('profile.preview.design')
  // The room of the description in the bar: what the longest text of this language needs, so a change of the design moves nothing
  const descriptions = designs.map((design) => t(`profile.preview.designs.${design.id}Desc`, { defaultValue: '' }))
  // The same for the name: in the narrow column the longest names wrap, so the line has the room of the longest name for every design
  const names = designs.map((design) => t(`profile.preview.designs.${design.id}`, { defaultValue: design.id }))
  const groups = groupDesigns(designs)
  const hasGroups = groups.length > 1

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tiles = grid.current?.querySelectorAll<HTMLElement>('[role="radio"]')
    const first = tiles?.[0]
    if (!tiles || !first) return
    const columns = [...tiles].filter((tile) => tile.offsetTop === first.offsetTop).length || 1
    const index = designs.findIndex((design) => design.id === value)
    const target = nextIndex(event.key, Math.max(index, 0), designs.length, columns)
    const next = target === null ? undefined : designs[target]
    if (target === null || !next) return
    event.preventDefault()
    onChange(next.id)
    tiles[target]?.focus()
  }

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">{label}</p>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-sm border border-line-strong bg-surface p-2">
        <img src={previewOf(value)} alt="" width={42} height={59} className="row-span-2 h-[3.7rem] w-[2.6rem] self-start rounded-xs border border-line object-cover object-top" />
        <div className="grid text-sm leading-snug font-semibold text-ink">
          <p className="col-start-1 row-start-1">{t(`profile.preview.designs.${value}`, { defaultValue: value })}</p>
          {/* Invisible copies of every name (drawn from an attribute, so they are no page text): the cell is as tall as the tallest. */}
          {names.map((name, index) => (
            <span key={index} aria-hidden="true" data-reserved={name} className="pointer-events-none invisible col-start-1 row-start-1 select-none after:content-[attr(data-reserved)]" />
          ))}
        </div>
        <button
          type="button"
          data-testid="design-gallery-toggle"
          aria-expanded={open}
          onClick={() => setOpen((shown) => !shown)}
          className="flex min-h-8 items-center gap-1 rounded-xs px-2 text-sm font-semibold text-select-ink hover:bg-surface-2"
        >
          {open ? t('profile.preview.closeDesigns') : t('profile.preview.chooseDesign')}
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>
        <div className="col-span-2 col-start-2">
          <MessageSlot message={t(`profile.preview.designs.${value}Desc`, { defaultValue: '' })} reserve={descriptions} textClassName="text-xs" />
        </div>
      </div>

      {open && (
        <div
          ref={grid}
          role="radiogroup"
          aria-label={label}
          onKeyDown={handleKeyDown}
          className="mt-3 max-h-[31rem] space-y-4 overflow-y-auto p-0.5 2xl:max-h-none 2xl:overflow-visible"
        >
          {groups.map(({ group, designs: members }) => (
            <div key={group}>
              {hasGroups && (
                <div className="mb-2">
                  <p className="text-xs font-bold tracking-wider text-ink uppercase">{t(`profile.preview.designGroups.${group}`, { defaultValue: group })}</p>
                  {group === 'expressive' && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{t('profile.preview.designGroups.expressiveHint')}</p>}
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
                {members.map((design) => {
                  const selected = design.id === value
                  const name = t(`profile.preview.designs.${design.id}`, { defaultValue: design.id })
                  return (
                    <button
                      key={design.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={name}
                      aria-describedby={`design-desc-${design.id}`}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => onChange(design.id)}
                      className={`relative flex flex-col rounded-sm border p-1.5 text-left transition-colors ${
                        selected ? 'border-transparent bg-select text-select-ink shadow-[inset_0_0_0_2px_var(--indicator)]' : 'border-line bg-surface hover:bg-surface-2'
                      }`}
                    >
                      <img src={previewOf(design.id)} alt="" loading="lazy" className="aspect-[210/297] w-full rounded-xs border border-line object-cover object-top" />
                      {selected && (
                        <span className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-xs bg-select text-select-ink shadow-[inset_0_0_0_1px_var(--indicator)]">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                      <span className={`mt-1.5 block text-[0.8125rem] font-semibold ${selected ? '' : 'text-ink'}`}>{name}</span>
                      <span id={`design-desc-${design.id}`} className={`mt-0.5 block text-xs leading-snug ${selected ? '' : 'text-ink-muted'}`}>
                        {t(`profile.preview.designs.${design.id}Desc`, { defaultValue: '' })}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
