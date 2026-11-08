import { ApiError } from '../../domain/api-error'
import type { WriteOptions } from '../../domain/connector'
export interface AccessSource {
  generation: number
  getToken(forceRefresh?: boolean): Promise<string | null>
  canRefresh(): boolean
  invalidate(generation: number): Promise<void>
}
export class HttpClient {
  constructor(
    private origin: string,
    private access: AccessSource,
    private transport: typeof fetch = fetch,
    private timeoutMs = 10_000,
  ) {}
  async request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    options: WriteOptions = {},
  ): Promise<T> {
    const generation = this.access.generation
    const token = await this.access.getToken()
    if (generation !== this.access.generation)
      throw new ApiError('session_changed', 'La session a changé.')
    let response = await this.send(path, method, token, body, options)
    if (response.status === 401 && generation === this.access.generation) {
      if (this.access.canRefresh()) {
        const refreshed = await this.access.getToken(true)
        if (generation !== this.access.generation)
          throw new ApiError('session_changed', 'La session a changé.')
        if (method !== 'GET')
          throw new ApiError(
            'auth_refreshed',
            'Session renouvelée. Relancez cette action avec la même clé.',
            409,
          )
        response = await this.send(path, method, refreshed, body, options)
      }
      if (response.status === 401) await this.access.invalidate(generation)
    }
    if (generation !== this.access.generation)
      throw new ApiError('session_changed', 'La session a changé.')
    if (!response.ok) {
      let code = `http_${response.status}`,
        message = `Le serveur a répondu ${response.status}.`,
        requestId = response.headers.get('x-request-id') ?? undefined
      try {
        const payload = (await response.json()) as {
          error?: { code?: unknown; message?: unknown; request_id?: unknown }
        }
        if (typeof payload.error?.code === 'string') code = payload.error.code
        if (typeof payload.error?.message === 'string')
          message = payload.error.message
        if (typeof payload.error?.request_id === 'string')
          requestId = payload.error.request_id
      } catch {
        /* Preserve the HTTP error even when a proxy returns HTML. */
      }
      throw new ApiError(code, message, response.status, requestId)
    }
    if (response.status === 204) return undefined as T
    try {
      return (await response.json()) as T
    } catch {
      throw new ApiError(
        'protocol_error',
        'Réponse JSON invalide.',
        response.status,
      )
    }
  }
  private async send(
    path: string,
    method: string,
    token: string | null,
    body: unknown,
    options: WriteOptions,
  ): Promise<Response> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) controller.abort()
    const timer = setTimeout(abort, this.timeoutMs)
    try {
      const response = await this.transport(`${this.origin}/api/v1${path}`, {
        method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.key ? { 'Idempotency-Key': options.key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      // Consume the body while the timeout and caller cancellation are still active.
      const bytes = await response.arrayBuffer()
      return new Response(response.status === 204 ? null : bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch {
      if (options.signal?.aborted)
        throw new ApiError('cancelled', 'Requête annulée.')
      throw new ApiError(
        controller.signal.aborted ? 'timeout' : 'network_error',
        controller.signal.aborted
          ? 'Le serveur ne répond pas à temps.'
          : 'Impossible de contacter le serveur.',
      )
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }
}
