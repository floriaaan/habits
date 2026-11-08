import test from 'node:test'
import assert from 'node:assert/strict'
import { smoothLinePaths } from '../src/presentation/shared/charts/chart-model'

test('smooth curves pass through actual values and stay within neighboring endpoints', () => {
  const values = [0, 90, 20, 20, 100, 40, 58]
  const path = smoothLinePaths(values)[0]!
  assert.equal((path.match(/ C /g) ?? []).length, values.length - 1)
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
  let previousX = numbers[0]!,
    previousY = numbers[1]!
  for (let i = 2, day = 1; i < numbers.length; i += 6, day++) {
    const [cx1, cy1, cx2, cy2, x, y] = numbers.slice(i, i + 6) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    assert.ok(Math.abs(y - (48 - values[day]! * 0.42)) < 0.001)
    assert.ok(cx1 >= previousX && cx2 <= x && cx1 <= cx2)
    for (let step = 0; step <= 50; step++) {
      const t = step / 50,
        v =
          (1 - t) ** 3 * previousY +
          3 * (1 - t) ** 2 * t * cy1 +
          3 * (1 - t) * t * t * cy2 +
          t ** 3 * y
      assert.ok(
        v >= Math.min(previousY, y) - 0.001 &&
          v <= Math.max(previousY, y) + 0.001,
      )
    }
    previousX = x
    previousY = y
  }
})
test('smooth graph preserves missing-day gaps and ignores non-finite values', () => {
  const paths = smoothLinePaths([30, 50, null, 70, 40, NaN, 100])
  assert.equal(paths.length, 2)
  assert.ok(paths[0]!.startsWith('M 0 '))
  assert.ok(paths[1]!.startsWith('M 50 '))
  assert.deepEqual(smoothLinePaths([null, 20, null]), [])
})
