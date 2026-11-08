use crate::modules::DomainError;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
pub mod cipher;
pub mod oidc;

pub fn opaque_token() -> Result<String, DomainError> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| DomainError::Unavailable)?;
    Ok(format!("ht_{}", URL_SAFE_NO_PAD.encode(bytes)))
}

pub fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

pub mod account_mail;
