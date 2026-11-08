import type * as M from './models'
export interface ReadOptions {
  signal?: AbortSignal
}
export interface WriteOptions extends ReadOptions {
  key?: string
}
export interface HabitsConnector {
  getSession(options?: ReadOptions): Promise<M.Session>
  getVersion(options?: ReadOptions): Promise<M.Version>
  getOpenApi(options?: ReadOptions): Promise<unknown>
  getDashboard(options?: ReadOptions): Promise<M.Dashboard>
  listHabits(page: M.Page, options?: ReadOptions): Promise<M.Items<M.Habit>>
  getHabit(id: string, options?: ReadOptions): Promise<M.Habit>
  createHabit(input: M.NewHabit, options?: WriteOptions): Promise<M.Habit>
  setupHabit(input: M.HabitSetup, options: WriteOptions): Promise<M.Habit>
  updateHabit(
    id: string,
    input: M.HabitVersion,
    options?: WriteOptions,
  ): Promise<M.HabitVersion>
  archiveHabit(id: string, options?: WriteOptions): Promise<void>
  getVersions(
    id: string,
    page: M.Page,
    options?: ReadOptions,
  ): Promise<M.HabitVersion[]>
  setPresentation(
    id: string,
    input: M.Presentation,
    options?: WriteOptions,
  ): Promise<M.Presentation>
  habitAction(
    id: string,
    input: M.ActionRequest,
    options: WriteOptions,
  ): Promise<M.ActionReceipt>
  listEntries(
    id: string,
    page: M.Page,
    options?: ReadOptions,
  ): Promise<M.Items<M.Entry>>
  getEntry(id: string, options?: ReadOptions): Promise<M.Entry>
  recordEntry(
    id: string,
    input: M.NewEntry,
    options: WriteOptions,
  ): Promise<M.Entry>
  correctEntry(
    id: string,
    input: M.NewEntry,
    options: WriteOptions,
  ): Promise<M.Entry>
  cancelEntry(id: string, options: WriteOptions): Promise<void>
  getRests(
    id: string,
    page: M.Page,
    options?: ReadOptions,
  ): Promise<M.RestException[]>
  setRest(id: string, date: string, options?: WriteOptions): Promise<void>
  removeRest(id: string, date: string, options?: WriteOptions): Promise<void>
  getStatistics(id: string, options?: ReadOptions): Promise<M.HabitStatistics>
  recalculate(id: string, options?: WriteOptions): Promise<void>
  getGamification(options?: ReadOptions): Promise<M.Gamification>
  getLedger(
    page: M.Page,
    options?: ReadOptions,
  ): Promise<M.Items<M.LedgerEntry>>
  listTokens(page: M.Page, options?: ReadOptions): Promise<M.TokenMetadata[]>
  createToken(input: M.NewToken, options?: WriteOptions): Promise<M.IssuedToken>
  rotateToken(id: string, options?: WriteOptions): Promise<M.IssuedToken>
  revokeToken(id: string, options?: WriteOptions): Promise<void>
  createServiceAccount(
    input: { name: string },
    options?: WriteOptions,
  ): Promise<M.ServiceAccount>
  revokeServiceAccount(id: string, options?: WriteOptions): Promise<void>
  listIntegrations(options?: ReadOptions): Promise<M.Integration[]>
  connectHomeAssistant(
    input: { token: string },
    options?: WriteOptions,
  ): Promise<M.Integration>
  notifyHomeAssistant(
    input: M.Notification,
    options: WriteOptions,
  ): Promise<M.JobAccepted>
  authorizeStrava(
    options?: WriteOptions,
  ): Promise<{ authorization_url: string }>
  setStravaMapping(input: M.Mapping, options?: WriteOptions): Promise<void>
  syncStrava(options: WriteOptions): Promise<M.JobAccepted>
  disconnectIntegration(id: string, options?: WriteOptions): Promise<void>
  getJob(id: string, options?: ReadOptions): Promise<M.Job>
}
