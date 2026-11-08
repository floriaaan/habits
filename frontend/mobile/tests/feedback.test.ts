import assert from 'node:assert/strict'
import test from 'node:test'
import { focusedScrollOffset } from '../src/presentation/shared/forms/keyboard-geometry'
import { buttonOutcome } from '../src/presentation/shared/ui/button-outcome'

test('focused form input scrolls above the keyboard and accounts for a clipped floating card', () => {
  assert.equal(focusedScrollOffset(0, 500, 48, 0, 800, 560), 4)
  assert.equal(focusedScrollOffset(30, 480, 48, 380, 130, 560), 64)
  assert.equal(focusedScrollOffset(50, 390, 48, 380, 130, 560), 44)
  assert.equal(focusedScrollOffset(0, 200, 48, 0, 800, 560), 0)
  assert.equal(focusedScrollOffset(10, 100, 48, 500, 20, 510), 10)
})

test('button waits for the actual operation and distinguishes handled, query and rejected failures', async () => {
  let resolve!: (value: unknown) => void
  const outcome = buttonOutcome(
    new Promise((value) => {
      resolve = value
    }),
  )
  let finished = false
  void outcome.then(() => {
    finished = true
  })
  await Promise.resolve()
  assert.equal(finished, false)
  resolve(true)
  assert.equal(await outcome, 'success')
  assert.equal(await buttonOutcome(Promise.resolve(false)), 'error')
  assert.equal(await buttonOutcome(Promise.resolve({ isError: true })), 'error')
  assert.equal(
    await buttonOutcome(Promise.resolve({ isError: false })),
    'success',
  )
  assert.equal(
    await buttonOutcome(Promise.reject(new Error('network'))),
    'error',
  )
})
