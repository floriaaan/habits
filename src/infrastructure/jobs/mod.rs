//! Persistent at-least-once jobs; leased atomically and retried with backoff.

use crate::modules::users::UserId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobState {
    Pending,
    Running,
    Succeeded,
    Failed,
}

/// Persistent contract; payloads must contain references, never credentials.
#[derive(Clone, Debug)]
pub struct Job {
    pub id: Uuid,
    pub user_id: UserId,
    pub integration_id: Option<Uuid>,
    pub kind: String,
    pub idempotency_key: String,
    pub payload: serde_json::Value,
    pub state: JobState,
    pub attempts: u32,
    pub available_at: DateTime<Utc>,
    pub lease_until: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LeasedJob {
    pub id: Uuid,
    pub user_id: UserId,
    pub integration_id: Uuid,
    pub kind: String,
    pub payload: serde_json::Value,
    pub attempts: u32,
    pub owner: Uuid,
    pub created_at: DateTime<Utc>,
}
