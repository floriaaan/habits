import { createContext, useContext, type ReactNode } from 'react'
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context'

const DeviceInsets = createContext<EdgeInsets | null>(null)

// Mount above navigators: NativeTabs adds its tab bar to the screen's safe area.
// Card geometry needs the physical window insets, without that extra bar height.
export function DeviceInsetsProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <DeviceInsets.Provider value={insets}>{children}</DeviceInsets.Provider>
  )
}
export function useDeviceInsets() {
  const device = useContext(DeviceInsets),
    local = useSafeAreaInsets()
  return device ?? local
}
