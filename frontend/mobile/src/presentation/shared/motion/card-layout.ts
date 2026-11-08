import type { ViewStyle } from 'react-native'

// Padding belongs to a Fabric View, never to the legacy native MaskedView:
// Fabric insets that component's native contentView by its padding already.
export function cardLayout(style: ViewStyle = {}) {
  const frame = { ...style }
  const content: ViewStyle = { flexGrow: 1 }
  for (const key of Object.keys(style) as (keyof ViewStyle)[]) {
    if (
      key.startsWith('padding') ||
      [
        'gap',
        'rowGap',
        'columnGap',
        'flexDirection',
        'flexWrap',
        'justifyContent',
        'alignItems',
        'alignContent',
      ].includes(key)
    ) {
      Object.assign(content, { [key]: style[key] })
      delete frame[key]
    }
  }
  return { frame, content }
}
