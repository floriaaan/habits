import assert from 'node:assert/strict'
import test from 'node:test'
import {
  nativePickerOutput,
  nativePickerValue,
  weekLabel,
} from '../src/presentation/shared/forms/date-field-model'

test('native date values round-trip calendar days across DST and extreme timezone offsets', () => {
  for (const date of [
    '1970-01-01',
    '2024-02-29',
    '2026-03-29',
    '2026-10-25',
    '2027-01-01',
    '9999-12-31',
  ]) {
    assert.equal(nativePickerOutput(nativePickerValue(date)), date)
    assert.equal(nativePickerValue(date).getUTCHours(), 12)
  }
  assert.equal(
    nativePickerOutput(new Date('2026-03-29T00:00:00Z')),
    '2026-03-29',
  )
  assert.equal(
    nativePickerOutput(
      nativePickerValue('', false, new Date('2026-12-31T23:59:00Z')),
    ),
    '2026-12-31',
  )
  const stamp = '2026-11-08T18:42:38.123Z'
  assert.equal(nativePickerOutput(nativePickerValue(stamp, true), true), stamp)
})
test('week heading represents displayed dates and distinguishes adjacent weeks and years', () => {
  assert.match(weekLabel('2026-11-08'), /2.*8.*nov.*2026/)
  assert.equal(weekLabel('2026-11-02'), weekLabel('2026-11-08'))
  assert.notEqual(weekLabel('2026-11-08'), weekLabel('2026-11-09'))
  assert.match(weekLabel('2027-01-01'), /2026.*2027/)
  assert.doesNotThrow(() => weekLabel('9999-12-31'))
})

test('week heading works when the native runtime has no formatRange', () => {
  const prototype = Intl.DateTimeFormat.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'formatRange')!
  Object.defineProperty(prototype, 'formatRange', {
    configurable: true,
    value: undefined,
  })
  try {
    assert.match(weekLabel('2026-11-08'), /2.*8.*nov.*2026/)
    assert.match(weekLabel('2027-01-01'), /2026.*2027/)
  } finally {
    Object.defineProperty(prototype, 'formatRange', descriptor)
  }
})
