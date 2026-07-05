// App root smoke: resolves the browser-fallback Host (no window.cluHost in
// jsdom), renders the shell, and mirrors the persisted theme onto <html>.
import { render, screen, waitFor } from '@testing-library/react'
import { App } from './App'

describe('App shell', () => {
  it('renders the cockpit (welcome state) outside Electron', async () => {
    render(<App />)
    expect(screen.getByText('CLU')).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('applies the theme to <html data-theme>', async () => {
    render(<App />)
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('kiro-dark'),
    )
  })
})
