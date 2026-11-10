import { describe, expect, it } from 'vitest'
import type { GuideAnswers, GuideExplain } from '../../api/types'
import { contentFor } from './content'
import type { GuideContent } from './content'
import { contentDe } from './content.de'
import { contentEn } from './content.en'
import { EXPLAINS, REGIONS, SITUATIONS } from './model'
import { OVERVIEW_IDS } from './overview'
import { BLOCK_IDS, EXTERNAL_LINK_TARGETS, ITEM_IDS, LINK_TARGETS, buildPlan } from './plan'
import type { ItemId, ItemKind } from './plan'

const LANGUAGES: [string, GuideContent][] = [
  ['German', contentDe],
  ['English', contentEn],
]

/** Every combination the wizard can produce (and a few it cannot, to be safe), with years around each limit of the rules. */
function* everyAnswer(): Generator<GuideAnswers> {
  const years = [null, 0, 1, 2, 4, 5, 9, 10, 15, 21, 31, 60]
  const subsets: GuideExplain[][] = []
  for (let mask = 0; mask < 1 << EXPLAINS.length; mask++) subsets.push(EXPLAINS.filter((_, index) => (mask & (1 << index)) !== 0))
  for (const situation of SITUATIONS) {
    for (const yearsOfExperience of years) {
      for (const plan of ['same_field', 'new_field', 'first_job'] as const) {
        for (const explain of subsets) for (const region of REGIONS) yield { situation, yearsOfExperience, plan, explain, region }
      }
    }
  }
}

describe('what the plan can contain', () => {
  const kinds = new Map<ItemId, Set<ItemKind>>()
  const seenBlocks = new Set<string>()
  const known = new Set<string>(ITEM_IDS)
  const unknown = new Set<string>()
  for (const answers of everyAnswer()) {
    for (const block of buildPlan(answers).blocks) {
      seenBlocks.add(block.id)
      for (const item of block.items) {
        if (!known.has(item.id)) unknown.add(item.id)
        const set = kinds.get(item.id) ?? new Set<ItemKind>()
        set.add(item.kind)
        kinds.set(item.id, set)
      }
    }
  }

  it('uses only ids that have a text', () => {
    expect([...unknown]).toEqual([])
  })

  it('uses every text somewhere (no text that no answer can reach)', () => {
    expect(ITEM_IDS.filter((id) => !kinds.has(id))).toEqual([])
  })

  it('gives an item the same firmness whatever the answers are', () => {
    expect([...kinds].filter(([, set]) => set.size > 1).map(([id]) => id)).toEqual([])
  })

  it('uses every block somewhere', () => {
    expect(BLOCK_IDS.filter((id) => !seenBlocks.has(id))).toEqual([])
  })
})

describe.each(LANGUAGES)('%s wording', (_name, content) => {
  it('has a text for every item and no text for an item that does not exist', () => {
    expect(Object.keys(content.items).sort()).toEqual([...ITEM_IDS].sort())
    for (const id of ITEM_IDS) expect(content.items[id].text.trim().length, id).toBeGreaterThan(5)
  })

  it('has a title and a sentence for every block, a label for every link and every kind', () => {
    for (const id of BLOCK_IDS) {
      expect(content.blocks[id].title).not.toBe('')
      expect(content.blocks[id].intro).not.toBe('')
    }
    for (const id of Object.keys(LINK_TARGETS)) expect(content.links[id as keyof typeof LINK_TARGETS], id).toBeTruthy()
    for (const id of Object.keys(EXTERNAL_LINK_TARGETS)) expect(content.externalLinks[id as keyof typeof EXTERNAL_LINK_TARGETS], id).toBeTruthy()
    for (const kind of Object.keys(content.kinds) as ItemKind[]) {
      expect(content.kinds[kind]).not.toBe('')
      expect(content.kindHelp[kind]).not.toBe('')
    }
  })

  it('has an example and a tab for every case of the overview', () => {
    for (const id of OVERVIEW_IDS) {
      expect(content.overview.tabs[id], id).toBeTruthy()
      expect(content.overview.examples[id], id).toBeTruthy()
    }
  })

  it('has a label for every choice of every question', () => {
    for (const value of SITUATIONS) expect(content.wizard.situation.options[value].label).toBeTruthy()
    for (const value of REGIONS) expect(content.wizard.region.options[value].label).toBeTruthy()
    for (const value of EXPLAINS) expect(content.wizard.explain.options[value].label).toBeTruthy()
    expect(content.wizard.explain.options.none.label).toBeTruthy()
    expect(content.wizard.stepOf(2, 5)).toMatch(/2/)
    expect(content.wizard.stepOf(2, 5)).toMatch(/5/)
  })

  it('has no placeholder left over and no empty point', () => {
    for (const [id, text] of Object.entries(content.items)) {
      expect(text.text, id).not.toMatch(/\{\{|undefined|TODO/)
      for (const point of text.points ?? []) expect(point.trim(), id).not.toBe('')
    }
  })

  it('keeps to the claims the project allows: no "normgerecht", no "revisionssicher", no "Zero-Trust", no legal advice', () => {
    const all = JSON.stringify([content.items, content.plan, content.intro, content.overview])
    expect(all).not.toMatch(/normgerecht|DIN[- ]konform|revisionssicher|Zero-Trust|compliant|rechtssicher|legally safe/i)
  })

  it('says the figures are rules of thumb and that this is not legal advice', () => {
    expect(content.plan.disclaimer.toLowerCase()).toMatch(/faustregel|rules? of thumb/)
    expect(content.plan.disclaimerTitle.toLowerCase()).toMatch(/rechtsberatung|legal advice/)
  })

  it('gives no example that resembles a career of the project owner', () => {
    const all = JSON.stringify(content)
    expect(all).not.toMatch(/Informatik|Systemadmin|Fachinformatiker|IT-Admin|sysadmin|computer science|coding/i)
  })
})

describe('both languages', () => {
  it('have the same number of points under every text', () => {
    for (const id of ITEM_IDS) {
      expect(contentEn.items[id].points?.length ?? 0, id).toBe(contentDe.items[id].points?.length ?? 0)
    }
  })

  it('are chosen by the interface language, German as the fallback', () => {
    expect(contentFor('en')).toBe(contentEn)
    expect(contentFor('en-GB')).toBe(contentEn)
    expect(contentFor('de')).toBe(contentDe)
    expect(contentFor('fr')).toBe(contentDe)
  })
})

describe('the pension insurance history', () => {
  it('is said to apply to Germany only, in both languages', () => {
    expect(contentDe.items['find.drv'].text).toMatch(/Nur für Deutschland/)
    expect(contentEn.items['find.drv'].text).toMatch(/Germany only/)
  })

  it('does not claim that school periods are in it', () => {
    expect(contentDe.items['find.drv'].text).toMatch(/Schulzeiten[^.]*nicht belegt/)
    expect(contentEn.items['find.drv'].text).toMatch(/school periods[^.]*not proven/)
  })

  it('says the pages are German in the English labels', () => {
    expect(contentEn.externalLinks.drvRequest).toMatch(/German/)
    expect(contentEn.externalLinks.drvGlossary).toMatch(/German/)
  })
})
