import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import { StyleSheet, Text, type TextProps } from 'react-native'
import { useTheme } from './theme'

export function Icon({
  name,
  color,
  size = 26,
}: {
  name: SymbolViewProps['name']
  color: string
  size?: number
}) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      style={{ width: size, height: size }}
    />
  )
}
export function Copy({ style, ...props }: TextProps) {
  const theme = useTheme()
  return (
    <Text {...props} style={[{ color: theme.text, fontSize: 17 }, style]} />
  )
}
export const ui = StyleSheet.create({
  title: { fontSize: 36, fontWeight: '700', letterSpacing: -0.7 },
  heading: { fontSize: 21, fontWeight: '600', letterSpacing: -0.3 },
  caption: { fontSize: 14 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#899296',
    minHeight: 48,
    padding: 12,
    fontSize: 17,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  error: { paddingVertical: 10 },
})
