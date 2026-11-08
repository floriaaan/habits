import type { ReactNode } from 'react'
import { View } from 'react-native'

// Keep a standard native View: ScrollViewMarker requires a Gamma-enabled build.
// Scroll-edge configuration stays on the stable root Stack API.
export function ScrollViewport({
  children,
}: {
  children: NonNullable<ReactNode>
}) {
  return <View style={{ flex: 1 }}>{children}</View>
}
