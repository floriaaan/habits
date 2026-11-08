import { ApiError } from '../../domain/api-error'
import type { HabitsConnector, WriteOptions } from '../../domain/connector'
import type * as M from '../../domain/models'
import { defaultPresentation, scopes } from '../../domain/models'
const user = '00000000-0000-4000-8000-000000000001'
const today = () => new Date().toISOString().slice(0, 10)
const now = () => new Date().toISOString()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export class FakeHabitsConnector implements HabitsConnector {
  private sequence = 10
  private habits: M.Habit[] = []
  private entries: M.Entry[] = []
  private presentations = new Map<string, M.Presentation>()
  private versions = new Map<string, M.HabitVersion[]>()
  private rests: M.RestException[] = []
  private tokens: M.TokenMetadata[] = []
  private accounts: M.ServiceAccount[] = []
  private integrations: M.Integration[] = []
  private receipts = new Map<string, { fingerprint: string; result: unknown }>()
  private jobs: M.Job[] = []
  private nextError: ApiError | null = null
  constructor(private readonly showcase = false) {
    this.reset()
  }
  private id() {
    return `00000000-0000-4000-8000-${String(this.sequence++).padStart(12, '0')}`
  }
  reset() {
    this.sequence = 10
    this.habits = []
    this.entries = []
    this.presentations.clear()
    this.versions.clear()
    this.rests = []
    this.tokens = []
    this.accounts = []
    this.integrations = []
    this.receipts.clear()
    this.jobs = []
    this.nextError = null
    if (this.showcase) {
      this.seedShowcase()
      return
    }
    this.addHabit({
      name: 'Boire de l’eau',
      category: 'nutrition',
      kind: 'quantity',
      unit: 'milliliters',
      target: 2000,
      timezone: 'UTC',
    })
    this.addHabit({
      name: 'Lire',
      category: 'mind',
      kind: 'boolean',
      unit: 'count',
      target: 1,
      timezone: 'UTC',
    })
  }
  private seedShowcase() {
    const definitions: [
      string,
      M.Category,
      M.HabitKind,
      M.Unit,
      number,
      number,
      number,
    ][] = [
      ['Course à pied', 'sport', 'quantity', 'meters', 5000, 3000, 1000],
      ['Méditer', 'mind', 'duration', 'seconds', 600, 600, 60],
      ['Lire', 'mind', 'boolean', 'count', 1, 1, 1],
      ['Ranger', 'daily', 'boolean', 'count', 1, 0, 1],
      [
        'Boire de l’eau',
        'nutrition',
        'quantity',
        'milliliters',
        2000,
        1500,
        250,
      ],
      ['Manger des fruits', 'nutrition', 'frequency', 'count', 3, 2, 1],
    ]
    for (const [
      name,
      category,
      kind,
      unit,
      target,
      value,
      step,
    ] of definitions) {
      const habit = this.addHabit({
        name,
        category,
        kind,
        unit,
        target,
        timezone: 'UTC',
      })
      const start = new Date()
      start.setUTCDate(start.getUTCDate() - 29)
      this.versions.set(habit.id, [
        {
          effective_from: start.toISOString().slice(0, 10),
          definition: { ...habit },
        },
      ])
      this.presentations.set(habit.id, {
        ...defaultPresentation,
        step,
        illustration: unit === 'milliliters' ? 'water' : 'plain',
      })
      if (value) this.addEntry(habit.id, { occurred_at: now(), value })
      for (let ago = 29; ago > 0; ago--) {
        const date = new Date()
        date.setUTCDate(date.getUTCDate() - ago)
        // Synthetic, labeled demo history; no HTTP data or server statistics are replaced.
        const ratio = [0.45, 0.72, 1, 1, 0.78, 1][(6 - (ago % 6)) % 6]!
        const historical =
          kind === 'boolean'
            ? +(ratio >= (category === 'mind' ? 0.5 : 0.75))
            : Math.min(target, Math.round((target * ratio) / step) * step)
        if (historical)
          this.addEntry(habit.id, {
            occurred_at: date.toISOString(),
            value: historical,
          })
      }
    }
  }
  simulateError(status: number) {
    this.nextError = new ApiError(
      `fake_${status}`,
      'Erreur simulée.',
      status,
      'fake-request',
    )
  }
  private check() {
    const error = this.nextError
    this.nextError = null
    if (error) throw error
  }
  private find<T extends { id: string }>(items: T[], id: string): T {
    const item = items.find((i) => i.id === id)
    if (!item) throw new ApiError('not_found', 'Objet introuvable.', 404)
    return item
  }
  private page<T>(items: T[], page: M.Page) {
    if (
      page.limit < 1 ||
      page.limit > 100 ||
      page.offset < 0 ||
      page.offset > 100000
    )
      throw new ApiError('validation_error', 'Pagination invalide.', 422)
    return clone(items.slice(page.offset, page.offset + page.limit))
  }
  private replay<T>(
    operation: string,
    input: unknown,
    options: WriteOptions,
    run: () => T,
  ): T {
    this.check()
    if (!options.key)
      throw new ApiError(
        'validation_error',
        'Idempotency-Key obligatoire.',
        422,
      )
    const fingerprint = JSON.stringify([operation, input]),
      previous = this.receipts.get(options.key)
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new ApiError(
          'conflict',
          'Clé déjà utilisée pour une autre action.',
          409,
        )
      return previous.result === undefined
        ? (undefined as T)
        : (clone(previous.result) as T)
    }
    const result = run()
    this.receipts.set(options.key, { fingerprint, result })
    return result === undefined ? result : clone(result)
  }
  private addHabit(input: M.NewHabit): M.Habit {
    if (
      !input.name.trim() ||
      !Number.isFinite(input.target) ||
      input.target <= 0
    )
      throw new ApiError(
        'validation_error',
        'Nom et objectif positif requis.',
        422,
      )
    const habit: M.Habit = {
      ...clone(input),
      id: this.id(),
      user_id: user,
      category: input.category ?? 'daily',
      period: input.period ?? 'daily',
      schedule: input.schedule ?? {
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        start: null,
        end: null,
      },
      created_at: now(),
      archived_at: null,
    }
    this.habits.push(habit)
    this.versions.set(habit.id, [
      { effective_from: today(), definition: clone(input) },
    ])
    return clone(habit)
  }
  async getSession(): Promise<M.Session> {
    this.check()
    return { user_id: user, mode: 'personal_access_token', scopes: [...scopes] }
  }
  async getVersion(): Promise<M.Version> {
    this.check()
    return { version: '0.1.0-fake' }
  }
  async getOpenApi(): Promise<unknown> {
    this.check()
    return {
      simulated: true,
      message: 'Le contrat réel est dans docs/openapi.json.',
    }
  }
  async listHabits(page: M.Page): Promise<M.Items<M.Habit>> {
    this.check()
    return {
      items: this.page(
        this.habits.filter((h) => !h.archived_at),
        page,
      ),
      ...page,
    }
  }
  async getHabit(id: string) {
    this.check()
    return clone(this.find(this.habits, id))
  }
  async createHabit(input: M.NewHabit) {
    this.check()
    return this.addHabit(input)
  }
  async setupHabit(input: M.HabitSetup, options: WriteOptions) {
    return this.replay('setup', input, options, () => {
      const habit = this.addHabit(input.habit)
      this.presentations.set(habit.id, {
        ...defaultPresentation,
        ...input.presentation,
      })
      return habit
    })
  }
  async updateHabit(id: string, input: M.HabitVersion) {
    this.check()
    const habit = this.find(this.habits, id)
    const now = new Date(),
      parts = new Intl.DateTimeFormat('en', {
        timeZone: habit.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now)
    const get = (type: string) => parts.find((p) => p.type === type)!.value
    const localToday = `${get('year')}-${get('month')}-${get('day')}`
    const max = new Date(localToday + 'T12:00:00Z')
    max.setUTCDate(max.getUTCDate() + 366)
    if (
      habit.archived_at ||
      input.effective_from <= localToday ||
      input.effective_from > max.toISOString().slice(0, 10) ||
      (habit.period === 'weekly' &&
        new Date(input.effective_from + 'T12:00:00Z').getUTCDay() !== 1) ||
      input.definition.kind !== habit.kind ||
      input.definition.unit !== habit.unit ||
      input.definition.timezone !== habit.timezone ||
      (input.definition.period ?? 'daily') !== habit.period
    )
      throw new ApiError(
        'validation_error',
        'La modification doit respecter la période et prendre effet dans le futur.',
        422,
      )
    if (
      this.versions
        .get(id)!
        .some((v) => v.effective_from === input.effective_from)
    )
      throw new ApiError(
        'conflict',
        'Une modification existe déjà pour cette date.',
        409,
      )
    this.versions.get(id)!.push(clone(input))
    return clone(input)
  }
  async archiveHabit(id: string) {
    this.check()
    this.find(this.habits, id).archived_at = now()
  }
  async getVersions(id: string, page: M.Page) {
    this.check()
    this.find(this.habits, id)
    return this.page(this.versions.get(id)!, page)
  }
  async setPresentation(id: string, input: M.Presentation) {
    this.check()
    this.find(this.habits, id)
    this.presentations.set(id, clone(input))
    return clone(input)
  }
  private addEntry(id: string, input: M.NewEntry) {
    const habit = this.find(this.habits, id)
    if (
      habit.archived_at ||
      !Number.isFinite(input.value) ||
      input.value <= 0 ||
      !Number.isFinite(Date.parse(input.occurred_at)) ||
      Date.parse(input.occurred_at) > Date.now()
    )
      throw new ApiError('validation_error', 'Saisie invalide.', 422)
    const entry: M.Entry = {
      ...input,
      id: this.id(),
      habit_id: id,
      user_id: user,
      local_date: input.occurred_at.slice(0, 10),
      created_at: now(),
    }
    this.entries.push(entry)
    return clone(entry)
  }
  async listEntries(id: string, page: M.Page) {
    this.check()
    this.find(this.habits, id)
    return {
      items: this.page(
        this.entries.filter((e) => e.habit_id === id),
        page,
      ),
      ...page,
    }
  }
  async getEntry(id: string) {
    this.check()
    return clone(this.find(this.entries, id))
  }
  async recordEntry(id: string, input: M.NewEntry, options: WriteOptions) {
    return this.replay(`entry:${id}`, input, options, () =>
      this.addEntry(id, input),
    )
  }
  async correctEntry(id: string, input: M.NewEntry, options: WriteOptions) {
    return this.replay(`correct:${id}`, input, options, () => {
      const entry = this.find(this.entries, id)
      if (
        !Number.isFinite(input.value) ||
        input.value <= 0 ||
        !Number.isFinite(Date.parse(input.occurred_at)) ||
        Date.parse(input.occurred_at) > Date.now()
      )
        throw new ApiError('validation_error', 'Saisie invalide.', 422)
      Object.assign(entry, input, {
        local_date: input.occurred_at.slice(0, 10),
      })
      return clone(entry)
    })
  }
  async cancelEntry(id: string, options: WriteOptions) {
    return this.replay(`cancel:${id}`, null, options, () => {
      this.find(this.entries, id)
      this.entries = this.entries.filter((e) => e.id !== id)
    })
  }
  async getRests(id: string, page: M.Page) {
    this.check()
    this.find(this.habits, id)
    return this.page(
      this.rests.filter((r) => r.habit_id === id),
      page,
    )
  }
  async setRest(id: string, date: string) {
    this.check()
    this.find(this.habits, id)
    if (!this.rests.some((r) => r.habit_id === id && r.local_date === date))
      this.rests.push({
        id: this.id(),
        user_id: user,
        habit_id: id,
        local_date: date,
      })
  }
  async removeRest(id: string, date: string) {
    this.check()
    this.find(this.habits, id)
    this.rests = this.rests.filter(
      (r) => r.habit_id !== id || r.local_date !== date,
    )
  }
  private progress(id: string, date = today()) {
    return this.entries
      .filter((e) => e.habit_id === id && e.local_date === date)
      .reduce((sum, e) => sum + e.value, 0)
  }
  async habitAction(id: string, input: M.ActionRequest, options: WriteOptions) {
    return this.replay(`action:${id}`, input, options, () => {
      const habit = this.find(this.habits, id),
        previous = this.progress(id),
        step = this.presentations.get(id)?.step ?? 1
      if (habit.archived_at)
        throw new ApiError('conflict', 'Habitude archivée.', 409)
      const next =
        input.action === 'complete'
          ? 1
          : input.action === 'uncomplete'
            ? 0
            : input.action === 'increment'
              ? previous + step
              : input.action === 'decrement'
                ? previous - step
                : input.value
      if (next === undefined || !Number.isFinite(next) || next < 0)
        throw new ApiError('conflict', 'Valeur incompatible.', 409)
      this.entries = this.entries.filter(
        (e) => e.habit_id !== id || e.local_date !== today(),
      )
      if (next > 0) this.addEntry(id, { occurred_at: now(), value: next })
      return {
        id: this.id(),
        habit_id: id,
        action: input.action,
        local_date: today(),
        progress: next,
      }
    })
  }
  // Demo daily UTC statistics derive from seeded entries; Rust owns real periods and DST.
  async getGamification(): Promise<M.Gamification> {
    this.check()
    const dates = this.showcase
      ? this.demoDays().map((day) => day.date)
      : [today()]
    const xp = dates.reduce(
      (sum, date) =>
        sum +
        this.habits.filter(
          (h) =>
            !this.rests.some(
              (r) => r.habit_id === h.id && r.local_date === date,
            ) && this.progress(h.id, date) >= h.target,
        ).length *
          10,
      0,
    )
    return {
      xp,
      level: 1 + Math.floor(xp / 100),
      badges: xp ? ['first_completion'] : [],
    }
  }
  async getLedger(page: M.Page): Promise<M.Items<M.LedgerEntry>> {
    this.check()
    return { items: [], ...page }
  }
  async getStatistics(id: string): Promise<M.HabitStatistics> {
    this.check()
    const habit = this.find(this.habits, id)
    const dates = this.showcase ? this.demoDays().map((d) => d.date) : [today()]
    const heatmap = dates.map((date) => {
      const eligible =
        this.versions.get(id)![0]!.effective_from <= date &&
        !this.rests.some((r) => r.habit_id === id && r.local_date === date)
      const value = eligible ? this.progress(id, date) : 0
      return {
        date,
        eligible,
        progress: value,
        period_start: date,
        completed: eligible && value >= habit.target,
      }
    })
    let run = 0,
      record = 0
    for (const day of heatmap) {
      run = day.completed ? run + 1 : 0
      record = Math.max(record, run)
    }
    return {
      through: today(),
      periods: heatmap.map((day) => ({
        start: day.date,
        end: day.date,
        progress: day.progress,
        target: habit.target,
        eligible_days: +day.eligible,
        completed: day.completed,
      })),
      heatmap,
      windows: [],
      streak: { current: run, record },
      xp: heatmap.filter((day) => day.completed).length * 10,
      level: 1 + Math.floor(heatmap.filter((day) => day.completed).length / 10),
    }
  }
  private demoDays(): M.DashboardDay[] {
    return Array.from({ length: 30 }, (_, i) => {
      const instant = new Date()
      instant.setUTCDate(instant.getUTCDate() - 29 + i)
      const date = instant.toISOString().slice(0, 10),
        active = this.habits.filter(
          (h) =>
            !h.archived_at &&
            this.versions.get(h.id)![0]!.effective_from <= date &&
            !this.rests.some(
              (r) => r.habit_id === h.id && r.local_date === date,
            ),
        )
      const percents = (['sport', 'mind', 'daily', 'nutrition'] as const)
        .map((category) => active.filter((h) => h.category === category))
        .filter((items) => items.length)
        .map(
          (items) =>
            items.reduce(
              (sum, h) =>
                sum +
                Math.min(100, (this.progress(h.id, date) / h.target) * 100),
              0,
            ) / items.length,
        )
      return {
        date,
        percent: percents.length
          ? percents.reduce((a, b) => a + b, 0) / percents.length
          : null,
        eligible: active.length,
        completed: active.filter((h) => this.progress(h.id, date) >= h.target)
          .length,
      }
    })
  }
  async recalculate(id: string) {
    this.check()
    this.find(this.habits, id)
  }
  async getDashboard(): Promise<M.Dashboard> {
    this.check()
    const categories: M.Category[] = ['sport', 'mind', 'daily', 'nutrition']
    const groups = categories.map((category) => {
      const habits = this.habits
        .filter((h) => !h.archived_at && h.category === category)
        .map((habit) => {
          const progress = this.progress(habit.id),
            eligible = !this.rests.some(
              (r) => r.habit_id === habit.id && r.local_date === today(),
            )
          return {
            habit: clone(habit),
            presentation: this.presentations.get(habit.id) ?? {
              ...defaultPresentation,
            },
            local_date: today(),
            eligible,
            actionable: eligible,
            progress,
            target: habit.target,
            percent: eligible
              ? Math.min(100, (progress / habit.target) * 100)
              : null,
            completed: progress >= habit.target,
          }
        })
      const eligible = habits.filter((h) => h.eligible)
      return {
        category,
        habits,
        eligible: eligible.length,
        completed: eligible.filter((h) => h.completed).length,
        percent: eligible.length
          ? eligible.reduce((sum, h) => sum + h.percent!, 0) / eligible.length
          : null,
      }
    })
    const eligible = groups.filter((g) => g.percent !== null)
    const days = this.showcase ? this.demoDays() : []
    const currentWeek = days.slice(-7),
      previousWeek = days.slice(-14, -7)
    const mean = (period: M.DashboardDay[], completion = false) => {
      const eligible = period.filter(
        (day) => day.eligible > 0 && day.percent !== null,
      )
      return eligible.length
        ? eligible.reduce(
            (sum, day) =>
              sum +
              (completion
                ? (day.completed / day.eligible) * 100
                : day.percent!),
            0,
          ) / eligible.length
        : null
    }
    let record = 0,
      run = 0
    for (const day of days) {
      run = day.eligible > 0 && day.completed === day.eligible ? run + 1 : 0
      record = Math.max(record, run)
    }
    return clone({
      user_id: user,
      generated_at: now(),
      date: today(),
      timezone: 'UTC',
      revision: this.sequence,
      global_percent: eligible.length
        ? eligible.reduce((sum, g) => sum + g.percent!, 0) / eligible.length
        : null,
      groups,
      weekly: {
        current: currentWeek,
        previous: previousWeek,
        current_percent: mean(currentWeek),
        previous_percent: mean(previousWeek),
        current_success_percent: mean(currentWeek, true),
        previous_success_percent: mean(previousWeek, true),
      },
      heatmap: days,
      gamification: await this.getGamification(),
      streak_91_days: { current: run, record },
    })
  }
  async listTokens(page: M.Page) {
    this.check()
    return this.page(this.tokens, page)
  }
  async createToken(input: M.NewToken): Promise<M.IssuedToken> {
    this.check()
    const metadata: M.TokenMetadata = {
      ...input,
      id: this.id(),
      user_id: user,
      revoked_at: null,
      created_at: now(),
    }
    this.tokens.push(metadata)
    return { token: `fake_only_${metadata.id}`, metadata: clone(metadata) }
  }
  async rotateToken(id: string) {
    this.check()
    const token = this.find(this.tokens, id)
    token.revoked_at = now()
    return this.createToken(token)
  }
  async revokeToken(id: string) {
    this.check()
    this.find(this.tokens, id).revoked_at = now()
  }
  async createServiceAccount(input: {
    name: string
  }): Promise<M.ServiceAccount> {
    this.check()
    const account = {
      ...input,
      id: this.id(),
      created_at: now(),
      revoked_at: null,
    }
    this.accounts.push(account)
    return clone(account)
  }
  async revokeServiceAccount(id: string) {
    this.check()
    this.find(this.accounts, id).revoked_at = now()
    this.tokens
      .filter((t) => t.service_account_id === id)
      .forEach((t) => (t.revoked_at = now()))
  }
  async listIntegrations() {
    this.check()
    return clone(this.integrations)
  }
  async connectHomeAssistant(_input: { token: string }) {
    this.check()
    const integration: M.Integration = {
      id: this.id(),
      provider: 'home_assistant',
      connected: true,
    }
    this.integrations = this.integrations.filter(
      (i) => i.provider !== 'home_assistant',
    )
    this.integrations.push(integration)
    return clone(integration)
  }
  private job(): M.JobAccepted {
    const job: M.Job = {
      id: this.id(),
      state: 'completed',
      attempts: 1,
      available_at: now(),
    }
    this.jobs.push(job)
    return { job_id: job.id }
  }
  async notifyHomeAssistant(input: M.Notification, options: WriteOptions) {
    return this.replay('notify', input, options, () => this.job())
  }
  async authorizeStrava() {
    this.check()
    const integration: M.Integration = {
      id: this.id(),
      provider: 'strava',
      connected: true,
    }
    this.integrations.push(integration)
    return { authorization_url: 'https://www.strava.com' }
  }
  async setStravaMapping(_input: M.Mapping) {
    this.check()
  }
  async syncStrava(options: WriteOptions) {
    return this.replay('sync', null, options, () => this.job())
  }
  async disconnectIntegration(id: string) {
    this.check()
    this.find(this.integrations, id).connected = false
  }
  async getJob(id: string) {
    this.check()
    return clone(this.find(this.jobs, id))
  }
}
