use crate::modules::DomainError;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AccountCredentials {
    pub email: String,
    pub password: String,
    #[serde(default = "default_timezone")]
    pub timezone: String,
}
fn default_timezone() -> String {
    "UTC".into()
}
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EmailRequest {
    pub email: String,
}
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ResetRequest {
    pub email: String,
    pub code: String,
    pub password: String,
}
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RefreshRequest {
    pub refresh_token: String,
}
// Deliberately no Debug: credentials must never enter logs.
#[derive(Serialize, ToSchema)]
pub struct MobileTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u32,
}
pub fn email(value: &str) -> Result<String, DomainError> {
    let value = value.trim().to_lowercase();
    let parts: Vec<_> = value.split('@').collect();
    if value.len() > 254
        || parts.len() != 2
        || parts[0].is_empty()
        || !parts[1].contains('.')
        || parts[1].starts_with('.')
        || parts[1].ends_with('.')
        || value.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(DomainError::Validation("Adresse e-mail invalide."));
    }
    Ok(value)
}
pub fn password(value: &str) -> Result<(), DomainError> {
    if value.chars().count() < 12 || value.len() > 1024 {
        return Err(DomainError::Validation(
            "Utilisez un mot de passe de 12 caractères minimum (1024 octets maximum).",
        ));
    }
    Ok(())
}
