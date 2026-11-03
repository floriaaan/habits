use super::{Store, owned_habit, persistence, tracking};
use crate::{
    infrastructure::{jobs::LeasedJob, security::token_hash},
    modules::{DomainError, habits::presentation::Presentation, statistics, users::UserId},
};
use chrono::{DateTime, Utc};
use sqlx::Row;
use uuid::Uuid;

impl Store {
    pub async fn enqueue_reminders_at(&self, now: DateTime<Utc>) -> Result<usize, DomainError> {
        let rows = sqlx::query("SELECT p.user_id, p.habit_id FROM habit_presentations p JOIN habits h ON h.user_id = p.user_id AND h.id = p.habit_id WHERE h.archived_at IS NULL AND json_extract(p.definition, '$.reminder_at') IS NOT NULL")
            .fetch_all(&self.pool).await.map_err(persistence)?;
        let mut count = 0;
        for row in rows {
            let user = UserId(
                row.try_get::<String, _>("user_id")
                    .map_err(persistence)?
                    .parse()
                    .map_err(persistence)?,
            );
            let habit: Uuid = row
                .try_get::<String, _>("habit_id")
                .map_err(persistence)?
                .parse()
                .map_err(persistence)?;
            let mut tx = self
                .pool
                .begin_with("BEGIN IMMEDIATE")
                .await
                .map_err(persistence)?;
            if !reminder_due(&mut tx, user, habit, now, None).await? {
                continue;
            }
            let integration: Option<String> = sqlx::query_scalar("SELECT id FROM integrations WHERE user_id = ? AND provider = 'home_assistant' AND revoked_at IS NULL")
                .bind(user.0.to_string()).fetch_optional(&mut *tx).await.map_err(persistence)?;
            let Some(integration) = integration else {
                continue;
            };
            let definition = owned_habit(&mut tx, user, habit).await?;
            let date = now
                .with_timezone(
                    &definition
                        .definition
                        .timezone
                        .parse::<chrono_tz::Tz>()
                        .map_err(persistence)?,
                )
                .date_naive();
            let delivered: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM reminder_deliveries WHERE user_id = ? AND habit_id = ? AND local_date = ?)")
                .bind(user.0.to_string()).bind(habit.to_string()).bind(date).fetch_one(&mut *tx).await.map_err(persistence)?;
            if delivered {
                continue;
            }
            let pending: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM jobs WHERE user_id = ? AND state IN ('pending','running')",
            )
            .bind(user.0.to_string())
            .fetch_one(&mut *tx)
            .await
            .map_err(persistence)?;
            if pending >= 1000 {
                continue;
            }
            let job = Uuid::new_v4();
            let payload = serde_json::json!({"habit_id":habit,"local_date":date,"title":"Habit Tracker", "message": format!("{} : objectif encore à réaliser", definition.definition.name)}).to_string();
            sqlx::query("INSERT INTO jobs (id, user_id, integration_id, kind, idempotency_key, payload, available_at, created_at, payload_hash) VALUES (?, ?, ?, 'ha.reminder', ?, ?, ?, ?, ?)")
                .bind(job.to_string()).bind(user.0.to_string()).bind(integration).bind(format!("reminder:{habit}:{date}")).bind(&payload).bind(now).bind(now).bind(token_hash(&payload)).execute(&mut *tx).await.map_err(persistence)?;
            sqlx::query("INSERT INTO reminder_deliveries(user_id, habit_id, local_date, notification_id) VALUES (?, ?, ?, ?)")
                .bind(user.0.to_string()).bind(habit.to_string()).bind(date).bind(job.to_string()).execute(&mut *tx).await.map_err(persistence)?;
            tx.commit().await.map_err(persistence)?;
            count += 1;
        }
        Ok(count)
    }
    pub async fn reminder_still_due(
        &self,
        job: &LeasedJob,
        now: DateTime<Utc>,
    ) -> Result<bool, DomainError> {
        let id = job.payload["habit_id"]
            .as_str()
            .ok_or(DomainError::Unavailable)?
            .parse()
            .map_err(persistence)?;
        let date = job.payload["local_date"]
            .as_str()
            .ok_or(DomainError::Unavailable)?
            .parse()
            .map_err(persistence)?;
        let mut tx = self.pool.begin().await.map_err(persistence)?;
        super::jobs::fence(&mut tx, job).await?;
        let due = reminder_due(&mut tx, job.user_id, id, now, Some(date)).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(due)
    }
}

async fn reminder_due(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user: UserId,
    id: Uuid,
    now: DateTime<Utc>,
    expected_date: Option<chrono::NaiveDate>,
) -> Result<bool, DomainError> {
    let (habit, versions, entries, rests, from, _) = tracking::data(tx, user, id).await?;
    if habit.archived_at.is_some() {
        return Ok(false);
    }
    let value: Option<String> = sqlx::query_scalar(
        "SELECT definition FROM habit_presentations WHERE user_id = ? AND habit_id = ?",
    )
    .bind(user.0.to_string())
    .bind(id.to_string())
    .fetch_optional(&mut **tx)
    .await
    .map_err(persistence)?;
    let Some(value) = value else {
        return Ok(false);
    };
    let settings: Presentation = serde_json::from_str(&value).map_err(persistence)?;
    let timezone = habit
        .definition
        .timezone
        .parse::<chrono_tz::Tz>()
        .map_err(persistence)?;
    let local = now.with_timezone(&timezone);
    let date = local.date_naive();
    let Some(time) = settings.reminder_at else {
        return Ok(false);
    };
    if expected_date.is_some_and(|d| d != date)
        || local.time() < time
        || rests.contains(&date)
        || habit
            .definition
            .schedule
            .eligible_date(now, timezone)
            .is_err()
        || date < from
    {
        return Ok(false);
    }
    let (periods, _) = statistics::calculate(&versions, &entries, &rests, from, date)?;
    let start = statistics::period_start(date, habit.definition.period);
    Ok(periods
        .iter()
        .any(|p| p.start == start && !p.completed && p.eligible_days > 0))
}
