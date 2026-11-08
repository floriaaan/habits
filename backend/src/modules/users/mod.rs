use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(transparent)]
pub struct UserId(pub Uuid);

/// Stable external identity. Email/display name must never be the identity key.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExternalIdentity {
    pub issuer: String,
    pub subject: String,
}

/// User metadata; identities are provisioned by the local CLI or verified OIDC.
#[derive(Clone, Debug)]
pub struct User {
    pub id: UserId,
    pub identity: ExternalIdentity,
    pub timezone: chrono_tz::Tz,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
