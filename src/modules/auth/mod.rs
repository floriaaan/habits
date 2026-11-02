use crate::modules::{DomainError, users::UserId};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IdentityMode {
    OidcAccessToken,
    PersonalAccessToken,
    ServiceAccount,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub enum Scope {
    #[serde(rename = "habits:read")]
    HabitsRead,
    #[serde(rename = "habits:write")]
    HabitsWrite,
    #[serde(rename = "entries:read")]
    EntriesRead,
    #[serde(rename = "entries:write")]
    EntriesWrite,
    #[serde(rename = "tokens:manage")]
    TokensManage,
    #[serde(rename = "statistics:read")]
    StatisticsRead,
    #[serde(rename = "integrations:manage")]
    IntegrationsManage,
    #[serde(rename = "notifications:write")]
    NotificationsWrite,
}

impl Scope {
    pub fn all() -> Vec<Self> {
        vec![
            Self::HabitsRead,
            Self::HabitsWrite,
            Self::EntriesRead,
            Self::EntriesWrite,
            Self::TokensManage,
            Self::StatisticsRead,
            Self::IntegrationsManage,
            Self::NotificationsWrite,
        ]
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NewToken {
    pub scopes: Vec<Scope>,
    pub expires_at: DateTime<Utc>,
    pub service_account_id: Option<Uuid>,
}

impl NewToken {
    pub fn validate(&self, now: DateTime<Utc>) -> Result<(), DomainError> {
        if self.scopes.is_empty()
            || self.scopes.len() > Scope::all().len()
            || self
                .scopes
                .iter()
                .enumerate()
                .any(|(i, scope)| self.scopes[..i].contains(scope))
        {
            return Err(DomainError::Validation(
                "scopes must be non-empty, known and distinct",
            ));
        }
        if self.expires_at <= now || self.expires_at > now + chrono::Duration::days(365) {
            return Err(DomainError::Validation(
                "token expiration must be within the next 365 days",
            ));
        }
        Ok(())
    }
    pub fn authorize(&self, actor: &Principal) -> Result<(), DomainError> {
        actor.require(Scope::TokensManage)?;
        for scope in &self.scopes {
            actor.require(*scope)?;
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct TokenMetadata {
    pub id: Uuid,
    pub user_id: UserId,
    pub service_account_id: Option<Uuid>,
    pub scopes: Vec<Scope>,
    pub expires_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Serialized once at issuance. Deliberately no Debug or Clone for the secret.
#[derive(Serialize, ToSchema)]
pub struct IssuedToken {
    pub token: String,
    pub metadata: TokenMetadata,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NewServiceAccount {
    pub name: String,
}
impl NewServiceAccount {
    pub fn validate(&self) -> Result<(), DomainError> {
        if self.name.trim().is_empty()
            || self.name.chars().count() > 120
            || self.name.chars().any(char::is_control)
        {
            Err(DomainError::Validation(
                "service account name must be 1..120 non-control characters",
            ))
        } else {
            Ok(())
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct ServiceAccount {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

/// Constructed only by a trusted authentication adapter, never from request JSON.
#[derive(Clone, Debug)]
pub struct Principal {
    pub user_id: UserId,
    pub mode: IdentityMode,
    pub scopes: Vec<Scope>,
}

impl Principal {
    pub fn require(&self, scope: Scope) -> Result<(), DomainError> {
        if self.scopes.contains(&scope) {
            Ok(())
        } else {
            Err(DomainError::Forbidden)
        }
    }
}
