import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { HttpClient } from '../src/infrastructure/http/client'
import { HttpHabitsConnector } from '../src/infrastructure/http/connector'
import { ApiError } from '../src/domain/api-error'
const binary = process.env.HABITS_BACKEND_BIN
test(
  'HTTP connector exercises Rust session, tracking, permissions and token lifecycle',
  { skip: !binary, timeout: 20000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'habits-mobile-'))
    const socket = createServer()
    await new Promise<void>((r) => socket.listen(0, '127.0.0.1', r))
    const port = (socket.address() as { port: number }).port
    await new Promise<void>((r) => socket.close(() => r()))
    const child = spawn(binary!, [], {
      env: {
        ...process.env,
        AUTH_MODE: 'local',
        DATABASE_PATH: join(directory, 'test.sqlite'),
        LISTEN_ADDR: `127.0.0.1:${port}`,
        RUST_LOG: 'error',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const token = await new Promise<string>((resolve, reject) => {
        let buffer = ''
        const timer = setTimeout(
          () => reject(new Error('Bootstrap timeout')),
          10000,
        )
        child.on('error', reject)
        child.on('exit', () => {
          clearTimeout(timer)
          reject(new Error('Backend exited before bootstrap'))
        })
        child.stdout.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop()!
          for (const line of lines) {
            try {
              const event = JSON.parse(line)
              if (event.event === 'local_bootstrap') {
                clearTimeout(timer)
                resolve(event.token)
              }
            } catch {}
          }
        })
      })
      const access = {
        generation: 0,
        getToken: async () => token,
        canRefresh: () => false,
        invalidate: async () => {},
      }
      const c = new HttpHabitsConnector(
        new HttpClient(`http://127.0.0.1:${port}`, access),
      )
      let ready = false
      for (let i = 0; i < 40; i++) {
        try {
          await c.getSession()
          ready = true
          break
        } catch {
          await new Promise((r) => setTimeout(r, 50))
        }
      }
      assert.equal(ready, true)
      const session = await c.getSession()
      assert.equal(session.mode, 'personal_access_token')
      assert.ok(session.scopes.includes('tokens:manage'))
      assert.ok((await c.getVersion()).version)
      assert.ok(((await c.getOpenApi()) as { paths: unknown }).paths)
      const habit = await c.createHabit({
        name: 'Mobile HTTP',
        kind: 'quantity',
        unit: 'count',
        target: 3,
        timezone: 'UTC',
      })
      assert.equal((await c.getHabit(habit.id)).name, 'Mobile HTTP')
      assert.ok(
        (await c.listHabits({ limit: 20, offset: 0 })).items.some(
          (h) => h.id === habit.id,
        ),
      )
      const entry = await c.recordEntry(
        habit.id,
        { occurred_at: new Date(Date.now() - 1000).toISOString(), value: 1 },
        { key: 'entry' },
      )
      assert.equal((await c.getEntry(entry.id)).value, 1)
      await c.correctEntry(
        entry.id,
        { occurred_at: entry.occurred_at, value: 2 },
        { key: 'correction' },
      )
      assert.equal(
        (await c.listEntries(habit.id, { limit: 20, offset: 0 })).items[0]!
          .value,
        2,
      )
      await c.habitAction(
        habit.id,
        { action: 'increment' },
        { key: 'increment' },
      )
      assert.equal((await c.getStatistics(habit.id)).xp, 10)
      assert.equal((await c.getGamification()).xp, 10)
      assert.ok(
        (await c.getDashboard()).groups.some((g) =>
          g.habits.some((h) => h.habit.id === habit.id),
        ),
      )
      await c.recalculate(habit.id)
      assert.ok((await c.getLedger({ limit: 20, offset: 0 })).items.length)
      const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
      await c.setRest(habit.id, date)
      assert.equal(
        (await c.getRests(habit.id, { limit: 20, offset: 0 })).length,
        1,
      )
      await c.removeRest(habit.id, date)
      await c.cancelEntry(entry.id, { key: 'cancel' })
      await c.archiveHabit(habit.id)
      const service = await c.createServiceAccount({ name: 'mobile test' })
      const issued = await c.createToken({
        scopes: ['habits:read'],
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        service_account_id: service.id,
      })
      const reader = new HttpHabitsConnector(
        new HttpClient(`http://127.0.0.1:${port}`, {
          ...access,
          getToken: async () => issued.token,
        }),
      )
      assert.equal((await reader.getSession()).mode, 'service_account')
      await assert.rejects(
        reader.createHabit({
          name: 'Denied',
          kind: 'boolean',
          unit: 'count',
          target: 1,
          timezone: 'UTC',
        }),
        (e: unknown) => e instanceof ApiError && e.status === 403,
      )
      const rotated = await c.rotateToken(issued.metadata.id)
      assert.notEqual(rotated.token, issued.token)
      await assert.rejects(
        reader.getSession(),
        (e: unknown) => e instanceof ApiError && e.status === 401,
      )
      await c.revokeToken(rotated.metadata.id)
      await c.revokeServiceAccount(service.id)
      assert.ok((await c.listTokens({ limit: 20, offset: 0 })).length)
      assert.deepEqual(await c.listIntegrations(), [])
      await assert.rejects(
        c.connectHomeAssistant({ token: 'test-only' }),
        (e: unknown) => e instanceof ApiError && e.status === 503,
      )
    } finally {
      child.kill('SIGTERM')
      await new Promise<void>((r) => {
        if (child.exitCode !== null) r()
        else child.once('exit', () => r())
      })
      await rm(directory, { recursive: true, force: true })
    }
  },
)
