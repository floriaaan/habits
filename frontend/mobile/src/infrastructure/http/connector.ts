import { ApiError } from '../../domain/api-error'
import type {
  HabitsConnector,
  ReadOptions,
  WriteOptions,
} from '../../domain/connector'
import type * as M from '../../domain/models'
import { scopes } from '../../domain/models'
import { HttpClient } from './client'
const segment = encodeURIComponent
const pageQuery = (page: M.Page) => `?limit=${page.limit}&offset=${page.offset}`
export class HttpHabitsConnector implements HabitsConnector {
  constructor(private client: HttpClient) {}
  async getSession(options?: ReadOptions): Promise<M.Session> {
    const value = await this.client.request<M.Session>(
      `/session`,
      'GET',
      undefined,
      options,
    )
    if (
      !value ||
      typeof value.user_id !== 'string' ||
      ![
        'personal_access_token',
        'service_account',
        'oidc_access_token',
      ].includes(value.mode) ||
      !Array.isArray(value.scopes) ||
      !value.scopes.every((scope) => scopes.includes(scope))
    )
      throw new ApiError('protocol_error', 'Réponse de session invalide.')
    return value
  }
  getVersion(options?: ReadOptions): Promise<M.Version> {
    return this.client.request(``, 'GET', undefined, options)
  }
  getOpenApi(options?: ReadOptions): Promise<unknown> {
    return this.client.request(`/openapi.json`, 'GET', undefined, options)
  }
  getDashboard(options?: ReadOptions): Promise<M.Dashboard> {
    return this.client.request(`/dashboard`, 'GET', undefined, options)
  }
  listHabits(page: M.Page, options?: ReadOptions): Promise<M.Items<M.Habit>> {
    return this.client.request(
      `/habits${pageQuery(page)}`,
      'GET',
      undefined,
      options,
    )
  }
  getHabit(id: string, options?: ReadOptions): Promise<M.Habit> {
    return this.client.request(
      `/habits/${segment(id)}`,
      'GET',
      undefined,
      options,
    )
  }
  createHabit(input: M.NewHabit, options?: WriteOptions): Promise<M.Habit> {
    return this.client.request(`/habits`, 'POST', input, options)
  }
  setupHabit(input: M.HabitSetup, options: WriteOptions): Promise<M.Habit> {
    return this.client.request(`/habits/setup`, 'POST', input, options)
  }
  updateHabit(
    id: string,
    input: M.HabitVersion,
    options?: WriteOptions,
  ): Promise<M.HabitVersion> {
    return this.client.request(`/habits/${segment(id)}`, 'PUT', input, options)
  }
  archiveHabit(id: string, options?: WriteOptions): Promise<void> {
    return this.client.request(
      `/habits/${segment(id)}`,
      'DELETE',
      undefined,
      options,
    )
  }
  getVersions(
    id: string,
    page: M.Page,
    options?: ReadOptions,
  ): Promise<M.HabitVersion[]> {
    return this.client.request(
      `/habits/${segment(id)}/versions${pageQuery(page)}`,
      'GET',
      undefined,
      options,
    )
  }
  setPresentation(
    id: string,
    input: M.Presentation,
    options?: WriteOptions,
  ): Promise<M.Presentation> {
    return this.client.request(
      `/habits/${segment(id)}/presentation`,
      'PUT',
      input,
      options,
    )
  }
  habitAction(
    id: string,
    input: M.ActionRequest,
    options: WriteOptions,
  ): Promise<M.ActionReceipt> {
    return this.client.request(
      `/habits/${segment(id)}/actions`,
      'POST',
      input,
      options,
    )
  }
  listEntries(
    id: string,
    page: M.Page,
    options?: ReadOptions,
  ): Promise<M.Items<M.Entry>> {
    return this.client.request(
      `/habits/${segment(id)}/entries${pageQuery(page)}`,
      'GET',
      undefined,
      options,
    )
  }
  getEntry(id: string, options?: ReadOptions): Promise<M.Entry> {
    return this.client.request(
      `/entries/${segment(id)}`,
      'GET',
      undefined,
      options,
    )
  }
  recordEntry(
    id: string,
    input: M.NewEntry,
    options: WriteOptions,
  ): Promise<M.Entry> {
    return this.client.request(
      `/habits/${segment(id)}/entries`,
      'POST',
      input,
      options,
    )
  }
  correctEntry(
    id: string,
    input: M.NewEntry,
    options: WriteOptions,
  ): Promise<M.Entry> {
    return this.client.request(`/entries/${segment(id)}`, 'PUT', input, options)
  }
  cancelEntry(id: string, options: WriteOptions): Promise<void> {
    return this.client.request(
      `/entries/${segment(id)}`,
      'DELETE',
      undefined,
      options,
    )
  }
  getRests(
    id: string,
    page: M.Page,
    options?: ReadOptions,
  ): Promise<M.RestException[]> {
    return this.client.request(
      `/habits/${segment(id)}/exceptions${pageQuery(page)}`,
      'GET',
      undefined,
      options,
    )
  }
  setRest(id: string, date: string, options?: WriteOptions): Promise<void> {
    return this.client.request(
      `/habits/${segment(id)}/exceptions/${segment(date)}`,
      'PUT',
      undefined,
      options,
    )
  }
  removeRest(id: string, date: string, options?: WriteOptions): Promise<void> {
    return this.client.request(
      `/habits/${segment(id)}/exceptions/${segment(date)}`,
      'DELETE',
      undefined,
      options,
    )
  }
  getStatistics(id: string, options?: ReadOptions): Promise<M.HabitStatistics> {
    return this.client.request(
      `/habits/${segment(id)}/statistics`,
      'GET',
      undefined,
      options,
    )
  }
  recalculate(id: string, options?: WriteOptions): Promise<void> {
    return this.client.request(
      `/habits/${segment(id)}/recalculate`,
      'POST',
      undefined,
      options,
    )
  }
  getGamification(options?: ReadOptions): Promise<M.Gamification> {
    return this.client.request(`/gamification`, 'GET', undefined, options)
  }
  getLedger(
    page: M.Page,
    options?: ReadOptions,
  ): Promise<M.Items<M.LedgerEntry>> {
    return this.client.request(
      `/gamification/ledger${pageQuery(page)}`,
      'GET',
      undefined,
      options,
    )
  }
  listTokens(page: M.Page, options?: ReadOptions): Promise<M.TokenMetadata[]> {
    return this.client.request(
      `/tokens${pageQuery(page)}`,
      'GET',
      undefined,
      options,
    )
  }
  createToken(
    input: M.NewToken,
    options?: WriteOptions,
  ): Promise<M.IssuedToken> {
    return this.client.request(`/tokens`, 'POST', input, options)
  }
  rotateToken(id: string, options?: WriteOptions): Promise<M.IssuedToken> {
    return this.client.request(
      `/tokens/${segment(id)}/rotate`,
      'POST',
      undefined,
      options,
    )
  }
  revokeToken(id: string, options?: WriteOptions): Promise<void> {
    return this.client.request(
      `/tokens/${segment(id)}`,
      'DELETE',
      undefined,
      options,
    )
  }
  createServiceAccount(
    input: { name: string },
    options?: WriteOptions,
  ): Promise<M.ServiceAccount> {
    return this.client.request(`/service-accounts`, 'POST', input, options)
  }
  revokeServiceAccount(id: string, options?: WriteOptions): Promise<void> {
    return this.client.request(
      `/service-accounts/${segment(id)}`,
      'DELETE',
      undefined,
      options,
    )
  }
  listIntegrations(options?: ReadOptions): Promise<M.Integration[]> {
    return this.client.request(`/integrations`, 'GET', undefined, options)
  }
  connectHomeAssistant(
    input: { token: string },
    options?: WriteOptions,
  ): Promise<M.Integration> {
    return this.client.request(
      `/integrations/home-assistant`,
      'PUT',
      input,
      options,
    )
  }
  notifyHomeAssistant(
    input: M.Notification,
    options: WriteOptions,
  ): Promise<M.JobAccepted> {
    return this.client.request(
      `/integrations/home-assistant/notifications`,
      'POST',
      input,
      options,
    )
  }
  authorizeStrava(
    options?: WriteOptions,
  ): Promise<{ authorization_url: string }> {
    return this.client.request(
      `/integrations/strava/authorize`,
      'POST',
      undefined,
      options,
    )
  }
  setStravaMapping(input: M.Mapping, options?: WriteOptions): Promise<void> {
    return this.client.request(
      `/integrations/strava/mappings`,
      'PUT',
      input,
      options,
    )
  }
  syncStrava(options: WriteOptions): Promise<M.JobAccepted> {
    return this.client.request(
      `/integrations/strava/sync`,
      'POST',
      undefined,
      options,
    )
  }
  disconnectIntegration(id: string, options?: WriteOptions): Promise<void> {
    return this.client.request(
      `/integrations/${segment(id)}`,
      'DELETE',
      undefined,
      options,
    )
  }
  getJob(id: string, options?: ReadOptions): Promise<M.Job> {
    return this.client.request(
      `/jobs/${segment(id)}`,
      'GET',
      undefined,
      options,
    )
  }
}
