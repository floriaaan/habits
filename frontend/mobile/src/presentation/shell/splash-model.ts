import type { MorphRect } from '../shared/motion/morph-geometry'
import { dockHeight } from '../shared/motion/tab-motion-model'

export interface SplashCardFrames {
  start: MorphRect
  middle: MorphRect
  end: MorphRect
}
export function splashFrames(
  width: number,
  height: number,
  bottomInset: number,
): SplashCardFrames[] {
  const column = Math.min(width, 700),
    x = (width - column) / 2 + 6,
    w = column - 12
  const dock = dockHeight(bottomInset),
    space = Math.max(0, height - dock - 24)
  const top = space * 0.53,
    middle = space * 0.25,
    water = space * 0.22
  const cx = width / 2,
    cy = height / 2,
    midWidth = Math.min(200, w)
  const bar = (y: number): MorphRect => ({
    x: cx - 36,
    y: cy + y,
    width: 72,
    height: 7,
  })
  const tile = (y: number, h: number): MorphRect => ({
    x: cx - midWidth / 2,
    y: cy + y,
    width: midWidth,
    height: h,
  })
  return [
    {
      start: { ...bar(-40), height: 0 },
      middle: tile(-160, 72),
      end: { x, y: 6, width: w, height: top },
    },
    {
      start: bar(-18),
      middle: tile(-82, 66),
      end: { x, y: top + 12, width: (w - 6) / 2, height: middle },
    },
    {
      start: bar(6),
      middle: tile(-10, 66),
      end: {
        x: x + (w + 6) / 2,
        y: top + 12,
        width: (w - 6) / 2,
        height: middle,
      },
    },
    {
      start: bar(30),
      middle: tile(62, 66),
      end: { x, y: top + middle + 18, width: w, height: water },
    },
    {
      start: { ...bar(54), height: 0 },
      middle: { ...tile(138, 0) },
      end: { x, y: height - dock, width: w, height: dock },
    },
  ]
}
