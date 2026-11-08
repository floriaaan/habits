import type { HabitsConnector, ReadOptions } from '../domain/connector'
import type {
  DashboardHabit,
  Entry,
  HabitStatistics,
  HabitVersion,
} from '../domain/models'
import { allPages } from './pagination'

export interface JournalHistory {
  item: DashboardHabit
  entries: Entry[]
  statistics: HabitStatistics
  versions: HabitVersion[]
}
export async function loadJournal(
  connector: HabitsConnector,
  items: DashboardHabit[],
  options: ReadOptions,
): Promise<JournalHistory[]> {
  const result: JournalHistory[] = []
  // Bound parallelism while using the existing paginated API; a filtered journal
  // endpoint can replace this read if very large histories become common.
  for (let offset = 0; offset < items.length; offset += 8) {
    options.signal?.throwIfAborted()
    result.push(
      ...(await Promise.all(
        items.slice(offset, offset + 8).map(async (item) => {
          const id = item.habit.id
          const [entries, statistics, versions] = await Promise.all([
            allPages(
              async (page) =>
                (await connector.listEntries(id, page, options)).items,
              options,
            ),
            connector.getStatistics(id, options),
            allPages(
              (page) => connector.getVersions(id, page, options),
              options,
            ),
          ])
          return { item, entries, statistics, versions }
        }),
      )),
    )
  }
  return result
}
