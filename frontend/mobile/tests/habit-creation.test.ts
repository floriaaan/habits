import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildHabit,
  connectedHomeAssistant,
  homeAssistantReminderAvailable,
  newHabitDraft,
} from '../src/presentation/features/new-habit/new-habit-model'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'

test('guided creation carries weekly goals, schedule and all presentation options in server units', async () => {
  const draft = {
    ...newHabitDraft('Europe/Paris'),
    name: 'Courir',
    category: 'sport' as const,
    kind: 'quantity' as const,
    unit: 'meters' as const,
    target: '15',
    increment: '0,5',
    period: 'weekly' as const,
    weekdays: [6, 1, 3],
    windowEnabled: true,
    start: '18:00',
    end: '21:00',
    reminderEnabled: true,
    reminder: '19:00',
    icon: 'mdi:run',
    color: '#ff375f',
    weight: '2',
    order: '-3',
  }
  const input = buildHabit(draft, true)
  assert.equal(input.habit.target, 15000)
  assert.equal(input.habit.period, 'weekly')
  assert.deepEqual(input.habit.schedule, {
    weekdays: [1, 3, 6],
    start: '18:00:00',
    end: '21:00:00',
  })
  assert.deepEqual(input.presentation, {
    icon: 'mdi:run',
    color: '#ff375f',
    weight: 2,
    order: -3,
    step: 500,
    illustration: 'plain',
    reminder_at: '19:00:00',
  })
  const connector = new FakeHabitsConnector(),
    habit = await connector.setupHabit(input, { key: 'creation' })
  assert.equal(habit.period, 'weekly')
  assert.deepEqual(habit.schedule, input.habit.schedule)
  assert.equal(
    (await connector.getDashboard()).groups
      .flatMap((g) => g.habits)
      .find((i) => i.habit.id === habit.id)!.presentation.reminder_at,
    '19:00:00',
  )
  assert.equal(
    (await connector.setupHabit(input, { key: 'creation' })).id,
    habit.id,
  )
})
test('reminders require an active Home Assistant connection; unrelated or missing integrations never suffice', () => {
  const draft = { ...newHabitDraft('UTC'), name: 'Lire', reminderEnabled: true }
  for (const integrations of [
    undefined,
    [],
    [{ id: '1', provider: 'strava' as const, connected: true }],
    [{ id: '2', provider: 'home_assistant' as const, connected: false }],
  ]) {
    assert.equal(connectedHomeAssistant(integrations), false)
    assert.throws(
      () => buildHabit(draft, connectedHomeAssistant(integrations)),
      /Connectez Home Assistant/,
    )
  }
  assert.equal(
    connectedHomeAssistant([
      { id: '3', provider: 'home_assistant', connected: true },
    ]),
    true,
  )
  assert.equal(
    buildHabit({ ...draft, reminderEnabled: false }, false).presentation!
      .reminder_at,
    null,
  )
})
test('creation rejects schedules and advanced settings that the backend cannot accept', () => {
  const base = { ...newHabitDraft('UTC'), name: 'Lire' }
  for (const invalid of [
    { name: 'x'.repeat(121) },
    { name: 'bad\nname' },
    { name: 'bad\u0085name' },
    { weekdays: [] },
    { weekdays: [1, 1] },
    { windowEnabled: true, start: '21:00', end: '08:00' },
    { windowEnabled: true, start: '25:00' },
    {
      reminderEnabled: true,
      windowEnabled: true,
      start: '08:00',
      end: '19:00',
      reminder: '19:00',
    },
    { timezone: 'bad/zone' },
    { weight: '0' },
    { weight: '101' },
    { order: '1,5' },
    { order: '10001' },
    { increment: '2' },
    { color: '#xyz123' },
    { icon: 'not-mdi' },
    { illustration: 'water' as const },
    { kind: 'frequency' as const, target: '1,5' },
  ])
    assert.throws(
      () => buildHabit({ ...base, ...invalid }, true),
      JSON.stringify(invalid),
    )
  const valid = buildHabit(base, false)
  assert.equal(valid.habit.target, 1)
  assert.deepEqual(valid.habit.schedule, {
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    start: null,
    end: null,
  })
})

test('cached integration data never enables reminders during loading, errors or lost permissions', () => {
  const connected = [
    { id: 'ha', provider: 'home_assistant' as const, connected: true },
  ]
  assert.equal(
    homeAssistantReminderAvailable(connected, true, true, false),
    true,
  )
  assert.equal(
    homeAssistantReminderAvailable(connected, false, true, false),
    false,
  )
  assert.equal(
    homeAssistantReminderAvailable(connected, true, true, true),
    false,
  )
  assert.equal(
    homeAssistantReminderAvailable(connected, true, false, false),
    false,
  )
  assert.equal(
    homeAssistantReminderAvailable(undefined, true, false, true),
    false,
  )
})
