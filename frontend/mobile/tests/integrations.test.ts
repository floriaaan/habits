import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeStrava } from '../src/application/integration-commands'
import { FakeHabitsConnector } from '../src/infrastructure/fake/connector'

test('Strava opens only the HTTPS authorization endpoint; demo never opens a browser', async () => {
  const connector = new FakeHabitsConnector()
  const opened: string[] = []
  const open = async (url: string) => {
    opened.push(url)
  }
  await authorizeStrava(connector, open, true)
  assert.deepEqual(opened, [])
  for (const url of [
    'http://www.strava.com/oauth/authorize',
    'https://strava.com.evil.test/oauth/authorize',
    'https://www.strava.com@evil.test/oauth/authorize',
    'https://user:password@www.strava.com/oauth/authorize',
    'https://www.strava.com:8443/oauth/authorize',
    'https://www.strava.com/unexpected',
    'javascript:alert(1)',
  ]) {
    connector.authorizeStrava = async () => ({ authorization_url: url })
    await assert.rejects(authorizeStrava(connector, open, false))
    assert.deepEqual(opened, [])
  }
  const expected =
    'https://www.strava.com/oauth/authorize?state=server-state&client_id=123'
  connector.authorizeStrava = async () => ({ authorization_url: expected })
  await authorizeStrava(connector, open, false)
  assert.deepEqual(opened, [expected])
})

test('integration menu lifecycle reflects connector state after connecting and disconnecting', async () => {
  const connector = new FakeHabitsConnector()
  assert.deepEqual(await connector.listIntegrations(), [])
  const ha = await connector.connectHomeAssistant({ token: 'demo-token' })
  await authorizeStrava(
    connector,
    async () => assert.fail('Demo must stay local'),
    true,
  )
  assert.deepEqual(
    (await connector.listIntegrations()).map(({ provider, connected }) => ({
      provider,
      connected,
    })),
    [
      { provider: 'home_assistant', connected: true },
      { provider: 'strava', connected: true },
    ],
  )
  await connector.disconnectIntegration(ha.id)
  assert.equal(
    (await connector.listIntegrations()).find(({ id }) => id === ha.id)
      ?.connected,
    false,
  )
})
