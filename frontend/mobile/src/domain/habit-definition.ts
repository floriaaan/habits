import type { NewHabit } from './models'
export function definitionKey(h: NewHabit) {
  return JSON.stringify([
    h.name,
    h.category ?? 'daily',
    h.kind,
    h.unit,
    h.target,
    h.timezone,
    h.period ?? 'daily',
    [...(h.schedule?.weekdays ?? [1, 2, 3, 4, 5, 6, 7])].sort(),
    h.schedule?.start ?? null,
    h.schedule?.end ?? null,
  ])
}
