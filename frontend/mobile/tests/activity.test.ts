import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activityDays } from '../src/presentation/features/activity/activity-model'
import type { HabitStatistics } from '../src/domain/models'

test('activity curve keeps raw quantities and distinguishes missing/rest days from zero', () => {
  const stats = {
    through: '2026-11-07',
    heatmap: [
      { date: '2026-11-04', eligible: true, progress: 8200 },
      { date: '2026-11-05', eligible: false, progress: 900 },
      { date: '2026-11-07', eligible: true, progress: 0 },
    ],
  } as HabitStatistics
  assert.deepEqual(activityDays(stats, 4), [
    { date: '2026-11-04', value: 8200 },
    { date: '2026-11-05', value: null },
    { date: '2026-11-06', value: null },
    { date: '2026-11-07', value: 0 },
  ])
  assert.equal(activityDays(stats, 30).length, 30)
})
