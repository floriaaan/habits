import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calendarDate,
  shiftDay,
  validRestDate,
  weekDays,
} from '../src/domain/calendar'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'
import { loadJournal } from '../src/application/journal'
import { journalDay } from '../src/presentation/features/today/today-model'

test('rest dates respect leap years and habit timezone without device timezone drift', () => {
  for (const date of ['2024-02-29', '1970-01-01', '9999-12-31'])
    assert.ok(validRestDate(date))
  for (const date of [
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '1969-12-31',
    'bad',
    '2026-1-01',
  ])
    assert.equal(validRestDate(date), false)
  assert.equal(
    calendarDate('Pacific/Kiritimati', new Date('2026-12-31T12:30:00Z')),
    '2027-01-01',
  )
  assert.equal(weekDays('2026-11-08')[0], '2026-11-02')
})
test('rest and removal are repeatable, preserve entries and recompute journal eligibility and XP', async () => {
  const c = new FakeHabitsConnector()
  const habit = await c.createHabit({
    name: 'Lire',
    category: 'mind',
    kind: 'boolean',
    unit: 'count',
    target: 1,
    timezone: 'UTC',
  })
  const entry = await c.recordEntry(
    habit.id,
    { value: 1, occurred_at: new Date().toISOString() },
    { key: 'read' },
  )
  const before = await c.getDashboard(),
    date = before.date
  const load = async () => {
    const dashboard = await c.getDashboard()
    return journalDay(
      await loadJournal(
        c,
        dashboard.groups.flatMap((g) => g.habits),
        {},
      ),
      date,
    )
  }
  assert.equal((await load()).resting.length, 0)
  assert.equal((await c.getGamification()).xp, 10)
  await c.setRest(habit.id, date)
  await c.setRest(habit.id, date)
  const resting = await load()
  assert.equal(resting.resting.length, 1)
  assert.equal(
    resting.items.find((i) => i.habit.id === habit.id)!.eligible,
    false,
  )
  assert.equal(resting.events[0]!.entry.id, entry.id)
  assert.equal((await c.getGamification()).xp, 0)
  await c.removeRest(habit.id, date)
  await c.removeRest(habit.id, date)
  const resumed = await load()
  assert.equal(resumed.resting.length, 0)
  assert.equal(
    resumed.items.find((i) => i.habit.id === habit.id)!.eligible,
    true,
  )
  assert.equal(resumed.events[0]!.entry.id, entry.id)
  assert.equal((await c.getGamification()).xp, 10)
})
test('journal distinguishes explicit historical rests from other ineligible days and loads every rest page', async () => {
  const c = new FakeHabitsConnector(true),
    dashboard = await c.getDashboard(),
    item = dashboard.groups.flatMap((g) => g.habits)[0]!
  for (let i = 0; i < 205; i++)
    await c.setRest(item.habit.id, shiftDay(dashboard.date, i + 1))
  const previous = shiftDay(dashboard.date, -1)
  await c.setRest(item.habit.id, previous)
  const records = await loadJournal(c, [item], {})
  assert.equal(records[0]!.rests.length, 206)
  const day = journalDay(records, previous)
  assert.equal(day.resting.length, 1)
  assert.equal(day.resting[0]!.local_date, previous)
  assert.equal(day.items[0]!.eligible, false)
  records[0]!.rests = []
  assert.equal(journalDay(records, previous).resting.length, 0)
})
