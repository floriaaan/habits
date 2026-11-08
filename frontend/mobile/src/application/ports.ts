import type { HabitsConnector } from '../domain/connector'
import type { Session } from '../domain/models'

export interface AppConfig {
  mode: 'fake' | 'http'
  origin: string
  oidc: { issuer: string; clientId: string; audience: string; scopes: string[] }
}
export interface Credentials {
  origin: string
  kind: 'pat' | 'oidc' | 'account'
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
  current?(): Credentials | null
}
// The application consumes ports; bootstrap alone chooses concrete adapters.
export interface AppearanceAdapter {
  read(): Promise<string | null>
  write(value: 'system' | 'light' | 'dark'): Promise<void>
  apply(value: 'system' | 'light' | 'dark'): void
}
export interface AccountAuth {
  login(email: string, password: string): Promise<Credentials>
  register(email: string, password: string, timezone: string): Promise<void>
  forgot(email: string): Promise<void>
  reset(email: string, code: string, password: string): Promise<void>
  refresh(credentials: Credentials): Promise<Credentials>
  logout(credentials: Credentials): Promise<void>
}
export interface Runtime {
  accounts: AccountAuth
  appearance: AppearanceAdapter
  config: AppConfig
  connector: HabitsConnector
  vault: SessionVault
  fake: { reset(): void; simulateError(status: number): void } | null
  oidc: { enabled: boolean; signIn(): Promise<Credentials | null> }
  verify(credentials: Credentials): Promise<Session>
  verifyCurrentSession(): Promise<Session>
}
