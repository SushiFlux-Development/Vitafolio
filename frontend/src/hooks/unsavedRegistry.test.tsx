import { act, render, renderHook, screen } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { FormDialog } from '../components/ui/FormDialog'
import { ConfirmProvider } from '../components/ui/ConfirmDialog'
import { hasUnsavedChanges, useHasUnsavedChanges, useRegisterUnsaved } from './unsavedRegistry'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

describe('unsaved input registry', () => {
  it('knows about input while a holder is mounted and forgets it afterwards', () => {
    expect(hasUnsavedChanges()).toBe(false)
    const first = renderHook(() => useRegisterUnsaved(true))
    const second = renderHook(() => useRegisterUnsaved(true))
    expect(hasUnsavedChanges()).toBe(true)
    first.unmount()
    // Another holder is still there.
    expect(hasUnsavedChanges()).toBe(true)
    second.unmount()
    expect(hasUnsavedChanges()).toBe(false)
  })

  it('follows the flag of a holder', () => {
    const { rerender, unmount } = renderHook(({ when }) => useRegisterUnsaved(when), { initialProps: { when: false } })
    expect(hasUnsavedChanges()).toBe(false)
    rerender({ when: true })
    expect(hasUnsavedChanges()).toBe(true)
    rerender({ when: false })
    expect(hasUnsavedChanges()).toBe(false)
    unmount()
  })

  it('tells components that watch it', () => {
    const watcher = renderHook(() => useHasUnsavedChanges())
    expect(watcher.result.current).toBe(false)
    let holder: ReturnType<typeof renderHook>
    act(() => {
      holder = renderHook(() => useRegisterUnsaved(true))
    })
    expect(watcher.result.current).toBe(true)
    act(() => holder.unmount())
    expect(watcher.result.current).toBe(false)
  })

  it('counts an open form dialog with typed input as unsaved, and a clean or closed one not', () => {
    const view = (open: boolean, dirty: boolean) => (
      <ConfirmProvider>
        <FormDialog open={open} dirty={dirty} onClose={vi.fn()} onSubmit={vi.fn()} title="Form">
          <p>fields</p>
        </FormDialog>
      </ConfirmProvider>
    )
    const { rerender, unmount } = render(view(true, false))
    expect(screen.getByRole('dialog', { name: 'Form' })).toBeInTheDocument()
    expect(hasUnsavedChanges()).toBe(false)
    rerender(view(true, true))
    expect(hasUnsavedChanges()).toBe(true)
    rerender(view(false, true))
    expect(hasUnsavedChanges()).toBe(false)
    unmount()
    expect(hasUnsavedChanges()).toBe(false)
  })
})
