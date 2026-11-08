import test from 'node:test'
import assert from 'node:assert/strict'
import { splashFrames } from '../src/presentation/shell/splash-model'

test('splash B assembles bounded phone/tablet cards with six-point gutters and physical dock inset', () => {
  for (const [width, height, bottom] of [
    [320, 568, 0],
    [402, 874, 34],
    [768, 1024, 20],
  ] as const) {
    const frames = splashFrames(width, height, bottom)
    for (const card of frames) {
      for (const rect of [card.start, card.middle, card.end]) {
        assert.ok(Object.values(rect).every(Number.isFinite))
        assert.ok(
          rect.width >= 0 && rect.height >= 0 && rect.x >= 0 && rect.y >= 0,
        )
        assert.ok(rect.x + rect.width <= width + 0.001)
        assert.ok(rect.y + rect.height <= height + 0.001)
      }
    }
    const top = frames[0]!.end,
      pink = frames[1]!.end,
      green = frames[2]!.end,
      water = frames[3]!.end,
      dock = frames[4]!.end
    assert.ok(Math.abs(pink.y - top.y - top.height - 6) < 0.001)
    assert.equal(green.x - pink.x - pink.width, 6)
    assert.ok(Math.abs(water.y - pink.y - pink.height - 6) < 0.001)
    assert.ok(Math.abs(dock.y - water.y - water.height - 6) < 0.001)
    assert.equal(dock.y + dock.height, height)
  }
})
