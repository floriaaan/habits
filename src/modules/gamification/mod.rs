//! Reserved for compensable XP services. No XP is awarded in iteration 1.
//! Storage contract: xp_ledger; compensations reference the original ledger row.

use crate::modules::users::UserId;
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Storage contract only; award rules and compensation services are not shipped.
#[derive(Clone, Debug)]
pub struct XpLedgerEntry {
    pub id: Uuid,
    pub user_id: UserId,
    pub event_id: Uuid,
    pub amount: i64,
    pub compensates_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}
