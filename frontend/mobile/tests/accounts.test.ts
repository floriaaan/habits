import assert from 'node:assert/strict'
import test from 'node:test'
import { createAccountAuth } from '../src/infrastructure/auth/accounts'
import { CredentialVault } from '../src/infrastructure/auth/vault'
import { ApiError } from '../src/domain/api-error'

test('account forms use public endpoints; credentials are normalized into a renewable secure session', async () => {
  const requests: { url: string; body: unknown; auth: unknown }[] = []
  const auth = createAccountAuth(
    'https://habits.example',
    async (url, options) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(options?.body)),
        auth: (options?.headers as Record<string, string>).Authorization,
      })
      return String(url).endsWith('/login') || String(url).endsWith('/refresh')
        ? Response.json({
            access_token: 'hs_access',
            refresh_token: 'hr_refresh',
            expires_in: 900,
          })
        : new Response(null, { status: 204 })
    },
  )
  await auth.register('a@example.fr', 'a long password', 'Europe/Paris')
  await auth.forgot('a@example.fr')
  await auth.reset('a@example.fr', '87654321', 'a new password')
  const credentials = await auth.login('a@example.fr', 'a long password')
  assert.equal(credentials.kind, 'account')
  assert.equal(credentials.origin, 'https://habits.example')
  assert.ok(credentials.expiresAt! > Date.now())
  await auth.refresh(credentials)
  await auth.logout(credentials)
  assert.deepEqual(
    requests.map((r) => r.url.split('/').at(-1)),
    [
      'register',
      'forgot-password',
      'reset-password',
      'login',
      'refresh',
      'logout',
    ],
  )
  assert.ok(requests.every((r) => r.auth === undefined))
  assert.deepEqual(requests.at(-1)?.body, { refresh_token: 'hr_refresh' })
})

test('account vault restores, refreshes once and clears rejected refresh credentials', async () => {
  let stored: string | null = null,
    refreshes = 0
  const auth = createAccountAuth(
    'https://habits.example',
    async () => new Response(null, { status: 401 }),
  )
  const vault = new CredentialVault(
    'https://habits.example',
    {
      read: async () => stored,
      write: async (value) => {
        stored = value
      },
    },
    async (c) => {
      refreshes++
      return {
        ...c,
        accessToken: 'hs_new',
        refreshToken: 'hr_new',
        expiresAt: Date.now() + 900_000,
      }
    },
  )
  await vault.install({
    origin: 'https://habits.example',
    kind: 'account',
    accessToken: 'hs_old',
    refreshToken: 'hr_old',
    expiresAt: 1,
  })
  await vault.restore()
  assert.equal(vault.canRefresh(), true)
  assert.deepEqual(await Promise.all([vault.getToken(), vault.getToken()]), [
    'hs_new',
    'hs_new',
  ])
  assert.equal(refreshes, 1)
  const expired = new CredentialVault(
    'https://habits.example',
    {
      read: async () => stored,
      write: async (value) => {
        stored = value
      },
    },
    auth.refresh,
  )
  await expired.restore()
  await assert.rejects(
    () => expired.getToken(true),
    (e) => e instanceof ApiError && e.code === 'invalid_grant',
  )
  assert.equal(stored, null)
  assert.equal(await expired.getToken(), null)
})
