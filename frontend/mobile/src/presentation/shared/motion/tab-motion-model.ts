import type { MorphRect } from './morph-geometry'
export type TabPath =
  | '/'
  | '/today'
  | '/progress'
  | '/profile'
  | '/login'
  | `/habit/${string}`
  | `/edit/${string}`
  | `/entry/${string}`
  | `/rest/${string}`
export interface CardTarget {
  targetOriginX: number
  targetOriginY: number
  targetGlobalOriginX: number
  targetGlobalOriginY: number
  targetWidth: number
  targetHeight: number
}
export function dockHeight(bottomInset: number) {
  return 56 + Math.max(bottomInset, 8)
}
export function visibleCardRect(
  rect: MorphRect,
  width: number,
  height: number,
): MorphRect | null {
  'worklet'
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return null
  const x = Math.max(0, rect.x),
    y = Math.max(0, rect.y)
  const right = Math.min(width, rect.x + rect.width),
    bottom = Math.min(height, rect.y + rect.height)
  return right - x >= Math.min(48, rect.width) &&
    bottom - y >= Math.min(48, rect.height)
    ? { x, y, width: right - x, height: bottom - y }
    : null
}
export function cardStartGeometry(from: MorphRect, target: CardTarget) {
  'worklet'
  return {
    originX: target.targetOriginX,
    originY: target.targetOriginY,
    // Ignore subpixel measurement noise when both cards already fill the row.
    width:
      Math.abs(from.width - target.targetWidth) < 2
        ? target.targetWidth
        : Math.max(
            target.targetWidth * 0.5,
            Math.min(target.targetWidth * 2, from.width),
          ),
    height: Math.max(
      target.targetHeight * 0.72,
      Math.min(target.targetHeight * 1.28, from.height),
    ),
  }
}

export function cardMotionKey(role: string, colors?: readonly unknown[]) {
  return colors ? 'color:' + colors.join(',') : role
}
export function scrolledVisibleCardRect(
  rect: MorphRect,
  scrollY: number,
  width: number,
  height: number,
) {
  return visibleCardRect({ ...rect, y: rect.y - scrollY }, width, height)
}

// Neutral surfaces are paired by visible vertical order, never by semantic role.
export function matchingCardSource(
  key: string,
  sources: Record<string, MorphRect>,
  destinations: Record<string, MorphRect>,
  initialOrder: number,
): MorphRect | undefined {
  'worklet'
  if (key.startsWith('color:')) return sources[key]
  const ordered = (cards: Record<string, MorphRect>) =>
    Object.entries(cards)
      .filter(([name]) => !name.startsWith('color:'))
      .sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x)
  const targets = ordered(destinations)
  const index = targets.findIndex(([name]) => name === key)
  return ordered(sources)[index < 0 ? initialOrder : index]?.[1]
}

export interface CardResizeTransition {
  id: number
  expiresAt: number
}
export interface AcceptedCardResize {
  id: number
  animated: boolean
}

// Expiry prevents a late start, never truncates a morph already in progress.
export function cardResizePhase(
  transition: CardResizeTransition | null,
  accepted: AcceptedCardResize | null,
  now: number,
): 'start' | 'retarget' | 'idle' {
  'worklet'
  if (!transition) return 'idle'
  if (accepted?.id === transition.id)
    return accepted.animated ? 'retarget' : 'idle'
  return now < transition.expiresAt ? 'start' : 'idle'
}

// Shared by the pre-focus frame and the tween: the first visible shape must
// already be its start shape, never the destination's 100% layout fallback.
export function pendingCardSize(
  transition: CardResizeTransition | null,
  accepted: AcceptedCardResize | null,
  source: MorphRect | null,
  target: { width: number; height: number },
  now: number,
) {
  'worklet'
  if (!source || cardResizePhase(transition, accepted, now) !== 'start')
    return null
  return cardStartGeometry(source, {
    targetOriginX: 0,
    targetOriginY: 0,
    targetGlobalOriginX: 0,
    targetGlobalOriginY: 0,
    targetWidth: target.width || source.width,
    targetHeight: target.height || source.height,
  })
}
