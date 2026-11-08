import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureHabitVersion } from '../src/application/habit-editing'
import { ApiError } from '../src/domain/api-error'
import type { HabitVersion } from '../src/domain/models'
import { defaultPresentation } from '../src/domain/models'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'
import {
  buildHabitEdit,
  editDraft,
  localDate,
  nextEditDate,
  type EditHabitSnapshot,
} from '../src/presentation/features/new-habit/edit-habit-model'
import { shiftDay } from '../src/domain/calendar'

async function fixture(
  connector = new FakeHabitsConnector(),
): Promise<{ connector: FakeHabitsConnector; snapshot: EditHabitSnapshot }> {
  const habit = await connector.createHabit({
    name: 'Courir',
    category: 'sport',
    kind: 'quantity',
    unit: 'meters',
    target: 5000,
    timezone: 'UTC',
  })
  return {
    connector,
    snapshot: {
      habit,
      localDate: localDate('UTC'),
      versions: [],
      presentation: { ...defaultPresentation, step: 1000 },
    },
  }
}
test('editing preserves immutable identity and converts quantities without rewriting the current habit', async () => {
  const { snapshot } = await fixture(),
    draft = editDraft(snapshot),
    tomorrow = shiftDay(snapshot.localDate, 1)
  assert.deepEqual(
    buildHabitEdit(snapshot, draft, tomorrow, snapshot.localDate),
    { version: null, presentation: null },
  )
  draft.target = '6'
  draft.name = 'Course'
  draft.weekdays = [1, 3, 6]
  const plan = buildHabitEdit(snapshot, draft, tomorrow, snapshot.localDate)
  assert.equal(plan.version!.definition.target, 6000)
  assert.equal(plan.version!.definition.name, 'Course')
  assert.equal(plan.version!.definition.unit, 'meters')
  assert.equal(plan.version!.definition.timezone, 'UTC')
  assert.equal(plan.version!.effective_from, tomorrow)
  assert.deepEqual(plan.version!.definition.schedule!.weekdays, [1, 3, 6])
  assert.equal(snapshot.habit.target, 5000)
  assert.equal(plan.presentation, null)
  assert.throws(
    () =>
      buildHabitEdit(
        snapshot,
        { ...draft, period: 'weekly' },
        tomorrow,
        snapshot.localDate,
      ),
    /ne peuvent pas être modifiés/,
  )
  for (const date of [
    snapshot.localDate,
    shiftDay(snapshot.localDate, -1),
    shiftDay(snapshot.localDate, 367),
    '2026-02-30',
    'bad',
  ])
    assert.throws(() =>
      buildHabitEdit(snapshot, draft, date, snapshot.localDate),
    )
})
test('effective dates respect the habit timezone, Mondays, month boundaries and occupied dates', async () => {
  assert.equal(
    localDate('Pacific/Kiritimati', new Date('2026-12-31T12:30:00Z')),
    '2027-01-01',
  )
  assert.equal(nextEditDate('2026-12-31', 'daily'), '2027-01-01')
  assert.equal(nextEditDate('2026-11-08', 'weekly'), '2026-11-09')
  assert.equal(nextEditDate('2026-11-09', 'weekly'), '2026-11-16')
  const { snapshot } = await fixture()
  const version = { effective_from: '2026-11-09', definition: snapshot.habit }
  assert.equal(nextEditDate('2026-11-08', 'weekly', [version]), '2026-11-16')
  snapshot.habit.period = 'weekly'
  const draft = { ...editDraft(snapshot), target: '10' }
  assert.throws(
    () => buildHabitEdit(snapshot, draft, '2026-11-10', '2026-11-08'),
    /lundi/,
  )
  assert.equal(
    buildHabitEdit(snapshot, draft, '2026-11-09', '2026-11-08').version!
      .definition.target,
    10000,
  )
})
test('reminder-only edits preserve presentation, need no future definition and respect both windows', async () => {
  const { snapshot } = await fixture()
  snapshot.habit.schedule = {
    weekdays: [1, 3, 6],
    start: '08:00:00',
    end: '20:00:00',
  }
  snapshot.presentation = {
    ...snapshot.presentation!,
    icon: 'mdi:run',
    color: '#ff375f',
    weight: 2,
    order: -5,
    reminder_at: '19:00:00',
  }
  const draft = { ...editDraft(snapshot), reminder: '18:00' }
  const plan = buildHabitEdit(
    snapshot,
    draft,
    snapshot.localDate,
    snapshot.localDate,
  )
  assert.equal(plan.version, null)
  assert.deepEqual(plan.presentation, {
    ...snapshot.presentation,
    reminder_at: '18:00:00',
  })
  assert.throws(
    () =>
      buildHabitEdit(
        snapshot,
        { ...draft, windowEnabled: false, reminder: '22:00' },
        shiftDay(snapshot.localDate, 1),
        snapshot.localDate,
      ),
    /plage actuelle/,
  )
  assert.equal(
    buildHabitEdit(
      snapshot,
      { ...draft, reminderEnabled: false },
      snapshot.localDate,
      snapshot.localDate,
    ).presentation!.reminder_at,
    null,
  )
})
test('lost edit responses recover an identical version without hiding a conflicting change', async () => {
  class LostResponse extends FakeHabitsConnector {
    override async updateHabit(
      id: string,
      input: HabitVersion,
    ): Promise<HabitVersion> {
      await super.updateHabit(id, input)
      throw new ApiError('network_error', 'Réponse perdue.')
    }
  }
  const { connector, snapshot } = await fixture(new LostResponse())
  const input = buildHabitEdit(
    snapshot,
    { ...editDraft(snapshot), target: '6' },
    shiftDay(snapshot.localDate, 1),
    snapshot.localDate,
  ).version!
  assert.equal(
    (await ensureHabitVersion(connector, snapshot.habit.id, input)).definition
      .target,
    6000,
  )
  await ensureHabitVersion(connector, snapshot.habit.id, input)
  const versions = await connector.getVersions(snapshot.habit.id, {
    limit: 100,
    offset: 0,
  })
  assert.equal(
    versions.filter((v) => v.effective_from === input.effective_from).length,
    1,
  )
  await assert.rejects(
    () =>
      ensureHabitVersion(connector, snapshot.habit.id, {
        ...input,
        definition: { ...input.definition, target: 7000 },
      }),
    (e) => e instanceof ApiError && e.status === 409,
  )
})
test('archiving is repeatable, removes active tracking and preserves past entries', async () => {
  const { connector, snapshot } = await fixture(),
    id = snapshot.habit.id
  const entry = await connector.recordEntry(
    id,
    { value: 1000, occurred_at: new Date().toISOString() },
    { key: 'past-entry' },
  )
  await connector.archiveHabit(id)
  await connector.archiveHabit(id)
  assert.ok((await connector.getHabit(id)).archived_at)
  assert.ok(
    !(await connector.getDashboard()).groups
      .flatMap((g) => g.habits)
      .some((i) => i.habit.id === id),
  )
  assert.equal((await connector.getEntry(entry.id)).value, 1000)
  assert.equal(
    (await connector.listEntries(id, { limit: 100, offset: 0 })).items.length,
    1,
  )
  await assert.rejects(() =>
    connector.updateHabit(id, {
      effective_from: shiftDay(snapshot.localDate, 1),
      definition: snapshot.habit,
    }),
  )
})

test('unrelated edits preserve second and fractional precision in existing schedule windows', async () => {
  const { snapshot } = await fixture()
  snapshot.habit.schedule = {
    weekdays: [1, 3, 6],
    start: '08:00:30.125',
    end: '08:00:40.5',
  }
  const draft = editDraft(snapshot),
    date = shiftDay(snapshot.localDate, 1)
  assert.deepEqual(buildHabitEdit(snapshot, draft, date, snapshot.localDate), {
    version: null,
    presentation: null,
  })
  const renamed = buildHabitEdit(
    snapshot,
    { ...draft, name: 'Course du matin' },
    date,
    snapshot.localDate,
  )
  assert.deepEqual(
    renamed.version!.definition.schedule,
    snapshot.habit.schedule,
  )
  const changed = buildHabitEdit(
    snapshot,
    { ...draft, end: '08:10' },
    date,
    snapshot.localDate,
  )
  assert.equal(changed.version!.definition.schedule!.start, '08:00:30.125')
  assert.equal(changed.version!.definition.schedule!.end, '08:10:00')
})
