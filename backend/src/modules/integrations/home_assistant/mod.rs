use crate::modules::DomainError;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// No Debug: the credential is accepted once and persisted only as AEAD ciphertext.
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Connect {
    pub token: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Notification {
    pub title: String,
    pub message: String,
}
impl Notification {
    pub fn validate(&self) -> Result<(), DomainError> {
        if self.title.is_empty()
            || self.title.len() > 120
            || self.message.is_empty()
            || self.message.len() > 4096
        {
            Err(DomainError::Validation(
                "notification title 1..120 bytes, message 1..4096 bytes",
            ))
        } else {
            Ok(())
        }
    }
}
