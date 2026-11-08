import test from 'node:test'
import assert from 'node:assert/strict'
import { morphRectFits } from '../src/presentation/shared/motion/morph-geometry'

test('morph falls back for hidden, stale or invalid native measurements', () => {
  const card = { x: 22, y: 200, width: 358, height: 48 }
  assert.equal(morphRectFits(card, 402, 874), true)
  assert.equal(morphRectFits({ ...card, width: 0 }, 402, 874), false)
  assert.equal(morphRectFits({ ...card, x: NaN }, 402, 874), false)
  assert.equal(morphRectFits({ ...card, y: -40 }, 402, 874), false)
  assert.equal(morphRectFits(card, 320, 640), false)
  assert.equal(morphRectFits({ ...card, y: 850 }, 402, 874), false)
})
