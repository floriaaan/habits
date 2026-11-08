import { ApiError } from '../domain/api-error'
import type { HabitsConnector } from '../domain/connector'

export async function authorizeStrava(
  connector: HabitsConnector,
  openURL: (url: string) => Promise<unknown>,
  demo: boolean,
) {
  const result = await connector.authorizeStrava()
  if (demo) return
  const url = new URL(result.authorization_url)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.strava.com' ||
    url.port ||
    url.username ||
    url.password ||
    !['/oauth/authorize', '/oauth/mobile/authorize'].includes(url.pathname)
  )
    throw new ApiError('protocol_error', 'URL Strava inattendue.')
  await openURL(url.toString())
}
