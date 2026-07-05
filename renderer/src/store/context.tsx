// React bindings for the cockpit store + Host + terminal sessions (created
// outside React, provided here). Components consume state via
// useCockpit(selector) and services via useHost()/useSessions() — never
// Electron APIs directly (the Layer-1 rule).

import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import type { Host } from '@shared/host'
import type { CockpitState } from './cockpit'
import type { TerminalSessions } from '../terminal/sessions'

interface CockpitContextValue {
  store: StoreApi<CockpitState>
  host: Host
  sessions: TerminalSessions
}

const CockpitContext = createContext<CockpitContextValue | null>(null)

export function CockpitProvider(props: {
  store: StoreApi<CockpitState>
  host: Host
  sessions: TerminalSessions
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <CockpitContext.Provider
      value={{ store: props.store, host: props.host, sessions: props.sessions }}
    >
      {props.children}
    </CockpitContext.Provider>
  )
}

function useCockpitContext(): CockpitContextValue {
  const ctx = useContext(CockpitContext)
  if (!ctx) throw new Error('CockpitProvider missing above this component')
  return ctx
}

export function useCockpit<T>(selector: (state: CockpitState) => T): T {
  return useStore(useCockpitContext().store, selector)
}

export function useHost(): Host {
  return useCockpitContext().host
}

export function useSessions(): TerminalSessions {
  return useCockpitContext().sessions
}
