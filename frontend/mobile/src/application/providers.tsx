import {
  focusManager,
  onlineManager,
  QueryClientProvider,
} from '@tanstack/react-query'
import * as Network from 'expo-network'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { useAppearancePreference } from './appearance'
import type { Runtime } from './ports'
import { queryClient } from './query-client'
import { useSessionController } from './useSessionController'
const Context = createContext<
  | ({ runtime: Runtime } & ReturnType<typeof useSessionController> &
      ReturnType<typeof useAppearancePreference>)
  | null
>(null)
export function Providers({
  runtime,
  children,
}: {
  runtime: Runtime
  children: ReactNode
}) {
  const auth = useSessionController(runtime),
    appearance = useAppearancePreference(runtime.appearance)
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active')
    const focus = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    )
    const network = Network.addNetworkStateListener((state) =>
      onlineManager.setOnline(state.isConnected !== false),
    )
    return () => {
      focus.remove()
      network.remove()
    }
  }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <Context.Provider value={{ runtime, ...auth, ...appearance }}>
        {children}
      </Context.Provider>
    </QueryClientProvider>
  )
}
export function useApp() {
  const context = useContext(Context)
  if (!context) throw new Error('Providers manquant')
  return context
}
