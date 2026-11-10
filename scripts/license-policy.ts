/**
 * The licence rules for everything the product ships, as pure functions (no file or network access), so the generator, the release check
 * and the tests share one implementation. The lists live in license-policy.json:
 *   - "allowed":              licences that may be used without asking.
 *   - "pendingOwnerDecision": licences that are not on the allowed list but are no obvious "no" either (permissive in spirit, weak copyleft,
 *                             font licences). They need a decision of the owner: a warning in the normal check, an error in the strict
 *                             check the release workflow runs. To approve one, move it into "allowed".
 *   - everything else (unknown, GPL without exception, source-available, non-commercial, ...) is denied.
 *
 * A licence is an SPDX expression: ids joined with OR (one alternative is enough) and AND (all are needed), WITH for exceptions, parentheses.
 * Crates write a plain "/" for OR ("MIT/Apache-2.0"), that is understood too.
 */

export interface LicensePolicy {
  allowed: string[]
  pendingOwnerDecision: Record<string, string>
  buildToolsNotShipped: Record<string, string>
  overrides: Record<string, string>
}

export type Verdict = 'allowed' | 'pending' | 'denied'

export interface Evaluation {
  verdict: Verdict
  /** The licence ids that decided a "pending" or "denied" verdict (empty when allowed). */
  reasons: string[]
}

const RANK: Record<Verdict, number> = { allowed: 0, pending: 1, denied: 2 }

type Node = { kind: 'id'; id: string } | { kind: 'or' | 'and'; items: Node[] }

function tokenize(expression: string): string[] {
  const normalised = expression.replace(/\s*\/\s*/g, ' OR ')
  const tokens: string[] = []
  for (const match of normalised.matchAll(/\(|\)|[^\s()]+/g)) tokens.push(match[0])
  return tokens
}

/** Parses an expression into a tree; throws on unbalanced parentheses or an empty expression. */
function parse(expression: string): Node {
  const tokens = tokenize(expression)
  let position = 0
  const peek = () => tokens[position]
  const next = () => tokens[position++]

  function atom(): Node {
    const token = next()
    if (token === undefined) throw new Error('empty licence expression')
    if (token === '(') {
      const inner = orExpression()
      if (next() !== ')') throw new Error(`missing ) in "${expression}"`)
      return inner
    }
    if (token === ')' || /^(AND|OR|WITH)$/i.test(token)) throw new Error(`unexpected ${token} in "${expression}"`)
    let id = token
    if (peek() !== undefined && /^WITH$/i.test(peek()!)) {
      next()
      const exception = next()
      if (exception === undefined) throw new Error(`missing exception after WITH in "${expression}"`)
      id = `${token} WITH ${exception}`
    }
    return { kind: 'id', id }
  }
  function andExpression(): Node {
    const items = [atom()]
    while (peek() !== undefined && /^AND$/i.test(peek()!)) {
      next()
      items.push(atom())
    }
    return items.length === 1 ? items[0]! : { kind: 'and', items }
  }
  function orExpression(): Node {
    const items = [andExpression()]
    while (peek() !== undefined && /^OR$/i.test(peek()!)) {
      next()
      items.push(andExpression())
    }
    return items.length === 1 ? items[0]! : { kind: 'or', items }
  }

  const tree = orExpression()
  if (position !== tokens.length) throw new Error(`unexpected ${peek()} in "${expression}"`)
  return tree
}

function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function evaluateId(id: string, policy: LicensePolicy): Evaluation {
  if (policy.allowed.some((allowed) => sameId(allowed, id))) return { verdict: 'allowed', reasons: [] }
  if (Object.keys(policy.pendingOwnerDecision).some((pending) => sameId(pending, id))) return { verdict: 'pending', reasons: [id] }
  // "Apache-2.0 WITH LLVM-exception": the exception only widens the permission, so the licence in front decides
  const withIndex = id.toUpperCase().indexOf(' WITH ')
  if (withIndex > 0) return evaluateId(id.slice(0, withIndex), policy)
  return { verdict: 'denied', reasons: [id] }
}

function evaluateNode(node: Node, policy: LicensePolicy): Evaluation {
  if (node.kind === 'id') return evaluateId(node.id, policy)
  const parts = node.items.map((item) => evaluateNode(item, policy))
  if (node.kind === 'or') {
    // One acceptable alternative is enough: the best one wins
    return parts.reduce((best, part) => (RANK[part.verdict] < RANK[best.verdict] ? part : best))
  }
  // AND: every part must be acceptable, the worst one decides; all reasons of that rank are kept
  const worst = Math.max(...parts.map((part) => RANK[part.verdict]))
  const verdict = (Object.keys(RANK) as Verdict[]).find((v) => RANK[v] === worst)!
  return { verdict, reasons: parts.filter((part) => RANK[part.verdict] === worst).flatMap((part) => part.reasons) }
}

/** The verdict for one licence string; anything that cannot be read as an expression (empty, UNKNOWN, "Siehe ...") is denied. */
export function evaluateLicense(license: string | null | undefined, policy: LicensePolicy): Evaluation {
  const text = (license ?? '').trim()
  if (text === '' || /^unknown$/i.test(text) || /^siehe\b/i.test(text) || /^see\b/i.test(text)) {
    return { verdict: 'denied', reasons: [text === '' ? '(no licence given)' : text] }
  }
  try {
    return evaluateNode(parse(text), policy)
  } catch {
    return { verdict: 'denied', reasons: [text] }
  }
}

export interface PolicyFinding {
  name: string
  version: string
  license: string
  verdict: Verdict
  reasons: string[]
}

/** The entries whose licence is not "allowed", with the reason; build tools that are not shipped never appear as entries. */
export function findIssues(entries: { name: string; version: string; license: string }[], policy: LicensePolicy): PolicyFinding[] {
  const issues: PolicyFinding[] = []
  for (const entry of entries) {
    const result = evaluateLicense(entry.license, policy)
    if (result.verdict !== 'allowed') issues.push({ name: entry.name, version: entry.version, license: entry.license, verdict: result.verdict, reasons: result.reasons })
  }
  return issues
}
