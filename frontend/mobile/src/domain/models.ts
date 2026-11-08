export const scopes = [
  'habits:read',
  'habits:write',
  'entries:read',
  'entries:write',
  'statistics:read',
  'integrations:manage',
  'notifications:write',
  'tokens:manage',
] as const
export type Scope = (typeof scopes)[number]
export interface Session {
  user_id: string
  mode:
    | 'personal_access_token'
    | 'service_account'
    | 'oidc_access_token'
    | 'mobile_session'
  scopes: Scope[]
}
export type Category = 'nutrition' | 'sport' | 'mind' | 'daily'
export type HabitKind = 'boolean' | 'quantity' | 'duration' | 'frequency'
export type Unit = 'count' | 'meters' | 'seconds' | 'milliliters'
export interface Schedule {
  weekdays: number[]
  start: string | null
  end: string | null
}
export interface NewHabit {
  name: string
  category?: Category
  period?: 'daily' | 'weekly'
  kind: HabitKind
  unit: Unit
  target: number
  timezone: string
  schedule?: Schedule
}
export interface Habit extends NewHabit {
  id: string
  user_id: string
  category: Category
  period: 'daily' | 'weekly'
  schedule: Schedule
  created_at: string
  archived_at: string | null
}
export interface Page {
  limit: number
  offset: number
}
export interface Items<T> extends Page {
  items: T[]
}
export interface HabitVersion {
  effective_from: string
  definition: NewHabit
}
export interface Presentation {
  icon: string | null
  color: string | null
  order: number
  weight: number
  step: number
  illustration: 'plain' | 'water' | 'portions'
  reminder_at: string | null
}
export interface HabitSetup {
  habit: NewHabit
  presentation?: Partial<Presentation>
}
export interface NewEntry {
  occurred_at: string
  value: number
}
export interface Entry extends NewEntry {
  id: string
  habit_id: string
  user_id: string
  local_date: string
  created_at: string
}
export type HabitAction =
  | 'complete'
  | 'uncomplete'
  | 'increment'
  | 'decrement'
  | 'set_value'
export interface ActionRequest {
  action: HabitAction
  value?: number
}
export interface ActionReceipt {
  id: string
  habit_id: string
  action: HabitAction
  local_date: string
  progress: number
}
export interface RestException {
  id: string
  user_id: string
  habit_id: string
  local_date: string
}
export interface Streak {
  current: number
  record: number
}
export interface PeriodResult {
  start: string
  end: string
  progress: number
  target: number
  eligible_days: number
  completed: boolean
}
export interface DayResult {
  date: string
  eligible: boolean
  progress: number
  period_start: string
  completed: boolean
}
export interface HabitStatistics {
  through: string
  periods: PeriodResult[]
  heatmap: DayResult[]
  windows: {
    days: number
    eligible_periods: number
    completed_periods: number
    success_rate: number | null
  }[]
  streak: Streak
  xp: number
  level: number
}
export interface Gamification {
  xp: number
  level: number
  badges: string[]
}
export interface LedgerEntry {
  id: string
  user_id: string
  event_id: string
  habit_id: string
  period_start: string
  amount: number
  compensates_id: string | null
  created_at: string
}
export interface DashboardHabit {
  habit: Habit
  presentation: Presentation
  local_date: string
  eligible: boolean
  actionable: boolean
  progress: number
  target: number
  percent: number | null
  completed: boolean
}
export interface DashboardDay {
  date: string
  percent: number | null
  completed: number
  eligible: number
}
export interface Dashboard {
  user_id: string
  generated_at: string
  date: string
  timezone: string
  revision: number
  global_percent: number | null
  groups: {
    category: Category
    percent: number | null
    completed: number
    eligible: number
    habits: DashboardHabit[]
  }[]
  weekly: {
    current: DashboardDay[]
    previous: DashboardDay[]
    current_percent: number | null
    previous_percent: number | null
    current_success_percent: number | null
    previous_success_percent: number | null
  }
  heatmap: DashboardDay[]
  gamification: Gamification
  streak_91_days: Streak
}
export interface NewToken {
  scopes: Scope[]
  expires_at: string
  service_account_id: string | null
}
export interface TokenMetadata extends NewToken {
  id: string
  user_id: string
  revoked_at: string | null
  created_at: string
}
export interface IssuedToken {
  token: string
  metadata: TokenMetadata
}
export interface ServiceAccount {
  id: string
  name: string
  revoked_at: string | null
  created_at: string
}
export interface Integration {
  id: string
  provider: 'home_assistant' | 'strava'
  connected: boolean
}
export interface Notification {
  title: string
  message: string
}
export interface Mapping {
  sport: 'Run' | 'Swim'
  habit_id: string
  metric: 'distance' | 'moving_time' | 'count'
}
export interface JobAccepted {
  job_id: string
}
export interface Job {
  id: string
  state: string
  attempts: number
  available_at: string
}
export interface Version {
  version: string
}
export const defaultPresentation: Presentation = {
  icon: null,
  color: null,
  order: 0,
  weight: 1,
  step: 1,
  illustration: 'plain',
  reminder_at: null,
}
