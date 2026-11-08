import { ApiError } from '../../domain/api-error'
export function authorizationCode(
  result: { type: string; params?: Record<string, string | undefined> },
  expectedState: string,
): string | null {
  if (result.type === 'cancel' || result.type === 'dismiss') return null
  if (
    result.type !== 'success' ||
    !result.params?.state ||
    result.params.state !== expectedState ||
    !result.params.code
  )
    throw new ApiError('oauth_error', 'Retour OAuth refusé ou état invalide.')
  return result.params.code
}
