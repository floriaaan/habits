import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { ApiError } from '../../domain/api-error'
import type { AppConfig } from '../config'
import { authorizationCode } from './protocol'
import type { Credentials } from './vault'
WebBrowser.maybeCompleteAuthSession()
export function createOidc(config: AppConfig) {
  const { issuer, clientId, audience, scopes } = config.oidc
  let discoveryFlight: Promise<AuthSession.DiscoveryDocument> | null = null
  async function discovery() {
    if (!issuer || !clientId || !audience)
      throw new ApiError(
        'configuration',
        'Configurer issuer, client ID et audience OIDC.',
      )
    const url = new URL(issuer)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new ApiError('configuration', 'Issuer OIDC HTTPS requis.')
    if (!discoveryFlight)
      discoveryFlight = AuthSession.fetchDiscoveryAsync(
        issuer.replace(/\/$/, ''),
      ).catch(() => {
        discoveryFlight = null
        throw new ApiError('network_error', 'Discovery OIDC indisponible.')
      })
    const result = await discoveryFlight
    if (result.discoveryDocument?.issuer !== issuer)
      throw new ApiError('protocol_error', 'Issuer discovery inattendu.')
    for (const endpoint of [result.authorizationEndpoint, result.tokenEndpoint])
      if (!endpoint || new URL(endpoint).protocol !== 'https:')
        throw new ApiError('protocol_error', 'Endpoints OIDC HTTPS requis.')
    return result
  }
  function credentials(
    tokens: AuthSession.TokenResponse,
    previous?: Credentials,
  ): Credentials {
    if (
      !tokens.accessToken ||
      String(tokens.tokenType).toLowerCase() !== 'bearer'
    )
      throw new ApiError('protocol_error', 'Access token Bearer manquant.')
    return {
      origin: config.origin,
      kind: 'oidc',
      oidcIssuer: issuer,
      oidcClientId: clientId,
      oidcAudience: audience,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? previous?.refreshToken,
      expiresAt:
        tokens.expiresIn === undefined
          ? undefined
          : (tokens.issuedAt + tokens.expiresIn) * 1000,
    }
  }
  return {
    enabled: !!issuer && !!clientId && !!audience,
    async signIn(): Promise<Credentials | null> {
      const endpoints = await discovery(),
        redirectUri = AuthSession.makeRedirectUri({
          scheme: 'habits',
          path: 'oauth',
        })
      const request = new AuthSession.AuthRequest({
        clientId,
        redirectUri,
        scopes,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
        extraParams: { audience },
      })
      await request.makeAuthUrlAsync(endpoints)
      const result = await request.promptAsync(endpoints)
      const code = authorizationCode(result, request.state)
      if (code === null) return null
      if (!request.codeVerifier)
        throw new ApiError('oauth_error', 'Vérificateur PKCE manquant.')
      try {
        return credentials(
          await AuthSession.exchangeCodeAsync(
            {
              clientId,
              code,
              redirectUri,
              extraParams: { code_verifier: request.codeVerifier },
            },
            endpoints,
          ),
        )
      } catch {
        throw new ApiError('oauth_error', 'Échange du code OAuth impossible.')
      }
    },
    async refresh(previous: Credentials): Promise<Credentials> {
      try {
        if (
          previous.oidcIssuer !== issuer ||
          previous.oidcClientId !== clientId ||
          previous.oidcAudience !== audience
        )
          throw new ApiError(
            'invalid_grant',
            'Configuration OIDC modifiée : reconnectez-vous.',
            401,
          )
        const endpoints = await discovery()
        const tokens = await AuthSession.refreshAsync(
          {
            clientId,
            refreshToken: previous.refreshToken!,
            extraParams: { audience },
          },
          endpoints,
        )
        return credentials(tokens, previous)
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : ''
        if (code === 'invalid_grant')
          throw new ApiError(
            'invalid_grant',
            'La connexion doit être renouvelée.',
            401,
          )
        if (error instanceof ApiError) throw error
        throw new ApiError('network_error', 'Renouvellement OIDC indisponible.')
      }
    },
  }
}
