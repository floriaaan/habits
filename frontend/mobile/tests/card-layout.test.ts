import test from 'node:test'
import assert from 'node:assert/strict'
import { cardLayout } from '../src/presentation/shared/motion/card-layout'

test('safe-area and card padding apply once inside the mask, not to its native frame', () => {
  const original = {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 74,
    minHeight: 410,
    borderRadius: 26,
    borderTopLeftRadius: 56,
    backgroundColor: '#fafafa',
  }
  const { frame, content } = cardLayout(original)
  assert.deepEqual(frame, {
    minHeight: 410,
    borderRadius: 26,
    borderTopLeftRadius: 56,
    backgroundColor: '#fafafa',
  })
  assert.deepEqual(content, {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 74,
  })
  assert.equal(original.paddingTop, 74)
})

test('colored cards keep row sizing outside and child spacing inside the mask', () => {
  const { frame, content } = cardLayout({
    flex: 1,
    minHeight: 190,
    marginBottom: 6,
    padding: 16,
    paddingEnd: 18,
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 26,
    overflow: 'hidden',
  })
  assert.deepEqual(frame, {
    flex: 1,
    minHeight: 190,
    marginBottom: 6,
    borderRadius: 26,
    overflow: 'hidden',
  })
  assert.deepEqual(content, {
    flexGrow: 1,
    padding: 16,
    paddingEnd: 18,
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  })
})
