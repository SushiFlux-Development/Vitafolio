import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ConfirmProvider } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { FormDialog } from './FormDialog'
import { ItemActions } from './ItemActions'
import { Segmented } from './Segmented'
import { Tabs } from './Tabs'
import { PdfPreview } from './PdfPreview'
import { LiveTextField } from './LiveTextField'
import { requiredField } from '../../validation/rules'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

describe('Dialog stack', () => {
  function Nested({ onOuterClose, onInnerClose }: { onOuterClose: () => void; onInnerClose: () => void }) {
    return (
      <Dialog open onClose={onOuterClose} title="Außen">
        <p>außen</p>
        <Dialog open onClose={onInnerClose} title="Innen">
          <p>innen</p>
        </Dialog>
      </Dialog>
    )
  }

  it('closes only the topmost dialog on Esc, then the next one', async () => {
    const outer = vi.fn()
    const inner = vi.fn()
    const { rerender } = render(<Nested onOuterClose={outer} onInnerClose={inner} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()

    // The inner one is gone (the caller closed it): the next Esc belongs to the outer dialog.
    function OuterOnly() {
      return (
        <Dialog open onClose={outer} title="Außen">
          <p>außen</p>
        </Dialog>
      )
    }
    rerender(<OuterOnly />)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(outer).toHaveBeenCalledTimes(1))
    expect(inner).toHaveBeenCalledTimes(1)
  })
})

describe('Segmented', () => {
  function Harness() {
    const [value, setValue] = useState<'a' | 'b' | 'c'>('a')
    return (
      <Segmented
        label="Wahl"
        value={value}
        onChange={setValue}
        options={[
          { value: 'a', label: 'Eins' },
          { value: 'b', label: 'Zwei' },
          { value: 'c', label: 'Drei' },
        ]}
      />
    )
  }

  it('is one tab stop and moves the choice with the arrow keys, wrapping around', async () => {
    render(<Harness />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])

    radios[0]!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Zwei' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Zwei' })).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Drei' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Drei' })).toHaveFocus()
  })
})

describe('Tabs', () => {
  it('scrolls sideways instead of wrapping and shows a badge next to the label', () => {
    render(
      <Tabs
        label="Bereiche"
        active="b"
        onChange={() => undefined}
        tabs={[
          { id: 'a', label: 'Eins' },
          { id: 'b', label: 'Zwei', badge: 3 },
        ]}
      />,
    )
    expect(screen.getByRole('tablist').className).toContain('overflow-x-auto')
    expect(screen.getByRole('tab', { name: /Zwei/ })).toHaveTextContent('3')
    expect(screen.getByRole('tab', { name: /Zwei/ }).className).toContain('whitespace-nowrap')
  })
})

describe('ItemActions', () => {
  it('names every button after its entry, so a list of entries has no two identical buttons', () => {
    render(<ItemActions itemName="Entwickler" editLabel="Station bearbeiten" deleteLabel="Station löschen" onEdit={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Station bearbeiten: Entwickler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Station löschen: Entwickler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nach oben verschieben: Entwickler' })).toBeInTheDocument()
  })
})

describe('FormDialog', () => {
  function Harness({ dirty, onSubmit, onClose }: { dirty: boolean; onSubmit: () => void; onClose: () => void }) {
    const [name, setName] = useState('')
    return (
      <ConfirmProvider>
        <FormDialog open title="Eintrag" onClose={onClose} onSubmit={onSubmit} dirty={dirty}>
          <LiveTextField label="Name" value={name} onValueChange={setName} check={requiredField} />
        </FormDialog>
      </ConfirmProvider>
    )
  }

  it('is not closed by a click beside it', () => {
    const onClose = vi.fn()
    render(<Harness dirty={false} onSubmit={vi.fn()} onClose={onClose} />)
    const overlay = screen.getByRole('dialog').parentElement!
    fireEvent.mouseDown(overlay)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks before it throws away typed input, and stays open when the user keeps it', async () => {
    const onClose = vi.fn()
    render(<Harness dirty onSubmit={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    const question = await screen.findByRole('alertdialog')
    expect(within(question).getByText('Änderungen verwerfen?')).toBeInTheDocument()
    fireEvent.click(within(question).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Verwerfen' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('closes without a question when nothing was typed', async () => {
    const onClose = vi.fn()
    render(<Harness dirty={false} onSubmit={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('submits with the footer button although it sits outside the form element, and with Enter', async () => {
    const onSubmit = vi.fn()
    render(<Harness dirty={false} onSubmit={onSubmit} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    await userEvent.type(screen.getByLabelText('Name'), 'x{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('shows the required problem while typing, before anything is pressed', async () => {
    render(<Harness dirty={false} onSubmit={vi.fn()} onClose={vi.fn()} />)
    const field = screen.getByLabelText('Name')
    await userEvent.type(field, 'a')
    expect(screen.queryByText('Bitte ausfüllen.')).toBeNull()
    await userEvent.clear(field)
    expect(screen.getByText('Bitte ausfüllen.')).toBeInTheDocument()
  })
})

describe('PdfPreview', () => {
  const base = { url: null, loading: false, error: null, refresh: vi.fn() }

  it('embeds the PDF as a frame (never an object) and keeps showing it while a new one renders', () => {
    const { container, rerender } = render(<PdfPreview preview={{ ...base, url: 'blob:x' }} title="Vorschau" />)
    // The viewer starts without the thumbnail sidebar and with the page fitted to the width
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe('blob:x#navpanes=0&view=FitH')
    expect(container.querySelector('object, embed')).toBeNull()

    rerender(<PdfPreview preview={{ ...base, url: 'blob:x', loading: true }} title="Vorschau" />)
    expect(container.querySelector('iframe')).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Vorschau wird erzeugt');
  })

  it('shows the complete error instead of the frame, with a retry', () => {
    const refresh = vi.fn()
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <PdfPreview preview={{ url: 'blob:old', loading: false, error: new Error('Typst: Zeile 3'), refresh }} title="Vorschau" />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(refresh).toHaveBeenCalled()
  })
})
