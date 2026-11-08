import test from 'node:test'
import assert from 'node:assert/strict'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'
import {
  amount,
  dailyDelta,
  history,
} from '../src/presentation/shared/models/home-model'

test('home uses server date, preserves missing days and never invents a comparison', async () => {
  const data = await new FakeHabitsConnector().getDashboard()
  data.date = '2026-03-01'
  data.global_percent = 75
  data.heatmap = [
    { date: '2026-02-27', percent: 40, completed: 1, eligible: 2 },
    { date: '2026-03-02', percent: 100, completed: 2, eligible: 2 },
  ]
  assert.deepEqual(
    history(data, 3).map((day) => [day.date, day.percent]),
    [
      ['2026-02-27', 40],
      ['2026-02-28', null],
      ['2026-03-01', 75],
    ],
  )
  assert.equal(dailyDelta(data), null)
  assert.equal(amount(1500, 'milliliters'), '1,5 L')
  assert.equal(amount(600, 'seconds'), '10 min')
})
test('showcase fixtures support actual dashboard actions and water history', async () => {
  const connector = new FakeHabitsConnector(true),
    dashboard = await connector.getDashboard()
  assert.equal(Math.round(dashboard.global_percent!), 58)
  const water = dashboard.groups
    .flatMap((g) => g.habits)
    .find((h) => h.habit.unit === 'milliliters')!
  assert.equal(
    (await connector.getStatistics(water.habit.id)).heatmap.length,
    30,
  )
  await connector.habitAction(
    water.habit.id,
    { action: 'increment' },
    { key: 'water-add' },
  )
  await connector.habitAction(
    water.habit.id,
    { action: 'increment' },
    { key: 'water-add' },
  )
  const next = await connector.getDashboard()
  assert.equal(
    next.groups
      .flatMap((g) => g.habits)
      .find((h) => h.habit.id === water.habit.id)!.progress,
    1750,
  )
  connector.reset()
  assert.equal(Math.round((await connector.getDashboard()).global_percent!), 58)
})

test('demo charts and totals are backed by actual dated entries and reset deterministically', async () => {
  const c = new FakeHabitsConnector(true),
    data = await c.getDashboard()
  const habits = data.groups.flatMap((group) => group.habits)
  assert.ok(new Set(data.heatmap.map((day) => day.percent)).size >= 4)
  let xp = 0
  for (const day of data.heatmap) {
    let completed = 0
    for (const item of habits) {
      const entries = (
        await c.listEntries(item.habit.id, { limit: 100, offset: 0 })
      ).items
      const progress = entries
        .filter((entry) => entry.local_date === day.date)
        .reduce((sum, entry) => sum + entry.value, 0)
      if (progress >= item.target) completed++
      assert.equal(
        (await c.getStatistics(item.habit.id)).heatmap.find(
          (d) => d.date === day.date,
        )!.progress,
        progress,
      )
    }
    assert.equal(day.completed, completed)
    xp += completed * 10
  }
  assert.equal(data.gamification.xp, xp)
  assert.ok(data.streak_91_days.record >= 2)
  assert.equal(data.heatmap.at(-1)!.percent, data.global_percent)
  c.reset()
  assert.deepEqual((await c.getDashboard()).heatmap, data.heatmap)
})

test('new demo habits have no eligible history before their first version and rests stay excluded', async () => {
  const c = new FakeHabitsConnector(true)
  const habit = await c.createHabit({
    name: 'Nouvelle',
    kind: 'boolean',
    unit: 'count',
    target: 1,
    timezone: 'UTC',
  })
  const stats = await c.getStatistics(habit.id)
  assert.equal(stats.heatmap.filter((day) => day.eligible).length, 1)
  assert.equal(stats.heatmap.at(-1)!.eligible, true)
  await c.setRest(habit.id, stats.through)
  assert.equal(
    (await c.getStatistics(habit.id)).heatmap.filter((day) => day.eligible)
      .length,
    0,
  )
})
