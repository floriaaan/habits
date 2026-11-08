//! Deterministic period rewards; writes and compensations are transactional.

use crate::modules::users::UserId;
use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

/// Append-only credits and compensations derived from completed periods.
#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct XpLedgerEntry {
    pub id: Uuid,
    pub user_id: UserId,
    pub event_id: Uuid,
    pub habit_id: Uuid,
    pub period_start: chrono::NaiveDate,
    pub amount: i64,
    pub compensates_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct Gamification {
    pub xp: i64,
    pub level: u32,
    pub badges: Vec<String>,
}
pub fn summary(xp: i64) -> Gamification {
    let mut badges = Vec::new();
    if xp >= 10 {
        badges.push("first_completion".into());
    }
    if xp >= 100 {
        badges.push("ten_completions".into());
    }
    Gamification {
        xp,
        level: level(xp),
        badges,
    }
}
#[derive(Serialize, ToSchema)]
pub struct LedgerPage {
    pub items: Vec<XpLedgerEntry>,
    pub limit: u32,
    pub offset: u32,
}

pub fn reward(completed: bool) -> i64 {
    if completed { 10 } else { 0 }
}
pub fn level(xp: i64) -> u32 {
    1 + (xp.max(0) / 100).min(i64::from(u32::MAX) - 1) as u32
}
