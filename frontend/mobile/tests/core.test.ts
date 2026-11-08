import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'
import {
  HttpClient,
  type AccessSource,
} from '../src/infrastructure/http/client'
import { HttpHabitsConnector } from '../src/infrastructure/http/connector'
import {
  CredentialVault,
  type CredentialStorage,
  type Credentials,
} from '../src/infrastructure/auth/vault'
import { ApiError } from '../src/domain/api-error'
import { authorizationCode } from '../src/infrastructure/auth/protocol'
import { apiOrigin } from '../src/infrastructure/config'
import type { HabitsConnector } from '../src/domain/connector'
const origin = 'https://habits.test'
const pat: Credentials = { origin, kind: 'pat', accessToken: 'test-secret' }
function memory() {
  let value: string | null = null
  const storage: CredentialStorage = {
    read: async () => value,
    write: async (next) => {
      value = next
    },
  }
  return { storage, get: () => value }
}
function access(): AccessSource & { invalidations: number } {
  return {
    generation: 0,
    invalidations: 0,
    getToken: async () => 'test-secret',
    canRefresh: () => false,
    invalidate: async function (generation) {
      if (generation === this.generation) {
        this.invalidations++
        this.generation++
      }
    },
  }
}
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
test('fake persists actions, rejects changed idempotent payload, archives without losing entries and resets', async () => {
  const c: HabitsConnector = new FakeHabitsConnector(),
    input = {
      name: 'Test',
      kind: 'quantity' as const,
      unit: 'count' as const,
      target: 3,
      timezone: 'UTC',
    }
  const habit = await c.setupHabit({ habit: input }, { key: 'setup' })
  assert.deepEqual(
    await c.setupHabit({ habit: input }, { key: 'setup' }),
    habit,
  )
  await assert.rejects(
    c.setupHabit({ habit: { ...input, name: 'Other' } }, { key: 'setup' }),
    (e: unknown) => e instanceof ApiError && e.status === 409,
  )
  const entry = await c.recordEntry(
    habit.id,
    { occurred_at: new Date().toISOString(), value: 1 },
    { key: 'entry' },
  )
  await c.habitAction(habit.id, { action: 'increment' }, { key: 'action' })
  assert.equal((await c.getStatistics(habit.id)).periods[0]!.progress, 2)
  await c.correctEntry(
    (await c.listEntries(habit.id, { limit: 20, offset: 0 })).items[0]!.id,
    { occurred_at: new Date().toISOString(), value: 3 },
    { key: 'correct' },
  )
  assert.equal((await c.getGamification()).xp, 10)
  await c.archiveHabit(habit.id)
  assert.equal(
    (await c.listHabits({ limit: 100, offset: 0 })).items.some(
      (h) => h.id === habit.id,
    ),
    false,
  )
  assert.equal(
    (await c.listEntries(habit.id, { limit: 20, offset: 0 })).items.length,
    1,
  )
  ;(c as FakeHabitsConnector).reset()
  await assert.rejects(c.getEntry(entry.id))
})
test('HTTP handles JSON, no-content, error envelopes, malformed response and stable command key', async () => {
  const a = access(),
    calls: RequestInit[] = []
  const responses = [
    Response.json({ ok: true }),
    new Response(null, { status: 204 }),
    Response.json(
      { error: { code: 'conflict', message: 'Conflit', request_id: 'rid' } },
      { status: 409 },
    ),
    new Response('<html>'),
  ]
  const c = new HttpClient(origin, a, async (url, init) => {
    assert.equal(url, origin + '/api/v1/test')
    calls.push(init!)
    return responses.shift()!
  })
  assert.deepEqual(await c.request('/test'), { ok: true })
  assert.equal(
    await c.request('/test', 'DELETE', undefined, { key: 'same-key' }),
    undefined,
  )
  await assert.rejects(
    c.request('/test'),
    (e: unknown) =>
      e instanceof ApiError && e.status === 409 && e.requestId === 'rid',
  )
  await assert.rejects(
    c.request('/test'),
    (e: unknown) => e instanceof ApiError && e.code === 'protocol_error',
  )
  assert.equal(
    (calls[1]!.headers as Record<string, string>)['Idempotency-Key'],
    'same-key',
  )
  assert.equal(calls[0]!.redirect, 'error')
})
test('only current 401 clears credentials; 403, network failure and late 401 preserve new login', async () => {
  const a = access()
  let response: Response | Error = Response.json({}, { status: 403 })
  const c = new HttpClient(origin, a, async () => {
    if (response instanceof Error) throw response
    return response
  })
  await assert.rejects(c.request('/x'))
  assert.equal(a.invalidations, 0)
  response = new Error('offline')
  await assert.rejects(c.request('/x'))
  assert.equal(a.invalidations, 0)
  const pending = deferred<Response>(),
    late = new HttpClient(origin, a, async () => pending.promise)
  const request = late.request('/x')
  await new Promise((r) => setImmediate(r))
  a.generation++
  pending.resolve(Response.json({}, { status: 401 }))
  await assert.rejects(request)
  assert.equal(a.invalidations, 0)
  response = Response.json({}, { status: 401 })
  await assert.rejects(c.request('/x'))
  assert.equal(a.invalidations, 1)
})
test('timeout and caller cancellation are distinct', async () => {
  const transport: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new Error('aborted'))
      else
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        )
    })
  const c = new HttpClient(origin, access(), transport, 5)
  await assert.rejects(
    c.request('/x'),
    (e: unknown) => e instanceof ApiError && e.code === 'timeout',
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    c.request('/x', 'GET', undefined, { signal: controller.signal }),
    (e: unknown) => e instanceof ApiError && e.code === 'cancelled',
  )
})
test('vault restores only same-origin credentials and handles malformed storage', async () => {
  const m = memory(),
    v = new CredentialVault(origin, m.storage, async (c) => c)
  await v.install(pat)
  const restored = new CredentialVault(origin, m.storage, async (c) => c)
  await restored.restore()
  assert.equal(await restored.getToken(), 'test-secret')
  const other = new CredentialVault(
    'https://other.test',
    m.storage,
    async (c) => c,
  )
  await other.restore()
  assert.equal(await other.getToken(), null)
  assert.equal(m.get(), null)
  await m.storage.write('null')
  await v.restore()
  assert.equal(m.get(), null)
})
test('refresh is single-flight, persists rotation and cannot resurrect a logged-out session', async () => {
  const m = memory(),
    pending = deferred<Credentials>()
  let count = 0
  const v = new CredentialVault(origin, m.storage, async () => {
    count++
    return pending.promise
  })
  await v.install({ ...pat, kind: 'oidc', refreshToken: 'r1', expiresAt: 0 })
  const first = v.getToken(),
    second = v.getToken()
  pending.resolve({
    ...pat,
    kind: 'oidc',
    accessToken: 'new',
    refreshToken: 'r2',
    expiresAt: Date.now() + 60000,
  })
  assert.equal(await first, 'new')
  assert.equal(await second, 'new')
  assert.equal(count, 1)
  assert.equal(JSON.parse(m.get()!).refreshToken, 'r2')
  const delayed = deferred<Credentials>(),
    v2 = new CredentialVault(origin, m.storage, async () => delayed.promise)
  await v2.install({ ...pat, kind: 'oidc', refreshToken: 'r', expiresAt: 0 })
  const request = v2.getToken()
  await v2.invalidate(v2.generation)
  delayed.resolve({ ...pat, accessToken: 'late' })
  await assert.rejects(request)
  assert.equal(await v2.getToken(), null)
  assert.equal(m.get(), null)
})
test('transient refresh errors retain credentials; invalid_grant deletes them', async () => {
  const m = memory()
  let error = new ApiError('network_error', 'offline')
  const v = new CredentialVault(origin, m.storage, async () => {
    throw error
  })
  await v.install({ ...pat, kind: 'oidc', refreshToken: 'r', expiresAt: 0 })
  await assert.rejects(v.getToken())
  assert.notEqual(m.get(), null)
  error = new ApiError('invalid_grant', 'revoked', 401)
  await assert.rejects(v.getToken())
  assert.equal(m.get(), null)
})
test('HTTP retries GET once after refresh and never repeats a mutation', async () => {
  const a = access()
  a.canRefresh = () => true
  let refreshes = 0,
    requests = 0
  a.getToken = async (force) => {
    if (force) refreshes++
    return force ? 'new' : 'old'
  }
  const c = new HttpClient(origin, a, async () => {
    requests++
    return requests === 1
      ? Response.json({}, { status: 401 })
      : Response.json({ ok: true })
  })
  assert.deepEqual(await c.request('/x'), { ok: true })
  assert.equal(refreshes, 1)
  assert.equal(requests, 2)
  requests = 0
  await assert.rejects(
    c.request('/x', 'POST', {}, { key: 'same' }),
    (e: unknown) => e instanceof ApiError && e.code === 'auth_refreshed',
  )
  assert.equal(requests, 1)
})
test('configuration rejects credentials, paths, fragments, unsupported protocols and production cleartext', () => {
  assert.equal(
    apiOrigin('http://192.168.1.2:8080', true),
    'http://192.168.1.2:8080',
  )
  for (const value of [
    undefined,
    'http://192.168.1.2',
    'https://u:p@server',
    'https://server/api',
    'https://server?x=1',
    'https://server#token',
    'file:///tmp',
  ])
    assert.throws(() => apiOrigin(value, false))
})
// Ensure every interface operation has both adapters, not only the screen's default path.
test('fake and HTTP expose exactly the same named contract', () => {
  const fake = new FakeHabitsConnector()
  const names = Object.getOwnPropertyNames(
    HttpHabitsConnector.prototype,
  ).filter((n) => n !== 'constructor')
  for (const name of names)
    assert.equal(
      typeof (fake as unknown as Record<string, unknown>)[name],
      'function',
      name,
    )
  assert.equal(names.length, 39)
})

test('OAuth callback accepts only the matching state and code; cancellation is neutral', () => {
  assert.equal(
    authorizationCode(
      { type: 'success', params: { state: 'expected', code: 'code' } },
      'expected',
    ),
    'code',
  )
  for (const result of [
    { type: 'success', params: { state: 'wrong', code: 'code' } },
    { type: 'success', params: { state: 'expected' } },
    { type: 'error' },
  ])
    assert.throws(() => authorizationCode(result, 'expected'))
  assert.equal(authorizationCode({ type: 'cancel' }, 'expected'), null)
})
