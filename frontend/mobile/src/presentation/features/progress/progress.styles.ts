import { StyleSheet } from 'react-native'
export const s = StyleSheet.create({
  frame: { flex: 1, width: '100%', maxWidth: 700, alignSelf: 'center' },
  card: { borderRadius: 26, padding: 18 },
  clip: { overflow: 'hidden' },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
