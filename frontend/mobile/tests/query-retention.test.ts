import assert from 'node:assert/strict'
import test from 'node:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { retainPreviousRevision } from '../src/application/query-retention'

const key = (revision: number) =>
  [
    'https://habits.example',
    'http',
    'alice',
    'entries',
    'journal',
    '2026-11-08',
    revision,
  ] as const

test('journal remains displayed during a revision fetch, then receives the fresh data', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const before = [{ id: 'habit', progress: 0 }],
    after = [{ id: 'habit', progress: 1 }]
  client.setQueryData(key(1), before)
  const observer = new QueryObserver(client, {
    queryKey: key(1),
    queryFn: async () => before,
  })
  const unsubscribe = observer.subscribe(() => {})
  let finish!: (data: typeof after) => void
  const request = new Promise<typeof after>((resolve) => {
    finish = resolve
  })
  observer.setOptions({
    queryKey: key(2),
    queryFn: () => request,
    placeholderData: (data, previous) =>
      retainPreviousRevision(data, key(2), previous?.queryKey),
  })
  assert.equal(observer.getCurrentResult().isPlaceholderData, true)
  assert.equal(observer.getCurrentResult().data, before)
  const refreshed = client.fetchQuery({
    queryKey: key(2),
    queryFn: () => request,
  })
  finish(after)
  await refreshed
  assert.deepEqual(observer.getCurrentResult().data, after)
  assert.equal(observer.getCurrentResult().isPlaceholderData, false)
  unsubscribe()
  client.clear()
})

test('journal data never carries over to a different account, origin, mode, resource or day', () => {
  const data = ['private journal']
  assert.equal(retainPreviousRevision(data, key(2), key(1)), data)
  for (const [index, value] of [
    [0, 'https://other.example'],
    [1, 'fake'],
    [2, 'bob'],
    [3, 'statistics'],
    [4, 'other'],
    [5, '2026-11-09'],
  ] as const) {
    const current: unknown[] = [...key(2)]
    current[index] = value
    assert.equal(retainPreviousRevision(data, current, key(1)), undefined)
  }
  assert.equal(retainPreviousRevision(data, key(2), undefined), undefined)
})
