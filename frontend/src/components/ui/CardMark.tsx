export interface CardMarkValue {
  tone: 'warning' | 'success' | 'neutral' | 'danger'
  text: string
  /** A small link-like button behind the text (for example "Show error"). Its label is part of the reserved room. */
  action?: { label: string; onClick: () => void }
}

/** The text a mark takes up, including its action; reserve this for every mark that can show up. */
export function markRoom(mark: { text: string; action?: { label: string } }): string {
  return mark.action ? `${mark.text} ${mark.action.label}` : mark.text
}

/**
 * A short status mark in the header line of a card or above a form ("Saved", "Not saved"). It takes the room of the longest
 * text that can appear from the start - an invisible copy per text, drawn from a data attribute, so it is no text in the page -
 * and therefore never moves the title, the card or anything below when the mark comes, changes or goes. Because it sits in the
 * header it needs no reserved line of its own inside the card (which would look like a hole above the first field).
 *
 * The mark is at most 26 rem wide and wraps beyond that; the invisible copies wrap the same way, so width and height of the
 * place are those of the longest text in the active language, whatever is shown.
 */
export function CardMark({ mark, reserve, align = 'end' }: { mark: CardMarkValue | null; reserve: readonly string[]; align?: 'start' | 'end' }) {
  // In a card header (end) the mark stands at the top beside the title; above a form (start) it is centred in its place.
  const side = align === 'end' ? 'justify-self-end self-start text-right' : 'justify-self-start self-center text-left'
  return (
    <span role="status" className={`grid max-w-[26rem] shrink-0 ${align === 'end' ? 'justify-items-end' : 'justify-items-start'}`}>
      {mark && (
        <span className={`badge badge-${mark.tone} col-start-1 row-start-1 block whitespace-normal ${side}`}>
          {mark.text}
          {mark.action && (
            <>
              {' '}
              <button
                type="button"
                onClick={mark.action.onClick}
                className="font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {mark.action.label}
              </button>
            </>
          )}
        </span>
      )}
      {reserve.map((text, index) => (
        <span
          key={index}
          aria-hidden="true"
          data-reserved={text}
          className={`badge invisible col-start-1 row-start-1 block whitespace-normal select-none after:content-[attr(data-reserved)] ${side}`}
        />
      ))}
    </span>
  )
}
