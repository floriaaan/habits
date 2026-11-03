use super::{Store, entry_from_row, owned_habit, persistence, record_in_tx, tracking};
use crate::modules::{
    DomainError,
    auth::{Principal, Scope},
    entries::{Entry, NewEntry},
    habits::{
        Habit, HabitKind, HabitVersion,
        presentation::{ActionReceipt, ActionRequest, HabitAction, Presentation},
    },
    statistics::{
        self, DayResult, PeriodResult,
        dashboard::{self, Dashboard, DashboardDay, DashboardHabit, Group, WeekComparison},
    },
    users::UserId,
};
use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use sqlx::{Row, Sqlite, Transaction};
use uuid::Uuid;

async fn presentation(
    tx: &mut Transaction<'_, Sqlite>,
    user: UserId,
    id: Uuid,
) -> Result<Presentation, DomainError> {
    let value: Option<String> = sqlx::query_scalar(
        "SELECT definition FROM habit_presentations WHERE user_id = ? AND habit_id = ?",
    )
    .bind(user.0.to_string())
    .bind(id.to_string())
    .fetch_optional(&mut **tx)
    .await
    .map_err(persistence)?;
    value
        .map(|value| serde_json::from_str(&value).map_err(persistence))
        .transpose()
        .map(Option::unwrap_or_default)
}

struct History {
    habit: Habit,
    presentation: Presentation,
    versions: Vec<HabitVersion>,
    periods: Vec<PeriodResult>,
    days: Vec<DayResult>,
    from: NaiveDate,
    today: NaiveDate,
}
impl History {
    fn item(&self, date: NaiveDate, now: DateTime<Utc>) -> Result<DashboardHabit, DomainError> {
        let mut habit = self.habit.clone();
        habit.definition = statistics::definition_on(&self.versions, date)?.clone();
        let start = statistics::period_start(date, habit.definition.period);
        let progress = self
            .periods
            .iter()
            .find(|p| p.start == start)
            .map_or(0.0, |p| p.progress);
        let eligible = date >= self.from
            && date <= self.today
            && self.days.iter().any(|d| d.date == date && d.eligible);
        let timezone = habit
            .definition
            .timezone
            .parse::<chrono_tz::Tz>()
            .map_err(persistence)?;
        let actionable = eligible
            && date == self.today
            && habit
                .definition
                .schedule
                .eligible_date(now, timezone)
                .is_ok();
        Ok(DashboardHabit {
            target: habit.definition.target,
            completed: eligible && progress >= habit.definition.target,
            percent: eligible.then(|| (progress / habit.definition.target).clamp(0.0, 1.0) * 100.0),
            habit,
            presentation: self.presentation.clone(),
            local_date: date,
            eligible,
            actionable,
            progress,
        })
    }
}

impl Store {
    pub async fn dashboard_revision(&self, user: UserId) -> Result<i64, DomainError> {
        Ok(
            sqlx::query_scalar("SELECT revision FROM dashboard_revisions WHERE user_id = ?")
                .bind(user.0.to_string())
                .fetch_optional(&self.pool)
                .await
                .map_err(persistence)?
                .unwrap_or(0),
        )
    }
    #[tracing::instrument(skip_all, fields(operation = "dashboard"), err)]
    pub async fn dashboard(&self, actor: &Principal) -> Result<Dashboard, DomainError> {
        tracing::info!("dashboard started");
        self.dashboard_at(actor, Utc::now()).await
    }
    pub async fn dashboard_at(
        &self,
        actor: &Principal,
        now: DateTime<Utc>,
    ) -> Result<Dashboard, DomainError> {
        actor.require(Scope::HabitsRead)?;
        actor.require(Scope::StatisticsRead)?;
        let mut tx = self.pool.begin().await.map_err(persistence)?;
        let zone: String = sqlx::query_scalar("SELECT timezone FROM users WHERE id = ?")
            .bind(actor.user_id.0.to_string())
            .fetch_one(&mut *tx)
            .await
            .map_err(persistence)?;
        let timezone = zone.parse::<chrono_tz::Tz>().map_err(persistence)?;
        let today = now.with_timezone(&timezone).date_naive();
        let ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM habits WHERE user_id = ? AND archived_at IS NULL ORDER BY id LIMIT 201",
        )
        .bind(actor.user_id.0.to_string())
        .fetch_all(&mut *tx)
        .await
        .map_err(persistence)?;
        if ids.len() > 200 {
            return Err(DomainError::Validation(
                "dashboard supports at most 200 active habits",
            ));
        }
        let revision: i64 =
            sqlx::query_scalar("SELECT revision FROM dashboard_revisions WHERE user_id = ?")
                .bind(actor.user_id.0.to_string())
                .fetch_optional(&mut *tx)
                .await
                .map_err(persistence)?
                .unwrap_or(0);
        let mut histories = Vec::new();
        for id in ids {
            let id = id.parse().map_err(persistence)?;
            let (habit, versions, entries, rests, from, _) =
                tracking::data(&mut tx, actor.user_id, id).await?;
            let local_today = now
                .with_timezone(
                    &habit
                        .definition
                        .timezone
                        .parse::<chrono_tz::Tz>()
                        .map_err(persistence)?,
                )
                .date_naive();
            let (periods, days) = statistics::calculate(
                &versions,
                &entries,
                &rests,
                from.max(local_today - Duration::days(97)).min(local_today),
                local_today,
            )?;
            histories.push(History {
                presentation: presentation(&mut tx, actor.user_id, id).await?,
                habit,
                versions,
                periods,
                days,
                from,
                today: local_today,
            });
        }
        let xp: i64 =
            sqlx::query_scalar("SELECT COALESCE(SUM(amount),0) FROM xp_ledger WHERE user_id = ?")
                .bind(actor.user_id.0.to_string())
                .fetch_one(&mut *tx)
                .await
                .map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        let mut groups = Vec::new();
        for category in dashboard::CATEGORIES {
            let mut habits = histories
                .iter()
                .map(|h| h.item(h.today, now))
                .collect::<Result<Vec<_>, _>>()?;
            habits.retain(|h| h.habit.definition.category == category);
            habits.sort_by(|a, b| {
                (a.presentation.order, &a.habit.definition.name, a.habit.id).cmp(&(
                    b.presentation.order,
                    &b.habit.definition.name,
                    b.habit.id,
                ))
            });
            groups.push(Group {
                category,
                percent: dashboard::weighted_percent(habits.iter()),
                completed: habits.iter().filter(|h| h.eligible && h.completed).count() as u32,
                eligible: habits.iter().filter(|h| h.eligible).count() as u32,
                habits,
            });
        }
        let mut heatmap = Vec::new();
        for offset in (0..91).rev() {
            let date = today - Duration::days(offset);
            let habits = histories
                .iter()
                .map(|h| h.item(date, now))
                .collect::<Result<Vec<_>, _>>()?;
            heatmap.push(dashboard::day(date, &habits));
        }
        let monday = today - Duration::days(i64::from(today.weekday().num_days_from_monday()));
        let week = |start: NaiveDate| -> Vec<DashboardDay> {
            (0..7)
                .map(|d| {
                    let date = start + Duration::days(d);
                    heatmap
                        .iter()
                        .find(|v| v.date == date)
                        .cloned()
                        .unwrap_or(DashboardDay {
                            date,
                            percent: None,
                            completed: 0,
                            eligible: 0,
                        })
                })
                .collect()
        };
        let current = week(monday);
        let previous = week(monday - Duration::days(7));
        let weekly = WeekComparison {
            current_percent: dashboard::mean(current.iter().filter_map(|d| d.percent)),
            previous_percent: dashboard::mean(previous.iter().filter_map(|d| d.percent)),
            current_success_percent: dashboard::success_percent(&current),
            previous_success_percent: dashboard::success_percent(&previous),
            current,
            previous,
        };
        let streak_periods = heatmap
            .iter()
            .map(|d| PeriodResult {
                start: d.date,
                end: d.date,
                progress: f64::from(d.completed),
                target: f64::from(d.eligible),
                eligible_days: u32::from(d.eligible > 0),
                completed: d.eligible > 0 && d.completed == d.eligible,
            })
            .collect::<Vec<_>>();
        let streak_91_days = crate::modules::streaks::calculate(&streak_periods, today);
        Ok(Dashboard {
            user_id: actor.user_id,
            generated_at: now,
            date: today,
            timezone: zone,
            revision,
            global_percent: dashboard::mean(groups.iter().filter_map(|g| g.percent)),
            groups,
            weekly,
            heatmap,
            gamification: crate::modules::gamification::summary(xp),
            streak_91_days,
        })
    }
    #[tracing::instrument(skip_all, fields(operation = "set_presentation"), err)]
    pub async fn set_presentation(
        &self,
        actor: &Principal,
        id: Uuid,
        input: Presentation,
    ) -> Result<Presentation, DomainError> {
        tracing::info!("set presentation started");
        actor.require(Scope::HabitsWrite)?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let habit = owned_habit(&mut tx, actor.user_id, id).await?;
        if habit.archived_at.is_some() {
            return Err(DomainError::Validation("habit is archived"));
        }
        input.validate(&habit.definition)?;
        let payload = serde_json::to_string(&input).map_err(persistence)?;
        sqlx::query("INSERT INTO habit_presentations (user_id, habit_id, definition) VALUES (?, ?, ?) ON CONFLICT(user_id, habit_id) DO UPDATE SET definition = excluded.definition")
            .bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(&payload).execute(&mut *tx).await.map_err(persistence)?;
        tracking::append_event(
            &mut tx,
            actor.user_id,
            id,
            &format!("presentation:{}", Uuid::new_v4()),
            "habit.presentation",
            &payload,
        )
        .await?;
        tx.commit().await.map_err(persistence)?;
        Ok(input)
    }
    #[tracing::instrument(skip_all, fields(operation = "habit_action"), err)]
    pub async fn habit_action(
        &self,
        actor: &Principal,
        id: Uuid,
        key: &str,
        input: ActionRequest,
    ) -> Result<ActionReceipt, DomainError> {
        tracing::info!("habit action started");
        actor.require(Scope::EntriesWrite)?;
        if key.is_empty() || key.len() > 128 || !key.bytes().all(|v| v.is_ascii_graphic()) {
            return Err(DomainError::Validation(
                "Idempotency-Key must be 1..128 visible ASCII bytes",
            ));
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let habit = owned_habit(&mut tx, actor.user_id, id).await?;
        let payload = serde_json::to_string(&input).map_err(persistence)?;
        if let Some(row) = sqlx::query("SELECT habit_id, payload, receipt FROM action_receipts WHERE user_id = ? AND idempotency_key = ?")
            .bind(actor.user_id.0.to_string()).bind(key).fetch_optional(&mut *tx).await.map_err(persistence)? {
            if row.try_get::<String,_>("habit_id").map_err(persistence)? != id.to_string() || row.try_get::<String,_>("payload").map_err(persistence)? != payload { return Err(DomainError::Conflict); }
            return serde_json::from_str(&row.try_get::<String,_>("receipt").map_err(persistence)?).map_err(persistence);
        }
        if habit.archived_at.is_some() {
            return Err(DomainError::Validation("habit is archived"));
        }
        let bool_action = matches!(
            input.action,
            HabitAction::Complete | HabitAction::Uncomplete
        );
        if bool_action != (habit.definition.kind == HabitKind::Boolean) {
            return Err(DomainError::Validation(
                "complete/uncomplete require a boolean habit; use increment/decrement otherwise",
            ));
        }
        let now = Utc::now();
        let timezone = habit
            .definition
            .timezone
            .parse::<chrono_tz::Tz>()
            .map_err(persistence)?;
        let today = now.with_timezone(&timezone).date_naive();
        let start = statistics::period_start(today, habit.definition.period);
        let settings = presentation(&mut tx, actor.user_id, id).await?;
        let rows = sqlx::query("SELECT e.* FROM entries e WHERE e.user_id = ? AND e.habit_id = ? AND e.cancelled_at IS NULL AND e.local_date >= ? AND e.local_date <= ? AND NOT EXISTS(SELECT 1 FROM source_identifiers s WHERE s.user_id = e.user_id AND s.entry_id = e.id) ORDER BY e.occurred_at DESC, e.id DESC")
            .bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(start).bind(today).fetch_all(&mut *tx).await.map_err(persistence)?;
        let manual = rows
            .iter()
            .map(entry_from_row)
            .collect::<Result<Vec<Entry>, _>>()?;
        let receipt_id = Uuid::new_v4();
        let tolerance = settings.step * 1e-9;
        match input.action {
            HabitAction::Complete | HabitAction::Increment => {
                if input.action != HabitAction::Complete || manual.is_empty() {
                    let value = if bool_action { 1.0 } else { settings.step };
                    let entry = NewEntry {
                        occurred_at: now,
                        value,
                    };
                    entry.validate(now)?;
                    record_in_tx(
                        &mut tx,
                        actor.user_id,
                        id,
                        &format!("action:{receipt_id}:create"),
                        entry,
                    )
                    .await?;
                }
            }
            HabitAction::Uncomplete | HabitAction::Decrement => {
                let mut remaining = if bool_action {
                    manual.iter().map(|e| e.value).sum::<f64>()
                } else {
                    settings.step
                };
                if !bool_action
                    && manual.iter().map(|e| e.value).sum::<f64>() + tolerance < remaining
                {
                    return Err(DomainError::Conflict);
                }
                for entry in manual {
                    if remaining <= tolerance {
                        break;
                    }
                    let value = (entry.value - remaining).max(0.0);
                    remaining = (remaining - entry.value).max(0.0);
                    let correction = (value > tolerance).then_some(NewEntry {
                        occurred_at: entry.occurred_at,
                        value,
                    });
                    tracking::change_in_tx(
                        &mut tx,
                        actor.user_id,
                        entry.id,
                        &format!("action:{receipt_id}:{}", entry.id),
                        correction,
                    )
                    .await?;
                }
            }
        }
        let progress: f64 = sqlx::query_scalar("SELECT COALESCE(SUM(value),0.0) FROM entries WHERE user_id = ? AND habit_id = ? AND cancelled_at IS NULL AND local_date >= ? AND local_date <= ?")
            .bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(start).bind(today).fetch_one(&mut *tx).await.map_err(persistence)?;
        let receipt = ActionReceipt {
            id: receipt_id,
            habit_id: id,
            action: input.action,
            local_date: today,
            progress,
        };
        sqlx::query("INSERT INTO action_receipts (user_id, habit_id, idempotency_key, payload, receipt) VALUES (?, ?, ?, ?, ?)")
            .bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(key).bind(payload).bind(serde_json::to_string(&receipt).map_err(persistence)?).execute(&mut *tx).await.map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(receipt)
    }
}
