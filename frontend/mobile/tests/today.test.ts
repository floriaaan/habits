import test from 'node:test'
import assert from 'node:assert/strict'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'
import {
  journalDay,
  swipedDay,
  weekDays,
} from '../src/presentation/features/today/today-model'
import { shiftDay } from '../src/domain/calendar'
import { allPages } from '../src/application/pagination'
import { loadJournal } from '../src/application/journal'

test('day selector follows calendar weeks without timezone or month drift', () => {
  assert.deepEqual(weekDays('2026-03-01'), [
    '2026-02-23',
    '2026-02-24',
    '2026-02-25',
    '2026-02-26',
    '2026-02-27',
    '2026-02-28',
    '2026-03-01',
  ])
  assert.equal(shiftDay('2026-03-29', 1), '2026-03-30')
  assert.equal(shiftDay('2027-01-01', -1), '2026-12-31')
})
test('journal loads all pages, propagates errors and honors cancellation', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => i),
    offsets: number[] = []
  assert.deepEqual(
    await allPages(async (p) => {
      offsets.push(p.offset)
      return rows.slice(p.offset, p.offset + p.limit)
    }),
    rows,
  )
  assert.deepEqual(offsets, [0, 100, 200])
  await assert.rejects(
    allPages(async () => {
      throw new Error('offline')
    }),
    /offline/,
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(allPages(async () => [], { signal: controller.signal }))
})
test('journal projects real entries and past progress, preserves rest and historical definitions', async () => {
  const c = new FakeHabitsConnector(true),
    dashboard = await c.getDashboard()
  const records = await loadJournal(
    c,
    dashboard.groups.flatMap((g) => g.habits),
    {},
  )
  const current = journalDay(records, dashboard.date)
  assert.equal(
    current.events.length,
    records.flatMap((r) =>
      r.entries.filter((e) => e.local_date === dashboard.date),
    ).length,
  )
  assert.ok(current.items.some((i) => i.completed))
  const previous = shiftDay(dashboard.date, -1)
  const day = journalDay(records, previous)
  assert.equal(day.unavailable.length, 0)
  assert.equal(day.items.length, records.length)
  assert.ok(day.items.every((i) => !i.actionable))
  const record = records[0]!
  record.statistics.heatmap.find((d) => d.date === previous)!.eligible = false
  assert.equal(journalDay([record], previous).items[0]!.eligible, false)
  record.statistics.heatmap = []
  assert.deepEqual(journalDay([record], previous).unavailable, [
    record.item.habit.name,
  ])
  assert.equal(journalDay([record], previous).items.length, 0)
  record.versions = []
  assert.equal(journalDay([record], previous).events.length, 0)
})
test('weekly historical progress excludes later entries and journal orders UTC instants', async () => {
  const c = new FakeHabitsConnector(true),
    d = await c.getDashboard()
  const record = (
    await loadJournal(c, [d.groups.flatMap((g) => g.habits)[0]!], {})
  )[0]!
  const date = '2026-11-04'
  record.versions = [
    {
      effective_from: '2026-11-01',
      definition: {
        ...record.item.habit,
        name: 'Ancien nom',
        unit: 'count',
        period: 'weekly',
      },
    },
  ]
  record.statistics.periods = [
    {
      start: '2026-11-02',
      end: '2026-11-08',
      target: 5,
      progress: 9,
      eligible_days: 7,
      completed: true,
    },
  ]
  record.statistics.heatmap = ['2026-11-02', '2026-11-04', '2026-11-06'].map(
    (date, i) => ({
      date,
      eligible: true,
      progress: [1, 2, 6][i]!,
      completed: true,
      period_start: '2026-11-02',
    }),
  )
  record.item.local_date = '2026-11-07'
  record.entries = [
    {
      id: 'b',
      habit_id: record.item.habit.id,
      user_id: '',
      local_date: date,
      occurred_at: date + 'T09:30:00Z',
      created_at: '',
      value: 2,
    },
    {
      id: 'a',
      habit_id: record.item.habit.id,
      user_id: '',
      local_date: date,
      occurred_at: date + 'T10:00:00+02:00',
      created_at: '',
      value: 1,
    },
  ]
  const day = journalDay([record], date)
  assert.equal(day.items[0]!.progress, 3)
  assert.equal(day.items[0]!.completed, false)
  assert.equal(day.items[0]!.habit.name, 'Ancien nom')
  assert.equal(day.items[0]!.habit.unit, 'count')
  assert.deepEqual(
    day.events.map((e) => e.entry.id),
    ['a', 'b'],
  )
  record.statistics.heatmap.shift()
  assert.deepEqual(journalDay([record], date).unavailable, [
    record.item.habit.name,
  ])
  assert.equal(journalDay([record], date).items.length, 0)
  assert.equal(journalDay([record], date).events.length, 2)
})

test('horizontal swipe moves one day, follows date boundaries and ignores vertical drags', () => {
  const first = '2026-10-01',
    last = '2026-11-07'
  assert.equal(swipedDay('2026-11-01', first, last, 80, 5), '2026-10-31')
  assert.equal(swipedDay('2026-10-31', first, last, -80, 5), '2026-11-01')
  assert.equal(swipedDay(last, first, last, -90, 0), null)
  assert.equal(swipedDay(first, first, last, 90, 0), null)
  assert.equal(swipedDay(last, first, last, 40, 0), null)
  assert.equal(swipedDay(last, first, last, 60, 100), null)
  assert.equal(swipedDay(last, first, last, 60, 50), null)
})
