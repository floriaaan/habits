use super::{Store, entry_from_row, owned_habit, persistence};
use crate::modules::{
    DomainError,
    auth::{Principal, Scope},
    entries::{CheckInPayload, Entry, NewEntry},
    habits::{Habit, HabitVersion, Pagination, UpdateHabit},
    schedules::RestException,
    statistics::{self, HabitStatistics},
    users::UserId,
};
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::{Row, Sqlite, SqliteConnection, Transaction};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub(super) async fn apply_version(
    connection: &mut SqliteConnection,
    habit: &mut Habit,
    date: NaiveDate,
) -> Result<(), DomainError> {
    let definition:Option<String>=sqlx::query_scalar("SELECT definition FROM habit_versions WHERE user_id = ? AND habit_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1").bind(habit.user_id.0.to_string()).bind(habit.id.to_string()).bind(date).fetch_optional(connection).await.map_err(persistence)?;
    if let Some(definition) = definition {
        habit.definition = serde_json::from_str(&definition).map_err(persistence)?;
    }
    Ok(())
}

pub(super) async fn append_event(
    tx: &mut Transaction<'_, Sqlite>,
    user: UserId,
    habit: Uuid,
    key: &str,
    kind: &str,
    payload: &str,
) -> Result<Uuid, DomainError> {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO domain_events (id, user_id, habit_id, idempotency_key, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id.to_string()).bind(user.0.to_string()).bind(habit.to_string()).bind(key).bind(kind).bind(payload).bind(Utc::now()).execute(&mut **tx).await.map_err(persistence)?;
    Ok(id)
}
fn validate_key(key: &str) -> Result<(), DomainError> {
    if key.is_empty() || key.len() > 128 || !key.bytes().all(|b| b.is_ascii_graphic()) {
        Err(DomainError::Validation(
            "Idempotency-Key must be 1..128 visible ASCII bytes",
        ))
    } else {
        Ok(())
    }
}

async fn data(
    tx: &mut Transaction<'_, Sqlite>,
    user: UserId,
    id: Uuid,
) -> Result<
    (
        Habit,
        Vec<HabitVersion>,
        Vec<Entry>,
        BTreeSet<NaiveDate>,
        NaiveDate,
        NaiveDate,
    ),
    DomainError,
> {
    let habit = owned_habit(tx, user, id).await?;
    let rows=sqlx::query("SELECT effective_from, definition FROM habit_versions WHERE user_id = ? AND habit_id = ? ORDER BY effective_from").bind(user.0.to_string()).bind(id.to_string()).fetch_all(&mut **tx).await.map_err(persistence)?;
    let mut versions = Vec::new();
    for row in rows {
        let definition: String = row.try_get("definition").map_err(persistence)?;
        versions.push(HabitVersion {
            effective_from: row.try_get("effective_from").map_err(persistence)?,
            definition: serde_json::from_str(&definition).map_err(persistence)?,
        });
    }
    let rows=sqlx::query("SELECT e.*, v.operation, v.payload FROM entry_events v JOIN entries e ON e.user_id = v.user_id AND e.id = v.entry_id WHERE e.user_id = ? AND e.habit_id = ? ORDER BY v.rowid").bind(user.0.to_string()).bind(id.to_string()).fetch_all(&mut **tx).await.map_err(persistence)?;
    let mut active = BTreeMap::new();
    let timezone = habit
        .definition
        .timezone
        .parse::<chrono_tz::Tz>()
        .map_err(persistence)?;
    let today = Utc::now().with_timezone(&timezone).date_naive();
    let mut from = habit.created_at.with_timezone(&timezone).date_naive();
    for row in rows {
        let mut entry = entry_from_row(&row)?;
        let operation: String = row.try_get("operation").map_err(persistence)?;
        let payload: String = row.try_get("payload").map_err(persistence)?;
        let payload: CheckInPayload = serde_json::from_str(&payload).map_err(persistence)?;
        entry.occurred_at = payload.entry.occurred_at;
        entry.value = payload.entry.value;
        entry.local_date = entry.occurred_at.with_timezone(&timezone).date_naive();
        from = from.min(entry.local_date);
        if operation == "cancel" {
            active.remove(&entry.id);
        } else {
            active.insert(entry.id, entry);
        }
    }
    let rests = sqlx::query_scalar::<_, NaiveDate>(
        "SELECT local_date FROM schedule_exceptions WHERE user_id = ? AND habit_id = ?",
    )
    .bind(user.0.to_string())
    .bind(id.to_string())
    .fetch_all(&mut **tx)
    .await
    .map_err(persistence)?
    .into_iter()
    .collect();
    Ok((
        habit,
        versions,
        active.into_values().collect(),
        rests,
        from,
        today,
    ))
}

pub(super) async fn rebuild(
    tx: &mut Transaction<'_, Sqlite>,
    user: UserId,
    id: Uuid,
    event: Uuid,
) -> Result<(), DomainError> {
    let (_, versions, entries, rests, mut from, today) = data(tx, user, id).await?;
    let previous=sqlx::query("SELECT period_start, SUM(amount) AS amount FROM xp_ledger WHERE user_id = ? AND habit_id = ? GROUP BY period_start").bind(user.0.to_string()).bind(id.to_string()).fetch_all(&mut **tx).await.map_err(persistence)?;
    let mut balances = BTreeMap::new();
    for row in previous {
        let start: NaiveDate = row.try_get("period_start").map_err(persistence)?;
        from = from.min(start);
        balances.insert(start, row.try_get::<i64, _>("amount").map_err(persistence)?);
    }
    let (periods, _) = statistics::calculate(&versions, &entries, &rests, from, today)?;
    sqlx::query("DELETE FROM period_projections WHERE user_id = ? AND habit_id = ?")
        .bind(user.0.to_string())
        .bind(id.to_string())
        .execute(&mut **tx)
        .await
        .map_err(persistence)?;
    for period in periods {
        sqlx::query("INSERT INTO period_projections (user_id, habit_id, period_start, period_end, progress, target, eligible_days, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(user.0.to_string()).bind(id.to_string()).bind(period.start).bind(period.end).bind(period.progress).bind(period.target).bind(period.eligible_days).bind(period.completed).execute(&mut **tx).await.map_err(persistence)?;
        let wanted = crate::modules::gamification::reward(period.completed);
        let previous = balances.get(&period.start).copied().unwrap_or(0);
        let delta = wanted - previous;
        if delta != 0 {
            let compensates: Option<String> = if delta < 0 {
                sqlx::query_scalar("SELECT l.id FROM xp_ledger l WHERE l.user_id = ? AND l.habit_id = ? AND l.period_start = ? AND l.amount > 0 AND NOT EXISTS(SELECT 1 FROM xp_ledger c WHERE c.user_id = l.user_id AND c.compensates_id = l.id) ORDER BY l.rowid DESC LIMIT 1").bind(user.0.to_string()).bind(id.to_string()).bind(period.start).fetch_optional(&mut **tx).await.map_err(persistence)?
            } else {
                None
            };
            sqlx::query("INSERT INTO xp_ledger (id, user_id, habit_id, period_start, event_id, amount, compensates_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(Uuid::new_v4().to_string()).bind(user.0.to_string()).bind(id.to_string()).bind(period.start).bind(event.to_string()).bind(delta).bind(compensates).bind(Utc::now()).execute(&mut **tx).await.map_err(persistence)?;
        }
    }
    Ok(())
}

impl Store {
    pub async fn gamification(
        &self,
        actor: &Principal,
    ) -> Result<crate::modules::gamification::Gamification, DomainError> {
        actor.require(Scope::StatisticsRead)?;
        let xp: i64 =
            sqlx::query_scalar("SELECT COALESCE(SUM(amount),0) FROM xp_ledger WHERE user_id = ?")
                .bind(actor.user_id.0.to_string())
                .fetch_one(&self.pool)
                .await
                .map_err(persistence)?;
        Ok(crate::modules::gamification::summary(xp))
    }
    pub async fn ledger(
        &self,
        actor: &Principal,
        page: Pagination,
    ) -> Result<crate::modules::gamification::LedgerPage, DomainError> {
        actor.require(Scope::StatisticsRead)?;
        let page = page.validate()?;
        let rows = sqlx::query(
            "SELECT * FROM xp_ledger WHERE user_id = ? ORDER BY created_at, id LIMIT ? OFFSET ?",
        )
        .bind(actor.user_id.0.to_string())
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.pool)
        .await
        .map_err(persistence)?;
        let mut items = Vec::new();
        for row in rows {
            let id: String = row.try_get("id").map_err(persistence)?;
            let habit: String = row.try_get("habit_id").map_err(persistence)?;
            let event: String = row.try_get("event_id").map_err(persistence)?;
            let compensates: Option<String> = row.try_get("compensates_id").map_err(persistence)?;
            items.push(crate::modules::gamification::XpLedgerEntry {
                id: id.parse().map_err(persistence)?,
                user_id: actor.user_id,
                habit_id: habit.parse().map_err(persistence)?,
                period_start: row.try_get("period_start").map_err(persistence)?,
                event_id: event.parse().map_err(persistence)?,
                amount: row.try_get("amount").map_err(persistence)?,
                compensates_id: compensates
                    .map(|id| id.parse())
                    .transpose()
                    .map_err(persistence)?,
                created_at: row.try_get("created_at").map_err(persistence)?,
            });
        }
        Ok(crate::modules::gamification::LedgerPage {
            items,
            limit: page.limit,
            offset: page.offset,
        })
    }
    pub async fn versions(
        &self,
        actor: &Principal,
        id: Uuid,
        page: Pagination,
    ) -> Result<Vec<HabitVersion>, DomainError> {
        actor.require(Scope::HabitsRead)?;
        let page = page.validate()?;
        let mut tx = self.pool.begin().await.map_err(persistence)?;
        owned_habit(&mut tx, actor.user_id, id).await?;
        let rows=sqlx::query("SELECT effective_from, definition FROM habit_versions WHERE user_id = ? AND habit_id = ? ORDER BY effective_from LIMIT ? OFFSET ?").bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(page.limit).bind(page.offset).fetch_all(&mut *tx).await.map_err(persistence)?;
        let mut versions = Vec::new();
        for row in rows {
            let definition: String = row.try_get("definition").map_err(persistence)?;
            versions.push(HabitVersion {
                effective_from: row.try_get("effective_from").map_err(persistence)?,
                definition: serde_json::from_str(&definition).map_err(persistence)?,
            });
        }
        tx.commit().await.map_err(persistence)?;
        Ok(versions)
    }
    pub async fn get_habit(&self, actor: &Principal, id: Uuid) -> Result<Habit, DomainError> {
        actor.require(Scope::HabitsRead)?;
        let mut c = self.pool.acquire().await.map_err(persistence)?;
        owned_habit(&mut c, actor.user_id, id).await
    }
    pub async fn update_habit(
        &self,
        actor: &Principal,
        id: Uuid,
        input: UpdateHabit,
    ) -> Result<HabitVersion, DomainError> {
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
        let timezone = habit
            .definition
            .timezone
            .parse::<chrono_tz::Tz>()
            .map_err(persistence)?;
        input.validate(&habit, Utc::now().with_timezone(&timezone).date_naive())?;
        let definition = serde_json::to_string(&input.definition).map_err(persistence)?;
        let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM habit_versions WHERE user_id = ? AND habit_id = ? AND effective_from = ?)").bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(input.effective_from).fetch_one(&mut *tx).await.map_err(persistence)?;
        if exists {
            return Err(DomainError::Conflict);
        }
        sqlx::query("INSERT INTO habit_versions (id, user_id, habit_id, effective_from, definition, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(Uuid::new_v4().to_string()).bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(input.effective_from).bind(definition).bind(Utc::now()).execute(&mut *tx).await.map_err(persistence)?;
        append_event(
            &mut tx,
            actor.user_id,
            id,
            &format!("version:{}", Uuid::new_v4()),
            "habit.version",
            &serde_json::to_string(&input.definition).map_err(persistence)?,
        )
        .await?;
        tx.commit().await.map_err(persistence)?;
        Ok(HabitVersion {
            effective_from: input.effective_from,
            definition: input.definition,
        })
    }
    pub async fn archive_habit(&self, actor: &Principal, id: Uuid) -> Result<(), DomainError> {
        actor.require(Scope::HabitsWrite)?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        owned_habit(&mut tx, actor.user_id, id).await?;
        sqlx::query(
            "UPDATE habits SET archived_at = COALESCE(archived_at, ?) WHERE user_id = ? AND id = ?",
        )
        .bind(Utc::now())
        .bind(actor.user_id.0.to_string())
        .bind(id.to_string())
        .execute(&mut *tx)
        .await
        .map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    pub async fn statistics(
        &self,
        actor: &Principal,
        id: Uuid,
    ) -> Result<HabitStatistics, DomainError> {
        actor.require(Scope::StatisticsRead)?;
        let mut tx = self.pool.begin().await.map_err(persistence)?;
        let (_, versions, entries, rests, from, today) = data(&mut tx, actor.user_id, id).await?;
        let (periods, heatmap) = statistics::calculate(&versions, &entries, &rests, from, today)?;
        let xp: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(amount),0) FROM xp_ledger WHERE user_id = ? AND habit_id = ?",
        )
        .bind(actor.user_id.0.to_string())
        .bind(id.to_string())
        .fetch_one(&mut *tx)
        .await
        .map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(statistics::summarize(periods, heatmap, today, xp))
    }
    pub async fn recalculate(&self, actor: &Principal, id: Uuid) -> Result<(), DomainError> {
        actor.require(Scope::HabitsWrite)?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        owned_habit(&mut tx, actor.user_id, id).await?;
        let event = append_event(
            &mut tx,
            actor.user_id,
            id,
            &format!("rebuild:{}", Uuid::new_v4()),
            "habit.recalculate",
            "{}",
        )
        .await?;
        rebuild(&mut tx, actor.user_id, id, event).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    pub async fn set_rest(
        &self,
        actor: &Principal,
        id: Uuid,
        date: NaiveDate,
        rest: bool,
    ) -> Result<(), DomainError> {
        actor.require(Scope::HabitsWrite)?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        owned_habit(&mut tx, actor.user_id, id).await?;
        if rest {
            sqlx::query("INSERT INTO schedule_exceptions (id, user_id, habit_id, local_date, kind) VALUES (?, ?, ?, ?, 'rest') ON CONFLICT(user_id, habit_id, local_date) DO NOTHING").bind(Uuid::new_v4().to_string()).bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(date).execute(&mut *tx).await.map_err(persistence)?;
        } else {
            sqlx::query("DELETE FROM schedule_exceptions WHERE user_id = ? AND habit_id = ? AND local_date = ?").bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(date).execute(&mut *tx).await.map_err(persistence)?;
        }
        let event = append_event(
            &mut tx,
            actor.user_id,
            id,
            &format!("rest:{}", Uuid::new_v4()),
            "schedule.rest",
            &serde_json::json!({"date":date,"rest":rest}).to_string(),
        )
        .await?;
        rebuild(&mut tx, actor.user_id, id, event).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    pub async fn rests(
        &self,
        actor: &Principal,
        id: Uuid,
        page: Pagination,
    ) -> Result<Vec<RestException>, DomainError> {
        actor.require(Scope::HabitsRead)?;
        let page = page.validate()?;
        let mut tx = self.pool.begin().await.map_err(persistence)?;
        owned_habit(&mut tx, actor.user_id, id).await?;
        let rows=sqlx::query("SELECT id, local_date FROM schedule_exceptions WHERE user_id = ? AND habit_id = ? ORDER BY local_date, id LIMIT ? OFFSET ?").bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(page.limit).bind(page.offset).fetch_all(&mut *tx).await.map_err(persistence)?;
        let mut results = Vec::new();
        for row in rows {
            let key: String = row.try_get("id").map_err(persistence)?;
            results.push(RestException {
                id: key.parse().map_err(persistence)?,
                user_id: actor.user_id,
                habit_id: id,
                local_date: row.try_get("local_date").map_err(persistence)?,
            });
        }
        tx.commit().await.map_err(persistence)?;
        Ok(results)
    }
    pub async fn change_entry(
        &self,
        actor: &Principal,
        id: Uuid,
        key: &str,
        input: Option<NewEntry>,
    ) -> Result<Entry, DomainError> {
        actor.require(Scope::EntriesWrite)?;
        validate_key(key)?;
        if let Some(input) = &input {
            input.validate(Utc::now())?;
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let row = sqlx::query("SELECT * FROM entries WHERE user_id = ? AND id = ?")
            .bind(actor.user_id.0.to_string())
            .bind(id.to_string())
            .fetch_optional(&mut *tx)
            .await
            .map_err(persistence)?
            .ok_or(DomainError::NotFound)?;
        let mut entry = entry_from_row(&row)?;
        let cancelled: Option<DateTime<Utc>> = row.try_get("cancelled_at").map_err(persistence)?;
        let snapshot = input.clone().unwrap_or(NewEntry {
            occurred_at: entry.occurred_at,
            value: entry.value,
        });
        let payload = serde_json::to_string(&CheckInPayload {
            habit_id: entry.habit_id,
            entry: snapshot.clone(),
        })
        .map_err(persistence)?;
        let operation = if input.is_some() { "correct" } else { "cancel" };
        if let Some(previous)=sqlx::query("SELECT entry_id, operation, payload FROM entry_events WHERE user_id = ? AND idempotency_key = ?").bind(actor.user_id.0.to_string()).bind(key).fetch_optional(&mut *tx).await.map_err(persistence)?{
            let previous_id:String=previous.try_get("entry_id").map_err(persistence)?;let previous_operation:String=previous.try_get("operation").map_err(persistence)?;let previous_payload:String=previous.try_get("payload").map_err(persistence)?;
            if previous_id!=id.to_string()||previous_operation!=operation||(input.is_some()&&previous_payload!=payload){return Err(DomainError::Conflict);}tx.commit().await.map_err(persistence)?;return Ok(entry);
        }
        if cancelled.is_some() {
            return Err(DomainError::Validation("entry is cancelled"));
        }
        if input.is_some() {
            let mut habit = owned_habit(&mut tx, actor.user_id, entry.habit_id).await?;
            let timezone = habit
                .definition
                .timezone
                .parse::<chrono_tz::Tz>()
                .map_err(persistence)?;
            apply_version(
                &mut tx,
                &mut habit,
                snapshot.occurred_at.with_timezone(&timezone).date_naive(),
            )
            .await?;
            entry.local_date = snapshot.eligible_date(&habit)?;
            let rest:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM schedule_exceptions WHERE user_id = ? AND habit_id = ? AND local_date = ?)").bind(actor.user_id.0.to_string()).bind(entry.habit_id.to_string()).bind(entry.local_date).fetch_one(&mut *tx).await.map_err(persistence)?;
            if rest {
                return Err(DomainError::Validation("instant falls on a rest exception"));
            }
            entry.occurred_at = snapshot.occurred_at;
            entry.value = snapshot.value;
            sqlx::query("UPDATE entries SET occurred_at = ?, local_date = ?, value = ? WHERE user_id = ? AND id = ?").bind(entry.occurred_at).bind(entry.local_date).bind(entry.value).bind(actor.user_id.0.to_string()).bind(id.to_string()).execute(&mut *tx).await.map_err(persistence)?;
        } else {
            sqlx::query("UPDATE entries SET cancelled_at = ? WHERE user_id = ? AND id = ?")
                .bind(Utc::now())
                .bind(actor.user_id.0.to_string())
                .bind(id.to_string())
                .execute(&mut *tx)
                .await
                .map_err(persistence)?;
        }
        let event = append_event(
            &mut tx,
            actor.user_id,
            entry.habit_id,
            key,
            if input.is_some() {
                "entry.correct"
            } else {
                "entry.cancel"
            },
            &payload,
        )
        .await?;
        sqlx::query("INSERT INTO entry_events (id, user_id, entry_id, idempotency_key, operation, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(event.to_string()).bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(key).bind(operation).bind(payload).bind(Utc::now()).execute(&mut *tx).await.map_err(persistence)?;
        rebuild(&mut tx, actor.user_id, entry.habit_id, event).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(entry)
    }
}
