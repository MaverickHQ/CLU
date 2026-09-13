// App root: resolves the Host (Electron bridge vs browser fallback), creates
// the store once, hydrates persisted state, and mirrors the theme onto <html>
// so [data-theme] CSS applies app-wide.

import { useEffect, useState } from 'react'
import { CockpitProvider } from './store/context'
import { createCockpitStore } from './store/cockpit'
import { createBrowserHost } from './host/browserHost'
import { createElectronHost, isElectron } from './host/electronHost'
import { wireEnvExport, wirePinStaleness } from './pins/wire'
import { createTerminalSessions } from './terminal/sessions'
import { wireFocusTab, wireQuit, wireTerminals } from './terminal/wire'
import { Cockpit } from './components/Cockpit'
import { IconSprite } from './components/Icons'
import { installTestHook } from './testHook'

export function App(): React.JSX.Element {
  const [ctx] = useState(() => {
    const host = isElectron() ? createElectronHost(window.cluHost!) : createBrowserHost()
    const store = createCockpitStore({ host })
    const sessions = createTerminalSessions({ host })
    wireTerminals(store, sessions)
    wireQuit(store, sessions, host)
    wireFocusTab(store, host)
    wireEnvExport(store, host)
    wirePinStaleness(store, host)
    // e2e/devtools hook — dev + e2e builds only, never production (S3).
    installTestHook(window as unknown as Record<string, unknown>, store)
    return { host, store, sessions }
  })

  useEffect(() => {
    void ctx.store.getState().hydrate()
    const applyTheme = (theme: string) =>
      document.documentElement.setAttribute('data-theme', theme)
    applyTheme(ctx.store.getState().theme)
    return ctx.store.subscribe((s, prev) => {
      if (s.theme !== prev.theme) applyTheme(s.theme)
    })
  }, [ctx])

  return (
    <CockpitProvider store={ctx.store} host={ctx.host} sessions={ctx.sessions}>
      <IconSprite />
      <Cockpit />
    </CockpitProvider>
  )
}
