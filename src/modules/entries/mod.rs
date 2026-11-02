use crate::modules::{
    DomainError,
    auth::{Principal, Scope},
    habits::{Habit, HabitKind, Pagination},
    users::UserId,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::future::Future;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NewEntry {
    pub occurred_at: DateTime<Utc>,
    pub value: f64,
}

/// Persisted event payload, also used for semantic idempotency comparison.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CheckInPayload {
    pub habit_id: Uuid,
    pub entry: NewEntry,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryOperation {
    Create,
    Correct,
    Cancel,
}

/// Corrections/cancellations are contracts only; only Create is produced today.
#[derive(Clone, Debug)]
pub struct EntryEvent {
    pub id: Uuid,
    pub user_id: UserId,
    pub entry_id: Uuid,
    pub idempotency_key: String,
    pub operation: EntryOperation,
    pub payload: CheckInPayload,
    pub created_at: DateTime<Utc>,
}

impl NewEntry {
    pub fn validate(&self, now: DateTime<Utc>) -> Result<(), DomainError> {
        if !self.value.is_finite() || self.value <= 0.0 || self.value > 1e12 {
            return Err(DomainError::Validation(
                "value must be finite and in (0, 1e12]",
            ));
        }
        if self.occurred_at > now || self.occurred_at.timestamp() < 0 {
            return Err(DomainError::Validation(
                "occurred_at must be between Unix epoch and now",
            ));
        }
        Ok(())
    }

    pub fn eligible_date(&self, habit: &Habit) -> Result<NaiveDate, DomainError> {
        match habit.definition.kind {
            HabitKind::Boolean | HabitKind::Frequency if self.value != 1.0 => {
                return Err(DomainError::Validation(
                    "boolean/frequency entries require value 1",
                ));
            }
            _ => (),
        }
        let timezone = habit
            .definition
            .timezone
            .parse()
            .map_err(|_| DomainError::Unavailable)?;
        habit
            .definition
            .schedule
            .eligible_date(self.occurred_at, timezone)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct Entry {
    pub id: Uuid,
    pub habit_id: Uuid,
    pub user_id: UserId,
    pub occurred_at: DateTime<Utc>,
    pub local_date: NaiveDate,
    pub value: f64,
    pub created_at: DateTime<Utc>,
}

pub struct RecordedEntry {
    pub entry: Entry,
    pub created: bool,
}

#[derive(Serialize, ToSchema)]
pub struct EntryPage {
    pub items: Vec<Entry>,
    pub limit: u32,
    pub offset: u32,
}

pub trait EntryRepository: Send + Sync {
    /// Atomically checks ownership, schedule/rest and key; inserts entry + event.
    fn record(
        &self,
        user: UserId,
        habit: Uuid,
        key: &str,
        input: NewEntry,
    ) -> impl Future<Output = Result<RecordedEntry, DomainError>> + Send;
    fn get(
        &self,
        user: UserId,
        id: Uuid,
    ) -> impl Future<Output = Result<Entry, DomainError>> + Send;
    fn list(
        &self,
        user: UserId,
        habit: Uuid,
        page: Pagination,
    ) -> impl Future<Output = Result<Vec<Entry>, DomainError>> + Send;
}

pub async fn record(
    repo: &impl EntryRepository,
    actor: &Principal,
    habit: Uuid,
    key: &str,
    input: NewEntry,
    now: DateTime<Utc>,
) -> Result<RecordedEntry, DomainError> {
    actor.require(Scope::EntriesWrite)?;
    if key.is_empty() || key.len() > 128 || !key.bytes().all(|c| c.is_ascii_graphic()) {
        return Err(DomainError::Validation(
            "Idempotency-Key must be 1..128 visible ASCII bytes",
        ));
    }
    input.validate(now)?;
    repo.record(actor.user_id, habit, key, input).await
}

pub async fn get(
    repo: &impl EntryRepository,
    actor: &Principal,
    id: Uuid,
) -> Result<Entry, DomainError> {
    actor.require(Scope::EntriesRead)?;
    repo.get(actor.user_id, id).await
}

pub async fn list(
    repo: &impl EntryRepository,
    actor: &Principal,
    habit: Uuid,
    page: Pagination,
) -> Result<EntryPage, DomainError> {
    actor.require(Scope::EntriesRead)?;
    let page = page.validate()?;
    Ok(EntryPage {
        items: repo.list(actor.user_id, habit, page).await?,
        limit: page.limit,
        offset: page.offset,
    })
}
