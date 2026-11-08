import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useTheme } from '../ui/theme'

export function TabFrame({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <View
        style={{ flex: 1, width: '100%', maxWidth: 700, alignSelf: 'center' }}
      >
        {children}
      </View>
    </View>
  )
}
