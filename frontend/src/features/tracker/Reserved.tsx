import type { ReactNode } from 'react'

interface ReservedProps {
  children?: ReactNode
  /** Every text that can show up here (already translated). The block is as tall as the tallest of them at the current width. */
  reserve: readonly string[]
  className?: string
}

/**
 * A text place that keeps its room whatever it says: the real text and an invisible copy of every possible one share one grid
 * cell, so the line count of the real text can change without anything below it moving. The copies are drawn from a data
 * attribute, so they take room but are no text of the page (nothing to select, read out or find).
 */
export function Reserved({ children, reserve, className = '' }: ReservedProps) {
  return (
    <div className={`grid ${className}`}>
      <div className="col-start-1 row-start-1">{children}</div>
      {reserve.map((text, index) => (
        <div
          key={index}
          aria-hidden="true"
          data-reserved={text}
          className="pointer-events-none invisible col-start-1 row-start-1 select-none after:content-[attr(data-reserved)]"
        />
      ))}
    </div>
  )
}
