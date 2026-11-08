export interface MorphRect {
  x: number
  y: number
  width: number
  height: number
}
export function morphRectFits(rect: MorphRect, width: number, height: number) {
  return (
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= width + 2 &&
    rect.y + rect.height <= height + 2
  )
}
