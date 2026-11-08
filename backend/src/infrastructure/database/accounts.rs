use super::{Store, persistence};
use crate::{
    infrastructure::security::{opaque_token, token_hash},
    modules::{
        DomainError,
        auth::{
            IdentityMode, Principal, Scope,
            accounts::{self, AccountCredentials, MobileTokens},
        },
        users::UserId,
    },
};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use chrono::{Duration, Utc};
use sqlx::{Row, Sqlite, Transaction};
use uuid::Uuid;

// Bound memory-heavy password hashing independently of the HTTP concurrency limit.
static HASHING: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
async fn hash(password: String) -> Result<String, DomainError> {
    let permit = HASHING.acquire().await.map_err(persistence)?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|_| DomainError::Unavailable)?;
        let salt = SaltString::encode_b64(&bytes).map_err(persistence)?;
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(persistence)
    })
    .await
    .map_err(persistence)?
}
async fn verify(password: String, encoded: String) -> Result<bool, DomainError> {
    let permit = HASHING.acquire().await.map_err(persistence)?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let parsed = PasswordHash::new(&encoded).map_err(persistence)?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    })
    .await
    .map_err(persistence)?
}
async fn issue(
    tx: &mut Transaction<'_, Sqlite>,
    user: &str,
    session: Option<&str>,
) -> Result<MobileTokens, DomainError> {
    let access = opaque_token()?.replacen("ht_", "hs_", 1);
    let refresh = opaque_token()?.replacen("ht_", "hr_", 1);
    let now = Utc::now();
    if let Some(id) = session {
        sqlx::query("UPDATE mobile_sessions SET access_hash=?, refresh_hash=?, access_expires_at=? WHERE id=?")
            .bind(token_hash(&access)).bind(token_hash(&refresh)).bind(now+Duration::minutes(15)).bind(id).execute(&mut **tx).await.map_err(persistence)?;
    } else {
        sqlx::query("INSERT INTO mobile_sessions(id,user_id,access_hash,refresh_hash,access_expires_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(user).bind(token_hash(&access)).bind(token_hash(&refresh)).bind(now+Duration::minutes(15)).bind(now+Duration::days(30)).bind(now).execute(&mut **tx).await.map_err(persistence)?;
    }
    Ok(MobileTokens {
        access_token: access,
        refresh_token: refresh,
        expires_in: 900,
    })
}
impl Store {
    // Shared across processes, keyed by a digest; no email addresses in this table.
    pub async fn account_budget(&self, key: &str, limit: i64) -> Result<bool, DomainError> {
        let bucket = token_hash(key)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        sqlx::query("DELETE FROM account_rate_limits WHERE expires_at <= ?")
            .bind(Utc::now())
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        sqlx::query("INSERT INTO account_rate_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1")
            .bind(&bucket).bind(Utc::now()+Duration::minutes(15)).execute(&mut *tx).await.map_err(persistence)?;
        let n: i64 = sqlx::query_scalar("SELECT attempts FROM account_rate_limits WHERE bucket=?")
            .bind(bucket)
            .fetch_one(&mut *tx)
            .await
            .map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(n <= limit)
    }
    pub async fn register_account(&self, input: AccountCredentials) -> Result<(), DomainError> {
        let email = accounts::email(&input.email)?;
        accounts::password(&input.password)?;
        if input.timezone.parse::<chrono_tz::Tz>().is_err() {
            return Err(DomainError::Validation("Fuseau horaire invalide."));
        }
        let encoded = hash(input.password).await?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM accounts WHERE email=?)")
                .bind(&email)
                .fetch_one(&mut *tx)
                .await
                .map_err(persistence)?;
        if exists {
            return Err(DomainError::Validation(
                "Un compte utilise déjà cette adresse. Connectez-vous ou réinitialisez votre mot de passe.",
            ));
        }
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO users(id,issuer,subject,timezone,created_at) VALUES(?,'urn:habit-tracker:account',?,?,?)")
            .bind(&id).bind(&email).bind(input.timezone).bind(Utc::now()).execute(&mut *tx).await.map_err(persistence)?;
        sqlx::query("INSERT INTO accounts(user_id,email,password_hash,created_at) VALUES(?,?,?,?)")
            .bind(id)
            .bind(&email)
            .bind(encoded)
            .bind(Utc::now())
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    pub async fn account_challenge(
        &self,
        email: &str,
        purpose: &str,
    ) -> Result<Option<String>, DomainError> {
        if purpose != "reset" {
            return Err(DomainError::Validation("Opération non prise en charge."));
        }
        let eligible:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM accounts a JOIN users u ON u.id=a.user_id WHERE email=? AND u.disabled_at IS NULL)")
            .bind(email).fetch_one(&self.pool).await.map_err(persistence)?;
        if !eligible {
            return Ok(None);
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let code = write_challenge(&mut tx, email, purpose).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(Some(code))
    }
    pub async fn login_account(
        &self,
        email: &str,
        password: String,
    ) -> Result<MobileTokens, DomainError> {
        let row = sqlx::query(
            "SELECT a.*,u.disabled_at FROM accounts a JOIN users u ON u.id=a.user_id WHERE email=?",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map_err(persistence)?;
        // Hash the unknown-user path too, avoiding an immediate account-existence oracle.
        let Some(row) = row else {
            let _ = hash(password).await?;
            return Err(DomainError::Unauthenticated);
        };
        let encoded: String = row.try_get("password_hash").map_err(persistence)?;
        let valid = verify(password, encoded.clone()).await?;
        let disabled: Option<String> = row.try_get("disabled_at").map_err(persistence)?;
        if !valid || disabled.is_some() {
            return Err(DomainError::Unauthenticated);
        }
        let user: String = row.try_get("user_id").map_err(persistence)?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        // A reset racing the password check must not create a fresh valid session.
        let current:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.user_id=? AND password_hash=? AND u.disabled_at IS NULL)").bind(&user).bind(encoded).fetch_one(&mut *tx).await.map_err(persistence)?;
        if !current {
            return Err(DomainError::Unauthenticated);
        }
        let tokens = issue(&mut tx, &user, None).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(tokens)
    }
    pub async fn reset_account(
        &self,
        email: &str,
        code: &str,
        password: String,
    ) -> Result<(), DomainError> {
        accounts::password(&password)?;
        let encoded = hash(password).await?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        if !consume(&mut tx, email, "reset", code).await? {
            tx.commit().await.map_err(persistence)?;
            return Err(DomainError::Validation("Code invalide ou expiré."));
        }
        sqlx::query("UPDATE accounts SET password_hash=? WHERE email=?")
            .bind(encoded)
            .bind(email)
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        sqlx::query("UPDATE mobile_sessions SET revoked_at=? WHERE user_id=(SELECT user_id FROM accounts WHERE email=?)").bind(Utc::now()).bind(email).execute(&mut *tx).await.map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    pub async fn authenticate_mobile(&self, token: &str) -> Result<Principal, DomainError> {
        if token.len() != 46 {
            return Err(DomainError::Unauthenticated);
        }
        let id:Option<String>=sqlx::query_scalar("SELECT s.user_id FROM mobile_sessions s JOIN users u ON u.id=s.user_id WHERE access_hash=? AND revoked_at IS NULL AND access_expires_at>? AND s.expires_at>? AND u.disabled_at IS NULL")
            .bind(token_hash(token)).bind(Utc::now()).bind(Utc::now()).fetch_optional(&self.pool).await.map_err(persistence)?;
        Ok(Principal {
            user_id: UserId(
                id.ok_or(DomainError::Unauthenticated)?
                    .parse()
                    .map_err(persistence)?,
            ),
            mode: IdentityMode::MobileSession,
            scopes: Scope::all(),
        })
    }
    pub async fn refresh_mobile(&self, token: &str) -> Result<MobileTokens, DomainError> {
        if token.len() != 46 || !token.starts_with("hr_") {
            return Err(DomainError::Unauthenticated);
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        sqlx::query("DELETE FROM consumed_refresh_tokens WHERE expires_at<=?")
            .bind(Utc::now())
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        let replay: Option<String> =
            sqlx::query_scalar("SELECT session_id FROM consumed_refresh_tokens WHERE token_hash=?")
                .bind(token_hash(token))
                .fetch_optional(&mut *tx)
                .await
                .map_err(persistence)?;
        if let Some(id) = replay {
            sqlx::query("UPDATE mobile_sessions SET revoked_at=? WHERE id=?")
                .bind(Utc::now())
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(persistence)?;
            tx.commit().await.map_err(persistence)?;
            return Err(DomainError::Unauthenticated);
        }
        let row=sqlx::query("SELECT s.* FROM mobile_sessions s JOIN users u ON u.id=s.user_id WHERE refresh_hash=? AND revoked_at IS NULL AND expires_at>? AND u.disabled_at IS NULL")
            .bind(token_hash(token)).bind(Utc::now()).fetch_optional(&mut *tx).await.map_err(persistence)?.ok_or(DomainError::Unauthenticated)?;
        let id: String = row.try_get("id").map_err(persistence)?;
        let user: String = row.try_get("user_id").map_err(persistence)?;
        let expires: String = row.try_get("expires_at").map_err(persistence)?;
        sqlx::query(
            "INSERT INTO consumed_refresh_tokens(token_hash,session_id,expires_at) VALUES(?,?,?)",
        )
        .bind(token_hash(token))
        .bind(&id)
        .bind(expires)
        .execute(&mut *tx)
        .await
        .map_err(persistence)?;
        let tokens = issue(&mut tx, &user, Some(&id)).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(tokens)
    }
    pub async fn logout_mobile(&self, token: &str) -> Result<(), DomainError> {
        sqlx::query("UPDATE mobile_sessions SET revoked_at=? WHERE refresh_hash=? OR id=(SELECT session_id FROM consumed_refresh_tokens WHERE token_hash=?)")
            .bind(Utc::now())
            .bind(token_hash(token))
            .bind(token_hash(token))
            .execute(&self.pool)
            .await
            .map_err(persistence)?;
        Ok(())
    }
}
async fn consume(
    tx: &mut Transaction<'_, Sqlite>,
    email: &str,
    purpose: &str,
    code: &str,
) -> Result<bool, DomainError> {
    // Increment attempts even on a wrong code; commit by the caller on rejection.
    let changed=sqlx::query("UPDATE account_challenges SET attempts=attempts+1 WHERE email=? AND purpose=? AND attempts<5 AND expires_at>?")
        .bind(email).bind(purpose).bind(Utc::now()).execute(&mut **tx).await.map_err(persistence)?.rows_affected();
    if changed == 0 {
        return Ok(false);
    }
    let changed =
        sqlx::query("DELETE FROM account_challenges WHERE email=? AND purpose=? AND code_hash=?")
            .bind(email)
            .bind(purpose)
            .bind(token_hash(&format!("{email}:{purpose}:{code}")))
            .execute(&mut **tx)
            .await
            .map_err(persistence)?
            .rows_affected();
    Ok(changed == 1)
}

async fn write_challenge(
    tx: &mut Transaction<'_, Sqlite>,
    email: &str,
    purpose: &str,
) -> Result<String, DomainError> {
    let mut bytes = [0u8; 4];
    getrandom::fill(&mut bytes).map_err(|_| DomainError::Unavailable)?;
    let code = format!("{:08}", u32::from_le_bytes(bytes) % 100_000_000);
    sqlx::query("INSERT INTO account_challenges(email,purpose,code_hash,expires_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,created_at=excluded.created_at")
        .bind(email).bind(purpose).bind(token_hash(&format!("{email}:{purpose}:{code}"))).bind(Utc::now()+Duration::minutes(15)).bind(Utc::now()).execute(&mut **tx).await.map_err(persistence)?;
    Ok(code)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    async fn fixture() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::connect(&format!(
            "sqlite://{}",
            dir.path().join("accounts.sqlite").display()
        ))
        .await
        .unwrap();
        (dir, store)
    }
    fn input(email: &str, password: &str) -> AccountCredentials {
        AccountCredentials {
            email: email.into(),
            password: password.into(),
            timezone: "Europe/Paris".into(),
        }
    }
    #[tokio::test]
    async fn accounts_login_immediately_and_duplicate_registration_never_changes_credentials() {
        let (_dir, store) = fixture().await;
        store
            .register_account(input(" Alice@Example.fr ", "a long private password"))
            .await
            .unwrap();
        assert!(
            store
                .register_account(input("alice@example.fr", "different password here"))
                .await
                .is_err()
        );
        let first = store
            .login_account("alice@example.fr", "a long private password".into())
            .await
            .unwrap();
        assert!(
            store
                .login_account("alice@example.fr", "different password here".into())
                .await
                .is_err()
        );
        let alice = store
            .authenticate_mobile(&first.access_token)
            .await
            .unwrap();
        let next = store.refresh_mobile(&first.refresh_token).await.unwrap();
        assert!(
            store
                .authenticate_mobile(&first.access_token)
                .await
                .is_err()
        );
        assert_eq!(
            store
                .authenticate_mobile(&next.access_token)
                .await
                .unwrap()
                .user_id,
            alice.user_id
        );
        assert!(store.refresh_mobile(&first.refresh_token).await.is_err());
        assert!(store.authenticate_mobile(&next.access_token).await.is_err());
        assert!(store.refresh_mobile(&next.refresh_token).await.is_err());
        let challenges: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM account_challenges")
            .fetch_one(&store.pool)
            .await
            .unwrap();
        assert_eq!(challenges, 0);
    }
    #[tokio::test]
    async fn reset_codes_expire_limit_attempts_and_revoke_all_sessions() {
        let (_dir, store) = fixture().await;
        store
            .register_account(input("bob@example.fr", "initial long password"))
            .await
            .unwrap();
        let first = store
            .login_account("bob@example.fr", "initial long password".into())
            .await
            .unwrap();
        let second = store
            .login_account("bob@example.fr", "initial long password".into())
            .await
            .unwrap();
        assert!(
            store
                .account_challenge("unknown@example.fr", "reset")
                .await
                .unwrap()
                .is_none()
        );
        let code = store
            .account_challenge("bob@example.fr", "reset")
            .await
            .unwrap()
            .unwrap();
        for _ in 0..5 {
            assert!(
                store
                    .reset_account("bob@example.fr", "bad", "a new long password".into())
                    .await
                    .is_err()
            );
        }
        assert!(
            store
                .reset_account("bob@example.fr", &code, "a new long password".into())
                .await
                .is_err()
        );
        let code = store
            .account_challenge("bob@example.fr", "reset")
            .await
            .unwrap()
            .unwrap();
        sqlx::query("UPDATE account_challenges SET expires_at=? WHERE email=?")
            .bind(Utc::now() - Duration::seconds(1))
            .bind("bob@example.fr")
            .execute(&store.pool)
            .await
            .unwrap();
        assert!(
            store
                .reset_account("bob@example.fr", &code, "a new long password".into())
                .await
                .is_err()
        );
        let code = store
            .account_challenge("bob@example.fr", "reset")
            .await
            .unwrap()
            .unwrap();
        store
            .reset_account("bob@example.fr", &code, "a new long password".into())
            .await
            .unwrap();
        for session in [first, second] {
            assert!(
                store
                    .authenticate_mobile(&session.access_token)
                    .await
                    .is_err()
            );
            assert!(store.refresh_mobile(&session.refresh_token).await.is_err());
        }
        assert!(
            store
                .login_account("bob@example.fr", "initial long password".into())
                .await
                .is_err()
        );
        let new = store
            .login_account("bob@example.fr", "a new long password".into())
            .await
            .unwrap();
        let rotated = store.refresh_mobile(&new.refresh_token).await.unwrap();
        store.logout_mobile(&new.refresh_token).await.unwrap();
        assert!(
            store
                .authenticate_mobile(&rotated.access_token)
                .await
                .is_err()
        );
        assert!(store.refresh_mobile(&rotated.refresh_token).await.is_err());
        assert!(
            store
                .reset_account("bob@example.fr", &code, "another long password".into())
                .await
                .is_err()
        );
        assert!(store.account_budget("test", 1).await.unwrap());
        assert!(!store.account_budget("test", 1).await.unwrap());
    }
    #[tokio::test]
    async fn legacy_unverified_accounts_can_login_but_disabled_accounts_cannot() {
        let (_dir, store) = fixture().await;
        store
            .register_account(input("same@example.fr", "first long password"))
            .await
            .unwrap();
        let tokens = store
            .login_account("same@example.fr", "first long password".into())
            .await
            .unwrap();
        let actor = store
            .authenticate_mobile(&tokens.access_token)
            .await
            .unwrap();
        assert!(
            !sqlx::query_scalar::<_, bool>("SELECT is_admin FROM users WHERE id=?")
                .bind(actor.user_id.0.to_string())
                .fetch_one(&store.pool)
                .await
                .unwrap()
        );
        sqlx::query("UPDATE users SET disabled_at=? WHERE id=?")
            .bind(Utc::now())
            .bind(actor.user_id.0.to_string())
            .execute(&store.pool)
            .await
            .unwrap();
        assert!(
            store
                .authenticate_mobile(&tokens.access_token)
                .await
                .is_err()
        );
        assert!(store.refresh_mobile(&tokens.refresh_token).await.is_err());
        assert!(accounts::password("short").is_err());
        assert!(accounts::email("bad").is_err());
    }
}
