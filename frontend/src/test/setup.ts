import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { assumeEverythingSeen } from '../features/live-helper/storage'

// jsdom has none of these; components that read them get inert stand-ins.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// The live helper opens by itself in a browser that has never seen it; no other test wants a dialog it did not open. It is told in memory
// (a test may count what is in the storage). The helper's own tests forget this state when they need a first start.
beforeEach(() => {
  assumeEverythingSeen()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})
