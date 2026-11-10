import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import '../../i18n'
import { DesignGallery } from './DesignGallery'

const IDS = ['classic', 'modern', 'plain', 'sidebar', 'timeline', 'compact', 'executive', 'elegant', 'banner', 'edge', 'grid', 'rail']

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('DesignGallery: rigid header line', () => {
  it('reserves the room of every design name and shows only the chosen one as text', () => {
    const designs = IDS.map((id) => ({ id }))
    const { container } = render(<DesignGallery designs={designs} value="classic" onChange={() => {}} />)
    const reserved = [...container.querySelectorAll('[data-reserved]')].map((node) => node.getAttribute('data-reserved'))
    for (const id of IDS) {
      const name = i18n.t(`profile.preview.designs.${id}`, { defaultValue: id })
      expect(reserved, id).toContain(name)
    }
    // The copies are no text in the page: the chosen name is found exactly once.
    expect(screen.getAllByText(i18n.t('profile.preview.designs.classic'))).toHaveLength(1)
  })
})
