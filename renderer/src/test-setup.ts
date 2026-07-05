// Vitest setup for renderer component tests: adds @testing-library/jest-dom
// matchers (toBeInTheDocument, toHaveClass, …) and auto-cleans the DOM.
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom lacks ResizeObserver (react-resizable-panels observes pane sizes).
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub
}

// jsdom lacks matchMedia (xterm.js calls it on construction) and other browser
// APIs xterm touches. Stub the minimum so components mount in tests.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

afterEach(() => cleanup())
