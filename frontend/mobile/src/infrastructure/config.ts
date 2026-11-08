import type { AppConfig } from '../application/ports'
import { ApiError } from '../domain/api-error'
export function apiOrigin(
  value: string | undefined,
  allowHttp: boolean,
): string {
  if (!value)
    throw new ApiError(
      'configuration',
      'EXPO_PUBLIC_API_URL est obligatoire en mode HTTP.',
    )
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ApiError('configuration', 'Adresse serveur invalide.')
  }
  if (
    (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new ApiError(
      'configuration',
      'Configurer une origine HTTPS sans chemin, paramètres ou credentials.',
    )
  return url.origin
}
export function readConfig(): AppConfig {
  const mode = process.env.EXPO_PUBLIC_CONNECTOR_MODE ?? 'fake'
  if (mode !== 'fake' && mode !== 'http')
    throw new ApiError(
      'configuration',
      'EXPO_PUBLIC_CONNECTOR_MODE doit valoir fake ou http.',
    )
  return {
    mode,
    origin:
      mode === 'http'
        ? apiOrigin(
            process.env.EXPO_PUBLIC_API_URL,
            __DEV__ && process.env.EXPO_PUBLIC_ALLOW_HTTP === 'true',
          )
        : 'fake',
    oidc: {
      issuer: process.env.EXPO_PUBLIC_OIDC_ISSUER ?? '',
      clientId: process.env.EXPO_PUBLIC_OIDC_CLIENT_ID ?? '',
      audience: process.env.EXPO_PUBLIC_OIDC_AUDIENCE ?? '',
      scopes: (process.env.EXPO_PUBLIC_OIDC_SCOPES ?? 'openid')
        .split(/\s+/)
        .filter(Boolean),
    },
  }
}
export type { AppConfig } from '../application/ports'
