import { Platform } from 'react-native'

// iOS exposes safe areas, not the physical display radius. Approximate the
// inset screen contour on phones; tablet columns retain their card corners.
export function deviceCornerRadius(topInset: number, width: number) {
  return Platform.OS === 'ios' && width < 700
    ? Math.max(28, Math.min(60, topInset - 6))
    : 28
}
