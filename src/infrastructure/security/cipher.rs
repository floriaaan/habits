use crate::modules::{DomainError, users::UserId};
use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use zeroize::Zeroizing;

pub struct SecretCipher {
    cipher: Aes256Gcm,
    pub key_id: String,
}
pub struct Encrypted {
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
    pub key_id: String,
}

impl SecretCipher {
    pub fn new(encoded: &str, key_id: String) -> Result<Self, DomainError> {
        let key = Zeroizing::new(STANDARD.decode(encoded).map_err(|_| {
            DomainError::Validation(
                "ENCRYPTION_KEY must be standard base64 encoding 32 random bytes",
            )
        })?);
        if key.len() != 32 || key_id.is_empty() || key_id.len() > 64 {
            return Err(DomainError::Validation(
                "32-byte encryption key and key ID required",
            ));
        }
        Ok(Self {
            cipher: Aes256Gcm::new_from_slice(&key).map_err(|_| DomainError::Unavailable)?,
            key_id,
        })
    }
    fn aad(&self, user: UserId, provider: &str) -> String {
        format!("habit-tracker:v1:{}:{provider}:{}", user.0, self.key_id)
    }
    pub fn encrypt(
        &self,
        user: UserId,
        provider: &str,
        plaintext: &[u8],
    ) -> Result<Encrypted, DomainError> {
        let mut nonce = [0u8; 12];
        getrandom::fill(&mut nonce).map_err(|_| DomainError::Unavailable)?;
        let ciphertext = self
            .cipher
            .encrypt(
                &Nonce::from(nonce),
                Payload {
                    msg: plaintext,
                    aad: self.aad(user, provider).as_bytes(),
                },
            )
            .map_err(|_| DomainError::Unavailable)?;
        Ok(Encrypted {
            ciphertext,
            nonce: nonce.to_vec(),
            key_id: self.key_id.clone(),
        })
    }
    pub fn decrypt(
        &self,
        user: UserId,
        provider: &str,
        data: Encrypted,
    ) -> Result<Zeroizing<Vec<u8>>, DomainError> {
        if data.key_id != self.key_id {
            return Err(DomainError::Unavailable);
        }
        let nonce: [u8; 12] = data
            .nonce
            .as_slice()
            .try_into()
            .map_err(|_| DomainError::Unavailable)?;
        self.cipher
            .decrypt(
                &Nonce::from(nonce),
                Payload {
                    msg: &data.ciphertext,
                    aad: self.aad(user, provider).as_bytes(),
                },
            )
            .map(Zeroizing::new)
            .map_err(|_| DomainError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use uuid::Uuid;
    #[test]
    fn aead_binds_user_provider_key_and_detects_tampering() {
        let cipher = SecretCipher::new(&STANDARD.encode([42u8; 32]), "test".into()).unwrap();
        let user = UserId(Uuid::new_v4());
        let data = cipher.encrypt(user, "strava", b"test-refresh").unwrap();
        assert_ne!(data.ciphertext, b"test-refresh");
        assert_eq!(
            &*cipher.decrypt(user, "strava", data).unwrap(),
            b"test-refresh"
        );
        let mut data = cipher.encrypt(user, "strava", b"test-refresh").unwrap();
        data.ciphertext[0] ^= 1;
        assert!(cipher.decrypt(user, "strava", data).is_err());
        assert!(
            cipher
                .decrypt(
                    UserId(Uuid::new_v4()),
                    "strava",
                    cipher.encrypt(user, "strava", b"test").unwrap()
                )
                .is_err()
        );
        assert!(
            cipher
                .decrypt(
                    user,
                    "home_assistant",
                    cipher.encrypt(user, "strava", b"test").unwrap()
                )
                .is_err()
        );
    }
}
