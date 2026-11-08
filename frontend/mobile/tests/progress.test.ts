import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fullDays,
  dayLabel,
} from '../src/presentation/features/progress/progress-model'
import { history } from '../src/presentation/shared/models/home-model'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'

test('full days excludes missing/rest days and partial objectives', () => {
  assert.equal(
    fullDays([
      { date: '2026-11-01', completed: 0, eligible: 0, percent: null },
      { date: '2026-11-02', completed: 2, eligible: 3, percent: 80 },
      { date: '2026-11-03', completed: 3, eligible: 3, percent: 100 },
    ]),
    1,
  )
  assert.ok(dayLabel('2026-01-01').includes('1'))
})
test('demo provides thirty real daily values, with week and month ending on the server date', async () => {
  const c = new FakeHabitsConnector(true),
    data = await c.getDashboard()
  assert.equal(
    history(data, 30).filter((day) => day.percent !== null).length,
    30,
  )
  assert.deepEqual(history(data, 7), history(data, 30).slice(-7))
  assert.equal(history(data, 30).at(-1)!.date, data.date)
  assert.equal(data.weekly.current.length, 7)
  assert.equal(data.weekly.previous.length, 7)
  assert.deepEqual(data.weekly.current, data.heatmap.slice(-7))
})
