import type { AccountAuth, Credentials } from '../../application/ports'
import { ApiError } from '../../domain/api-error'
import { HttpClient } from '../http/client'

export function createAccountAuth(
  origin: string,
  transport: typeof fetch = fetch,
): AccountAuth {
  const client = new HttpClient(
    origin,
    {
      generation: 0,
      getToken: async () => null,
      canRefresh: () => false,
      invalidate: async () => {},
    },
    transport,
  )
  async function tokens(path: string, body: unknown): Promise<Credentials> {
    let value: {
      access_token: string
      refresh_token: string
      expires_in: number
    }
    try {
      value = await client.request(path, 'POST', body)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        throw new ApiError(
          'invalid_grant',
          'Adresse e-mail ou mot de passe incorrect.',
          401,
        )
      if (error instanceof ApiError && error.status === 404)
        throw new ApiError(
          'account_unavailable',
          'La connexion par e-mail n’est pas activée sur cette instance.',
          404,
        )
      throw error
    }
    if (
      typeof value?.access_token !== 'string' ||
      !value.access_token.startsWith('hs_') ||
      typeof value.refresh_token !== 'string' ||
      !value.refresh_token.startsWith('hr_') ||
      !Number.isFinite(value.expires_in) ||
      value.expires_in <= 0
    )
      throw new ApiError('protocol_error', 'Réponse de connexion invalide.')
    return {
      origin,
      kind: 'account',
      accessToken: value.access_token,
      refreshToken: value.refresh_token,
      expiresAt: Date.now() + value.expires_in * 1000,
    }
  }
  return {
    login: (email, password) => tokens('/auth/login', { email, password }),
    register: (email, password, timezone) =>
      client.request('/auth/register', 'POST', { email, password, timezone }),
    forgot: (email) =>
      client.request('/auth/forgot-password', 'POST', { email }),
    reset: (email, code, password) =>
      client.request('/auth/reset-password', 'POST', { email, code, password }),
    refresh: (credentials) =>
      tokens('/auth/refresh', { refresh_token: credentials.refreshToken }),
    logout: (credentials) =>
      client.request('/auth/logout', 'POST', {
        refresh_token: credentials.refreshToken,
      }),
  }
}
