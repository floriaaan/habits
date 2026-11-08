import { definitionKey } from '../domain/habit-definition'
import type { HabitsConnector } from '../domain/connector'
import type { HabitVersion } from '../domain/models'
import { allPages } from './pagination'

// PUT versions has no idempotency header. Recover an identical committed write
// after a lost response, without replacing another scheduled definition.
export async function ensureHabitVersion(
  connector: HabitsConnector,
  id: string,
  input: HabitVersion,
) {
  try {
    return await connector.updateHabit(id, input)
  } catch (error) {
    try {
      const versions = await allPages((page) => connector.getVersions(id, page))
      const committed = versions.find(
        (v) =>
          v.effective_from === input.effective_from &&
          definitionKey(v.definition) === definitionKey(input.definition),
      )
      if (committed) return committed
    } catch {
      /* Preserve the original write error. */
    }
    throw error
  }
}
