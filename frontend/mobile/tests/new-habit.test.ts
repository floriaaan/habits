import test from 'node:test'
import assert from 'node:assert/strict'
import { habitSetup } from '../src/presentation/features/new-habit/new-habit-model'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'

test('creation converts human units and preserves the four tracking modes', async () => {
  const water = habitSetup(
    '  Boire de l’eau  ',
    'nutrition',
    'quantity',
    'milliliters',
    '1,5',
    'Europe/Paris',
  )
  assert.equal(water.habit.name, 'Boire de l’eau')
  assert.equal(water.habit.target, 1500)
  assert.deepEqual(water.presentation, { step: 250, illustration: 'water' })
  assert.equal(
    habitSetup('Courir', 'sport', 'quantity', 'meters', '2,5', 'UTC').habit
      .target,
    2500,
  )
  assert.equal(
    habitSetup('Méditer', 'mind', 'duration', 'seconds', '10', 'UTC').habit
      .target,
    600,
  )
  assert.equal(
    habitSetup('Lire', 'mind', 'boolean', 'count', '', 'UTC').habit.target,
    1,
  )
  assert.equal(
    habitSetup('Pauses', 'daily', 'frequency', 'count', '3', 'UTC').habit
      .target,
    3,
  )
  for (const target of ['', '0', '-2', 'abc', 'Infinity']) {
    assert.throws(() =>
      habitSetup('Eau', 'nutrition', 'quantity', 'milliliters', target, 'UTC'),
    )
  }
  assert.throws(() =>
    habitSetup('   ', 'daily', 'boolean', 'count', '1', 'UTC'),
  )
  const connector = new FakeHabitsConnector()
  const created = await connector.setupHabit(water, { key: 'new-habit-test' })
  assert.equal(created.target, 1500)
  assert.equal(created.category, 'nutrition')
})
