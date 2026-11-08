import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEntryEdit,
  entryDraft,
  entryWriteAttempt,
} from '../src/presentation/features/activity/entry-edit-model'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'

async function fixture(timezone = 'Europe/Paris') {
  const connector = new FakeHabitsConnector()
  const habit = await connector.createHabit({
    name: 'Courir',
    category: 'sport',
    kind: 'quantity',
    unit: 'meters',
    target: 5000,
    timezone,
  })
  const entry = await connector.recordEntry(
    habit.id,
    { occurred_at: '2026-01-12T17:42:38.123Z', value: 3000 },
    { key: 'initial' },
  )
  return { connector, habit, entry }
}
test('entry editing converts units, preserves exact untouched timestamps and rejects invalid values', async () => {
  const { habit, entry } = await fixture(),
    draft = entryDraft(entry, habit)
  assert.equal(draft.time, '18:42')
  assert.deepEqual(buildEntryEdit(entry, habit, draft), {
    value: 3000,
    occurred_at: entry.occurred_at,
  })
  assert.deepEqual(buildEntryEdit(entry, habit, { ...draft, value: '4,2' }), {
    value: 4200,
    occurred_at: entry.occurred_at,
  })
  for (const value of ['', '0', '-1', 'Infinity', '1e15'])
    assert.throws(() => buildEntryEdit(entry, habit, { ...draft, value }))
  for (const date of ['2026-02-30', '1969-12-31', '2999-01-01'])
    assert.throws(() => buildEntryEdit(entry, habit, { ...draft, date }))
  const counted = {
    ...habit,
    kind: 'frequency' as const,
    unit: 'count' as const,
  }
  assert.equal(
    buildEntryEdit({ ...entry, value: 1 }, counted, { ...draft, value: '50' })
      .value,
    1,
  )
})
test('entry dates use habit timezone, reject missing and repeated DST hours and support fractional offsets', async () => {
  const { habit, entry } = await fixture(),
    draft = entryDraft(entry, habit)
  assert.equal(
    buildEntryEdit(entry, habit, {
      ...draft,
      date: '2026-07-12',
      time: '18:42',
    }).occurred_at,
    '2026-07-12T16:42:00.000Z',
  )
  assert.throws(
    () =>
      buildEntryEdit(entry, habit, {
        ...draft,
        date: '2026-03-29',
        time: '02:30',
      }),
    /n’existe pas/,
  )
  assert.throws(
    () =>
      buildEntryEdit(entry, habit, {
        ...draft,
        date: '2026-10-25',
        time: '02:30',
      }),
    /ambiguë/,
  )
  assert.equal(
    buildEntryEdit(
      entry,
      { ...habit, timezone: 'Asia/Kathmandu' },
      { ...draft, time: '18:00' },
    ).occurred_at,
    '2026-01-12T12:15:00.000Z',
  )
})
test('correct and cancel support stable retry keys and refresh derived progress', async () => {
  const { connector, habit, entry } = await fixture('UTC')
  const input = buildEntryEdit(entry, habit, {
    ...entryDraft(entry, habit),
    value: '5',
  })
  await connector.correctEntry(entry.id, input, { key: 'correction' })
  await connector.correctEntry(entry.id, input, { key: 'correction' })
  assert.equal((await connector.getEntry(entry.id)).value, 5000)
  assert.equal(
    (await connector.listEntries(habit.id, { limit: 100, offset: 0 })).items
      .length,
    1,
  )
  await connector.cancelEntry(entry.id, { key: 'cancel' })
  await connector.cancelEntry(entry.id, { key: 'cancel' })
  assert.equal(
    (await connector.listEntries(habit.id, { limit: 100, offset: 0 })).items
      .length,
    0,
  )
})

test('only consecutive retries share a key; A to B to A applies A again after lost responses', async () => {
  const { connector, entry } = await fixture()
  let sequence = 0
  const createKey = () => `attempt-${++sequence}`
  const a = { value: 4000, occurred_at: entry.occurred_at }
  const b = { ...a, value: 5000 }
  const first = entryWriteAttempt(null, JSON.stringify(a), createKey)
  await connector.correctEntry(entry.id, a, first)
  assert.equal(
    entryWriteAttempt(first, JSON.stringify(a), createKey).key,
    first.key,
  )
  const second = entryWriteAttempt(first, JSON.stringify(b), createKey)
  await connector.correctEntry(entry.id, b, second)
  const third = entryWriteAttempt(second, JSON.stringify(a), createKey)
  assert.notEqual(third.key, first.key)
  await connector.correctEntry(entry.id, a, third)
  assert.equal((await connector.getEntry(entry.id)).value, 4000)
})
