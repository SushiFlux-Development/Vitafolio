const BULLET_PREFIX = /^(\s*(?:[-*•–]|\d+[.)])\s+)/

/**
 * Puts an improved bullet point back into a description. The source is what the user sent to the assistant: the whole text
 * (everything is replaced), one line of it (only that line is replaced, a list marker in front of it stays) or something the
 * user retyped meanwhile (the improved text is added as a new line - nothing the user wrote is lost).
 */
export function replaceBullet(description: string, source: string, improved: string): string {
  const text = improved.trim()
  if (text === '') return description
  const wanted = source.trim()
  if (wanted === '' || wanted === description.trim()) return text

  const lines = description.split('\n')
  const index = lines.findIndex((line) => line.trim() === wanted)
  if (index >= 0) {
    const prefix = BULLET_PREFIX.exec(lines[index]!)?.[1] ?? ''
    lines[index] = BULLET_PREFIX.test(text) ? text : `${prefix}${text}`
    return lines.join('\n')
  }
  return `${description.replace(/\s+$/, '')}\n${text}`
}
