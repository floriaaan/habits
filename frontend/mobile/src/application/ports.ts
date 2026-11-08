import type { HabitsConnector } from '../domain/connector'
import type { Session } from '../domain/models'

export interface AppConfig {
  mode: 'fake' | 'http'
  origin: string
  oidc: { issuer: string; clientId: string; audience: string; scopes: string[] }
}
export interface Credentials {
  origin: string
  kind: 'pat' | 'oidc'
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  oidcIssuer?: string
  oidcClientId?: string
  oidcAudience?: string
}
export interface SessionVault {
  generation: number
  onInvalid: () => void
  restore(): Promise<void>
  install(value: Credentials): Promise<void>
  invalidate(generation: number): Promise<void>
  getToken(forceRefresh?: boolean): Promise<string | null>
}
// The application consumes ports; bootstrap alone chooses concrete adapters.
export interface AppearanceAdapter {
  read(): Promise<string | null>
  write(value: 'system' | 'light' | 'dark'): Promise<void>
  apply(value: 'system' | 'light' | 'dark'): void
}
export interface Runtime {
  appearance: AppearanceAdapter
  config: AppConfig
  connector: HabitsConnector
  vault: SessionVault
  fake: { reset(): void; simulateError(status: number): void } | null
  oidc: { enabled: boolean; signIn(): Promise<Credentials | null> }
  verify(credentials: Credentials): Promise<Session>
  verifyCurrentSession(): Promise<Session>
}
