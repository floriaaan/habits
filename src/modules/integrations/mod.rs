pub mod home_assistant;
pub mod strava;

use crate::modules::users::UserId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Strava,
    HomeAssistant,
}

/// Metadata only. No plaintext credentials belong in a domain record.
#[derive(Clone, Debug)]
pub struct Integration {
    pub id: Uuid,
    pub user_id: UserId,
    pub provider: Provider,
    pub provider_subject: String,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct SourceIdentifier {
    pub id: Uuid,
    pub user_id: UserId,
    pub integration_id: Uuid,
    pub entry_id: Uuid,
    pub provider_object_id: String,
}

/// Outbound adapter policy. No provider request is made by the current API.
pub fn http_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(3))
        .timeout(std::time::Duration::from_secs(10))
        .build()
}
