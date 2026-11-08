import type { Credentials } from '../../application/ports'
import { ApiError } from '../../domain/api-error'
import type { AccessSource } from '../http/client'
export type { Credentials } from '../../application/ports'
export interface CredentialStorage {
  read(): Promise<string | null>
  write(value: string | null): Promise<void>
}
export type Refresh = (credentials: Credentials) => Promise<Credentials>
export class CredentialVault implements AccessSource {
  generation = 0
  private credentials: Credentials | null = null
  private refreshFlight: Promise<string | null> | null = null
  private writes: Promise<void> = Promise.resolve()
  onInvalid: () => void = () => {}
  constructor(
    readonly origin: string,
    private storage: CredentialStorage,
    private refresh: Refresh,
  ) {}
  private save(value: Credentials | null) {
    const serialized = value ? JSON.stringify(value) : null
    const next = this.writes
      .catch(() => {})
      .then(() => this.storage.write(serialized))
    this.writes = next
    return next
  }
  async restore() {
    const generation = this.generation
    const raw = await this.storage.read()
    if (generation !== this.generation) return
    if (!raw) {
      this.credentials = null
      return
    }
    let value: Partial<Credentials>
    try {
      value = JSON.parse(raw) as Partial<Credentials>
    } catch {
      this.credentials = null
      await this.save(null)
      return
    }
    if (
      !value ||
      typeof value !== 'object' ||
      typeof value.accessToken !== 'string' ||
      value.origin !== this.origin ||
      !value.accessToken ||
      !['pat', 'oidc'].includes(value.kind ?? '') ||
      (value.refreshToken !== undefined &&
        typeof value.refreshToken !== 'string') ||
      (value.expiresAt !== undefined && !Number.isFinite(value.expiresAt))
    ) {
      this.credentials = null
      await this.save(null)
      return
    }
    this.credentials = value as Credentials
  }
  async install(value: Credentials) {
    if (
      !value ||
      typeof value !== 'object' ||
      typeof value.accessToken !== 'string' ||
      value.origin !== this.origin
    )
      throw new ApiError('configuration', 'Instance de connexion incorrecte.')
    const generation = ++this.generation
    this.refreshFlight = null
    this.credentials = value
    try {
      await this.save(value)
    } catch {
      if (generation === this.generation) {
        this.credentials = null
        this.generation++
      }
      throw new ApiError(
        'storage_error',
        'Impossible de sauvegarder la connexion sécurisée.',
      )
    }
  }
  async invalidate(generation: number) {
    if (generation !== this.generation) return
    this.generation++
    this.credentials = null
    this.refreshFlight = null
    this.onInvalid()
    await this.save(null)
  }
  peekToken() {
    return this.credentials?.accessToken ?? null
  }
  canRefresh() {
    return this.credentials?.kind === 'oidc' && !!this.credentials.refreshToken
  }
  async getToken(forceRefresh = false): Promise<string | null> {
    const credentials = this.credentials
    if (!credentials) return null
    if (
      forceRefresh ||
      (credentials.expiresAt !== undefined &&
        credentials.expiresAt <= Date.now() + 30_000)
    ) {
      if (!this.canRefresh()) {
        await this.invalidate(this.generation)
        throw new ApiError('unauthorized', 'La connexion a expiré.', 401)
      }
      if (this.refreshFlight) return this.refreshFlight
      const generation = this.generation
      const flight = (async () => {
        try {
          const next = await this.refresh(credentials)
          if (generation !== this.generation)
            throw new ApiError('session_changed', 'La session a changé.')
          // Save the complete rotated pair in one storage item before using it.
          await this.save(next)
          if (generation !== this.generation)
            throw new ApiError('session_changed', 'La session a changé.')
          this.credentials = next
          return next.accessToken
        } catch (error) {
          if (error instanceof ApiError && error.code === 'invalid_grant')
            await this.invalidate(generation)
          throw error
        }
      })()
      this.refreshFlight = flight
      try {
        return await flight
      } finally {
        if (this.refreshFlight === flight) this.refreshFlight = null
      }
    }
    return credentials.accessToken
  }
}
