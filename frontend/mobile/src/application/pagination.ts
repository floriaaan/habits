import type { ReadOptions } from '../domain/connector'
import type { Page } from '../domain/models'

export async function allPages<T>(
  read: (page: Page) => Promise<T[]>,
  options: ReadOptions = {},
): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; offset <= 100000; offset += 100) {
    options.signal?.throwIfAborted()
    const items = await read({ limit: 100, offset })
    result.push(...items)
    if (items.length < 100) return result
  }
  throw new Error(
    'Cet historique est trop volumineux pour être chargé entièrement.',
  )
}
