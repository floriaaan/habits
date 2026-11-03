use crate::modules::{
    DomainError,
    entries::{CheckInPayload, Entry, EntryRepository, NewEntry, RecordedEntry},
    habits::{Habit, HabitRepository, NewHabit, Pagination},
    users::UserId,
};
use chrono::Utc;
use sqlx::{
    Row, SqliteConnection, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use std::{path::Path, str::FromStr, time::Duration};
use uuid::Uuid;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
mod auth;
mod dashboard;
#[cfg(test)]
mod dashboard_tests;
pub(crate) mod integrations;
mod jobs;
mod onboarding;
mod reminders;
mod tracking;
#[cfg(test)]
mod tracking_tests;

#[derive(Clone)]
pub struct Store {
    pub(crate) pool: SqlitePool,
    pub(crate) streams: std::sync::Arc<tokio::sync::Semaphore>,
}

impl Store {
    #[tracing::instrument(skip_all)]
    pub async fn connect(url: &str) -> Result<Self, sqlx::Error> {
        let options = SqliteConnectOptions::from_str(url)?
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Full)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .acquire_timeout(Duration::from_secs(5))
            .connect_with(options)
            .await?;
        MIGRATOR
            .run(&pool)
            .await
            .map_err(|error| sqlx::Error::Migrate(Box::new(error)))?;
        tracing::info!("SQLite connected and migrations applied");
        Ok(Self {
            pool,
            streams: std::sync::Arc::new(tokio::sync::Semaphore::new(16)),
        })
    }

    pub async fn ready(&self) -> bool {
        sqlx::query("SELECT 1").fetch_one(&self.pool).await.is_ok()
    }

    /// SQLite produces a coherent snapshot including committed WAL pages.
    /// The destination must not exist; SQLite refuses to overwrite it.
    #[tracing::instrument(skip_all)]
    pub async fn backup(&self, destination: &Path) -> Result<(), sqlx::Error> {
        tracing::info!("SQLite backup started");
        if destination.exists() {
            return Err(sqlx::Error::Protocol(
                "backup destination already exists".into(),
            ));
        }
        let filename = destination
            .to_str()
            .ok_or_else(|| sqlx::Error::Protocol("backup path must be UTF-8".into()))?;
        sqlx::query("VACUUM INTO ?")
            .bind(filename)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn close(&self) {
        self.pool.close().await;
    }
}

fn persistence(error: impl std::fmt::Display) -> DomainError {
    // SQL errors may contain sensitive values; log only the failure category.
    let _ = error;
    tracing::error!(category = "database", "persistence operation failed");
    DomainError::Unavailable
}

fn habit_from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Habit, DomainError> {
    let id: String = row.try_get("id").map_err(persistence)?;
    let user: String = row.try_get("user_id").map_err(persistence)?;
    let definition: String = row.try_get("definition").map_err(persistence)?;
    Ok(Habit {
        id: id.parse().map_err(persistence)?,
        user_id: UserId(user.parse().map_err(persistence)?),
        definition: serde_json::from_str(&definition).map_err(persistence)?,
        created_at: row.try_get("created_at").map_err(persistence)?,
        archived_at: row.try_get("archived_at").map_err(persistence)?,
    })
}

fn entry_from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Entry, DomainError> {
    let id: String = row.try_get("id").map_err(persistence)?;
    let user: String = row.try_get("user_id").map_err(persistence)?;
    let habit: String = row.try_get("habit_id").map_err(persistence)?;
    Ok(Entry {
        id: id.parse().map_err(persistence)?,
        user_id: UserId(user.parse().map_err(persistence)?),
        habit_id: habit.parse().map_err(persistence)?,
        occurred_at: row.try_get("occurred_at").map_err(persistence)?,
        local_date: row.try_get("local_date").map_err(persistence)?,
        value: row.try_get("value").map_err(persistence)?,
        created_at: row.try_get("created_at").map_err(persistence)?,
    })
}

async fn owned_habit(
    connection: &mut SqliteConnection,
    user: UserId,
    id: Uuid,
) -> Result<Habit, DomainError> {
    let row = sqlx::query("SELECT * FROM habits WHERE user_id = ? AND id = ?")
        .bind(user.0.to_string())
        .bind(id.to_string())
        .fetch_optional(&mut *connection)
        .await
        .map_err(persistence)?
        .ok_or(DomainError::NotFound)?;
    let mut habit = habit_from_row(&row)?;
    let timezone = habit
        .definition
        .timezone
        .parse::<chrono_tz::Tz>()
        .map_err(persistence)?;
    let today = Utc::now().with_timezone(&timezone).date_naive();
    tracking::apply_version(connection, &mut habit, today).await?;
    Ok(habit)
}

async fn insert_habit(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user: UserId,
    input: NewHabit,
) -> Result<Habit, DomainError> {
    let habit = Habit {
        id: Uuid::new_v4(),
        user_id: user,
        definition: input,
        created_at: Utc::now(),
        archived_at: None,
    };
    let definition = serde_json::to_string(&habit.definition).map_err(persistence)?;
    let schedule = serde_json::to_string(&habit.definition.schedule).map_err(persistence)?;
    sqlx::query("INSERT INTO habits (id, user_id, definition, created_at) VALUES (?, ?, ?, ?)")
        .bind(habit.id.to_string())
        .bind(user.0.to_string())
        .bind(definition)
        .bind(habit.created_at)
        .execute(&mut **tx)
        .await
        .map_err(persistence)?;
    sqlx::query("INSERT INTO schedules (habit_id, user_id, definition) VALUES (?, ?, ?)")
        .bind(habit.id.to_string())
        .bind(user.0.to_string())
        .bind(schedule)
        .execute(&mut **tx)
        .await
        .map_err(persistence)?;
    sqlx::query("INSERT INTO habit_versions (id, user_id, habit_id, effective_from, definition, created_at) VALUES (?, ?, ?, '1970-01-01', ?, ?)")
            .bind(habit.id.to_string()).bind(user.0.to_string()).bind(habit.id.to_string()).bind(serde_json::to_string(&habit.definition).map_err(persistence)?).bind(habit.created_at).execute(&mut **tx).await.map_err(persistence)?;
    tracing::info!(habit_id=%habit.id, "habit created in transaction");
    Ok(habit)
}

impl HabitRepository for Store {
    async fn create(&self, user: UserId, input: NewHabit) -> Result<Habit, DomainError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let habit = insert_habit(&mut tx, user, input).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(habit)
    }

    async fn list(&self, user: UserId, page: Pagination) -> Result<Vec<Habit>, DomainError> {
        let rows = sqlx::query(
            "SELECT * FROM habits WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at, id LIMIT ? OFFSET ?",
        )
        .bind(user.0.to_string())
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(&self.pool)
        .await
        .map_err(persistence)?;
        let mut items = Vec::new();
        for row in &rows {
            let habit = habit_from_row(row)?;
            let mut connection = self.pool.acquire().await.map_err(persistence)?;
            items.push(owned_habit(&mut connection, user, habit.id).await?);
        }
        Ok(items)
    }
}

impl EntryRepository for Store {
    async fn record(
        &self,
        user: UserId,
        habit_id: Uuid,
        key: &str,
        input: NewEntry,
    ) -> Result<RecordedEntry, DomainError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let recorded = record_in_tx(&mut tx, user, habit_id, key, input).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(recorded)
    }

    async fn get(&self, user: UserId, id: Uuid) -> Result<Entry, DomainError> {
        let row = sqlx::query(
            "SELECT * FROM entries WHERE user_id = ? AND id = ? AND cancelled_at IS NULL",
        )
        .bind(user.0.to_string())
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(persistence)?
        .ok_or(DomainError::NotFound)?;
        entry_from_row(&row)
    }

    async fn list(
        &self,
        user: UserId,
        habit: Uuid,
        page: Pagination,
    ) -> Result<Vec<Entry>, DomainError> {
        let mut tx = self.pool.begin().await.map_err(persistence)?;
        owned_habit(&mut tx, user, habit).await?;
        let rows = sqlx::query("SELECT * FROM entries WHERE user_id = ? AND habit_id = ? AND cancelled_at IS NULL ORDER BY occurred_at, id LIMIT ? OFFSET ?")
            .bind(user.0.to_string()).bind(habit.to_string()).bind(page.limit).bind(page.offset)
            .fetch_all(&mut *tx).await.map_err(persistence)?;
        let entries = rows.iter().map(entry_from_row).collect::<Result<_, _>>()?;
        tx.commit().await.map_err(persistence)?;
        Ok(entries)
    }
}

#[cfg(test)]
pub(crate) mod tests;

pub(super) async fn record_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    user: UserId,
    habit_id: Uuid,
    key: &str,
    input: NewEntry,
) -> Result<RecordedEntry, DomainError> {
    let mut habit = owned_habit(tx, user, habit_id).await?;
    let payload = serde_json::to_string(&CheckInPayload {
        habit_id,
        entry: input.clone(),
    })
    .map_err(persistence)?;
    if let Some(row) = sqlx::query(
            "SELECT entry_id, operation, payload FROM entry_events WHERE user_id = ? AND idempotency_key = ?",
        )
        .bind(user.0.to_string())
        .bind(key)
        .fetch_optional(&mut **tx)
        .await
        .map_err(persistence)?
        {
            let previous: String = row.try_get("payload").map_err(persistence)?;
            let operation: String = row.try_get("operation").map_err(persistence)?;
            if previous != payload || operation != "create" {
                return Err(DomainError::Conflict);
            }
            let id: String = row.try_get("entry_id").map_err(persistence)?;
            let row = sqlx::query("SELECT * FROM entries WHERE user_id = ? AND id = ?")
                .bind(user.0.to_string())
                .bind(id)
                .fetch_one(&mut **tx)
                .await
                .map_err(persistence)?;
            let entry = entry_from_row(&row)?;
                return Ok(RecordedEntry {
                entry,
                created: false,
            });
        }
    if habit.archived_at.is_some() {
        return Err(DomainError::Validation("habit is archived"));
    }
    let timezone = habit
        .definition
        .timezone
        .parse::<chrono_tz::Tz>()
        .map_err(persistence)?;
    tracking::apply_version(
        tx,
        &mut habit,
        input.occurred_at.with_timezone(&timezone).date_naive(),
    )
    .await?;
    let local_date = input.eligible_date(&habit)?;
    let rest: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM schedule_exceptions WHERE user_id = ? AND habit_id = ? AND local_date = ? AND kind = 'rest')")
            .bind(user.0.to_string()).bind(habit_id.to_string()).bind(local_date)
            .fetch_one(&mut **tx).await.map_err(persistence)?;
    if rest {
        return Err(DomainError::Validation("instant falls on a rest exception"));
    }
    let entry = Entry {
        id: Uuid::new_v4(),
        habit_id,
        user_id: user,
        occurred_at: input.occurred_at,
        local_date,
        value: input.value,
        created_at: Utc::now(),
    };
    sqlx::query("INSERT INTO entries (id, user_id, habit_id, occurred_at, local_date, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(entry.id.to_string()).bind(user.0.to_string()).bind(habit_id.to_string())
            .bind(entry.occurred_at).bind(entry.local_date).bind(entry.value).bind(entry.created_at)
            .execute(&mut **tx).await.map_err(persistence)?;
    let event = tracking::append_event(tx, user, habit_id, key, "entry.create", &payload).await?;
    sqlx::query("INSERT INTO entry_events (id, user_id, entry_id, idempotency_key, operation, payload, created_at) VALUES (?, ?, ?, ?, 'create', ?, ?)")
            .bind(event.to_string()).bind(user.0.to_string()).bind(entry.id.to_string())
            .bind(key).bind(payload).bind(entry.created_at).execute(&mut **tx).await.map_err(persistence)?;
    tracking::rebuild(tx, user, habit_id, event).await?;
    Ok(RecordedEntry {
        entry,
        created: true,
    })
}
