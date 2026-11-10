import type { ReactNode } from 'react'

/**
 * Renders the little Markdown the release notes use - **bold** and `code` - as React elements. Everything else, including any
 * HTML, stays plain text (React escapes it), so text from a changelog can never inject markup. An opening marker without a
 * closing one is shown as it is.
 */
export function renderInlineMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /\*\*([^*\n]+?)\*\*|`([^`\n]+?)`/g
  let last = 0
  let key = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    if (index > last) parts.push(text.slice(last, index))
    if (match[1] !== undefined) {
      parts.push(<strong key={key++}>{match[1]}</strong>)
    } else if (match[2] !== undefined) {
      parts.push(
        <code key={key++} className="rounded-xs bg-sunken px-1 py-0.5 font-mono text-[0.85em]">
          {match[2]}
        </code>,
      )
    }
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
