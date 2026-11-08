import type { Runtime } from '../application/ports'
import { ApiError } from '../domain/api-error'
import type { HabitsConnector } from '../domain/connector'
import { appearanceAdapter } from '../infrastructure/appearance'
import { createOidc } from '../infrastructure/auth/oidc'
import { secureStorage } from '../infrastructure/auth/secure-storage'
import { CredentialVault, type Credentials } from '../infrastructure/auth/vault'
import { readConfig } from '../infrastructure/config'
import { FakeHabitsConnector } from '../infrastructure/fake/connector'
import { HttpClient } from '../infrastructure/http/client'
import { HttpHabitsConnector } from '../infrastructure/http/connector'
export function createRuntime(): Runtime {
  const config = readConfig(),
    oidc = createOidc(config)
  const vault = new CredentialVault(config.origin, secureStorage, oidc.refresh)
  const fake = config.mode === 'fake' ? new FakeHabitsConnector(true) : null
  const connector: HabitsConnector =
    fake ?? new HttpHabitsConnector(new HttpClient(config.origin, vault))
  async function verify(credentials: Credentials) {
    return new HttpHabitsConnector(
      new HttpClient(config.origin, {
        generation: 0,
        getToken: async () => credentials.accessToken,
        canRefresh: () => false,
        invalidate: async () => {},
      }),
    ).getSession()
  }
  return {
    appearance: appearanceAdapter,
    config,
    connector,
    vault,
    fake,
    oidc,
    verify,
    async verifyCurrentSession() {
      const token = vault.peekToken()
      if (!token) throw new ApiError('unauthorized', 'Connexion expirée.', 401)
      return verify({ origin: config.origin, kind: 'pat', accessToken: token })
    },
  }
}
