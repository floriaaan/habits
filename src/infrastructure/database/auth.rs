use super::{Store, persistence};
use crate::{
    infrastructure::security::{opaque_token, token_hash},
    modules::{
        DomainError,
        auth::{
            IdentityMode, IssuedToken, NewServiceAccount, NewToken, Principal, Scope,
            ServiceAccount, TokenMetadata,
        },
        habits::Pagination,
        users::UserId,
    },
};
use chrono::Utc;
use sqlx::{Row, Sqlite, Transaction};
use uuid::Uuid;

fn metadata(row: &sqlx::sqlite::SqliteRow) -> Result<TokenMetadata, DomainError> {
    let id: String = row.try_get("id").map_err(persistence)?;
    let user: String = row.try_get("user_id").map_err(persistence)?;
    let service: Option<String> = row.try_get("service_account_id").map_err(persistence)?;
    let scopes: String = row.try_get("scopes").map_err(persistence)?;
    Ok(TokenMetadata {
        id: id.parse().map_err(persistence)?,
        user_id: UserId(user.parse().map_err(persistence)?),
        service_account_id: service
            .map(|s| s.parse())
            .transpose()
            .map_err(persistence)?,
        scopes: serde_json::from_str(&scopes).map_err(persistence)?,
        expires_at: row.try_get("expires_at").map_err(persistence)?,
        revoked_at: row.try_get("revoked_at").map_err(persistence)?,
        created_at: row.try_get("created_at").map_err(persistence)?,
    })
}

enum AuditTarget {
    User,
    Token(Uuid),
    ServiceAccount(Uuid),
}

async fn audit(
    tx: &mut Transaction<'_, Sqlite>,
    user: UserId,
    action: &str,
    target: AuditTarget,
) -> Result<(), DomainError> {
    let (token, service) = match target {
        AuditTarget::User => (None, None),
        AuditTarget::Token(id) => (Some(id.to_string()), None),
        AuditTarget::ServiceAccount(id) => (None, Some(id.to_string())),
    };
    sqlx::query("INSERT INTO auth_audit (id, user_id, action, token_id, service_account_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string()).bind(user.0.to_string()).bind(action).bind(token).bind(service).bind(Utc::now()).execute(&mut **tx).await.map_err(persistence)?;
    Ok(())
}

async fn issue(
    tx: &mut Transaction<'_, Sqlite>,
    user: UserId,
    input: NewToken,
    previous: Option<Uuid>,
) -> Result<IssuedToken, DomainError> {
    input.validate(Utc::now())?;
    let active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND disabled_at IS NULL)",
    )
    .bind(user.0.to_string())
    .fetch_one(&mut **tx)
    .await
    .map_err(persistence)?;
    if !active {
        return Err(DomainError::NotFound);
    }
    if let Some(service) = input.service_account_id {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM service_accounts WHERE user_id = ? AND id = ? AND revoked_at IS NULL)").bind(user.0.to_string()).bind(service.to_string()).fetch_one(&mut **tx).await.map_err(persistence)?;
        if !exists {
            return Err(DomainError::NotFound);
        }
    }
    let token = opaque_token()?;
    let metadata = TokenMetadata {
        id: Uuid::new_v4(),
        user_id: user,
        service_account_id: input.service_account_id,
        scopes: input.scopes,
        expires_at: input.expires_at,
        revoked_at: None,
        created_at: Utc::now(),
    };
    sqlx::query("INSERT INTO access_tokens (id, user_id, service_account_id, token_hash, scopes, expires_at, rotated_from_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(metadata.id.to_string()).bind(user.0.to_string()).bind(metadata.service_account_id.map(|id| id.to_string())).bind(token_hash(&token)).bind(serde_json::to_string(&metadata.scopes).map_err(persistence)?).bind(metadata.expires_at).bind(previous.map(|id| id.to_string())).bind(metadata.created_at).execute(&mut **tx).await.map_err(persistence)?;
    audit(
        tx,
        user,
        if previous.is_some() {
            "token.rotate"
        } else {
            "token.create"
        },
        AuditTarget::Token(metadata.id),
    )
    .await?;
    Ok(IssuedToken { token, metadata })
}

impl Store {
    pub async fn oidc_principal(
        &self,
        issuer: &str,
        subject: &str,
        scopes: Vec<Scope>,
    ) -> Result<Principal, DomainError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        sqlx::query("INSERT INTO users (id, issuer, subject, timezone, created_at) VALUES (?, ?, ?, 'UTC', ?) ON CONFLICT(issuer, subject) DO NOTHING").bind(Uuid::new_v4().to_string()).bind(issuer).bind(subject).bind(Utc::now()).execute(&mut *tx).await.map_err(persistence)?;
        let id: Option<String> = sqlx::query_scalar(
            "SELECT id FROM users WHERE issuer = ? AND subject = ? AND disabled_at IS NULL",
        )
        .bind(issuer)
        .bind(subject)
        .fetch_optional(&mut *tx)
        .await
        .map_err(persistence)?;
        let user_id = UserId(
            id.ok_or(DomainError::Unauthenticated)?
                .parse()
                .map_err(persistence)?,
        );
        tx.commit().await.map_err(persistence)?;
        Ok(Principal {
            user_id,
            mode: IdentityMode::OidcAccessToken,
            scopes,
        })
    }
    pub async fn local_user(&self, timezone: &str) -> Result<UserId, DomainError> {
        if timezone.parse::<chrono_tz::Tz>().is_err() {
            return Err(DomainError::Validation("IANA timezone required"));
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        sqlx::query("INSERT INTO users (id, issuer, subject, timezone, created_at) VALUES (?, 'urn:habit-tracker:local', 'default', ?, ?) ON CONFLICT(issuer, subject) DO NOTHING").bind(Uuid::new_v4().to_string()).bind(timezone).bind(Utc::now()).execute(&mut *tx).await.map_err(persistence)?;
        let id: String = sqlx::query_scalar(
            "SELECT id FROM users WHERE issuer = 'urn:habit-tracker:local' AND subject = 'default'",
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(UserId(id.parse().map_err(persistence)?))
    }
    pub async fn authenticate_local_token(&self, token: &str) -> Result<Principal, DomainError> {
        let actor = self.authenticate_token(token).await?;
        let local:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND issuer = 'urn:habit-tracker:local' AND subject = 'default')").bind(actor.user_id.0.to_string()).fetch_one(&self.pool).await.map_err(persistence)?;
        if !local {
            return Err(DomainError::Unauthenticated);
        }
        Ok(actor)
    }
    pub async fn bootstrap_local(&self, timezone: &str) -> Result<IssuedToken, DomainError> {
        self.bootstrap_local_if_needed(timezone)
            .await?
            .ok_or(DomainError::Validation(
                "local administrator already bootstrapped; use token-create for local recovery",
            ))
    }

    /// Returns the one-time credential only after its hash and audit are committed.
    pub async fn bootstrap_local_if_needed(
        &self,
        timezone: &str,
    ) -> Result<Option<IssuedToken>, DomainError> {
        let user = self.local_user(timezone).await?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let admin: bool = sqlx::query_scalar("SELECT is_admin FROM users WHERE id = ?")
            .bind(user.0.to_string())
            .fetch_one(&mut *tx)
            .await
            .map_err(persistence)?;
        if admin {
            tx.commit().await.map_err(persistence)?;
            return Ok(None);
        }
        sqlx::query("UPDATE users SET is_admin = 1, timezone = ? WHERE id = ?")
            .bind(timezone)
            .bind(user.0.to_string())
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        let token = issue(
            &mut tx,
            user,
            NewToken {
                scopes: Scope::all(),
                expires_at: Utc::now() + chrono::Duration::hours(24),
                service_account_id: None,
            },
            None,
        )
        .await?;
        audit(&mut tx, user, "admin.bootstrap", AuditTarget::User).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(Some(token))
    }
    pub async fn authenticate_token(&self, token: &str) -> Result<Principal, DomainError> {
        if token.len() != 46 || !token.starts_with("ht_") {
            return Err(DomainError::Unauthenticated);
        }
        let row = sqlx::query("SELECT t.* FROM access_tokens t JOIN users u ON u.id = t.user_id LEFT JOIN service_accounts s ON s.user_id = t.user_id AND s.id = t.service_account_id WHERE t.token_hash = ? AND t.revoked_at IS NULL AND u.disabled_at IS NULL AND (t.service_account_id IS NULL OR (s.id IS NOT NULL AND s.revoked_at IS NULL))")
            .bind(token_hash(token)).fetch_optional(&self.pool).await.map_err(persistence)?.ok_or(DomainError::Unauthenticated)?;
        let token = metadata(&row)?;
        if token.expires_at <= Utc::now() {
            return Err(DomainError::Unauthenticated);
        }
        Ok(Principal {
            user_id: token.user_id,
            mode: if token.service_account_id.is_some() {
                IdentityMode::ServiceAccount
            } else {
                IdentityMode::PersonalAccessToken
            },
            scopes: token.scopes,
        })
    }

    #[tracing::instrument(skip_all, fields(operation = "create_user"), err)]
    pub async fn create_user(
        &self,
        issuer: &str,
        subject: &str,
        timezone: &str,
        admin: bool,
    ) -> Result<UserId, DomainError> {
        tracing::info!("create user started");
        if issuer.is_empty()
            || issuer.len() > 2048
            || subject.is_empty()
            || subject.len() > 255
            || issuer.chars().any(char::is_control)
            || subject.chars().any(char::is_control)
            || timezone.parse::<chrono_tz::Tz>().is_err()
        {
            return Err(DomainError::Validation(
                "issuer, subject and IANA timezone are required",
            ));
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        if admin {
            let exists: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE is_admin = 1)")
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(persistence)?;
            if exists {
                return Err(DomainError::Validation(
                    "administrator already bootstrapped",
                ));
            }
        }
        let id = UserId(Uuid::new_v4());
        sqlx::query("INSERT INTO users (id, issuer, subject, timezone, created_at, is_admin) VALUES (?, ?, ?, ?, ?, ?)").bind(id.0.to_string()).bind(issuer).bind(subject).bind(timezone).bind(Utc::now()).bind(admin).execute(&mut *tx).await.map_err(persistence)?;
        audit(
            &mut tx,
            id,
            if admin {
                "admin.bootstrap"
            } else {
                "user.create"
            },
            AuditTarget::User,
        )
        .await?;
        tx.commit().await.map_err(persistence)?;
        Ok(id)
    }

    /// Local CLI only. HTTP must use create_token, which prevents scope escalation.
    #[tracing::instrument(skip_all, fields(operation = "issue_local_token"), err)]
    pub async fn issue_local_token(
        &self,
        user: UserId,
        input: NewToken,
    ) -> Result<IssuedToken, DomainError> {
        tracing::info!("issue local token started");
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let token = issue(&mut tx, user, input, None).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(token)
    }
    #[tracing::instrument(skip_all, fields(operation = "create_token"), err)]
    pub async fn create_token(
        &self,
        actor: &Principal,
        input: NewToken,
    ) -> Result<IssuedToken, DomainError> {
        tracing::info!("create token started");
        input.authorize(actor)?;
        // A service account may use its token but cannot mint personal identities.
        if actor.mode == IdentityMode::ServiceAccount {
            return Err(DomainError::Forbidden);
        }
        self.issue_local_token(actor.user_id, input).await
    }
    #[tracing::instrument(skip_all, fields(operation = "list_tokens"), err)]
    pub async fn list_tokens(
        &self,
        actor: &Principal,
        page: Pagination,
    ) -> Result<Vec<TokenMetadata>, DomainError> {
        tracing::info!("list tokens started");
        actor.require(Scope::TokensManage)?;
        let page = page.validate()?;
        let rows = sqlx::query("SELECT * FROM access_tokens WHERE user_id = ? ORDER BY created_at, id LIMIT ? OFFSET ?").bind(actor.user_id.0.to_string()).bind(page.limit).bind(page.offset).fetch_all(&self.pool).await.map_err(persistence)?;
        rows.iter().map(metadata).collect()
    }
    #[tracing::instrument(skip_all, fields(operation = "revoke_token"), err)]
    pub async fn revoke_token(&self, actor: &Principal, id: Uuid) -> Result<(), DomainError> {
        tracing::info!("revoke token started");
        actor.require(Scope::TokensManage)?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM access_tokens WHERE user_id = ? AND id = ?)",
        )
        .bind(actor.user_id.0.to_string())
        .bind(id.to_string())
        .fetch_one(&mut *tx)
        .await
        .map_err(persistence)?;
        if !exists {
            return Err(DomainError::NotFound);
        }
        let changed = sqlx::query("UPDATE access_tokens SET revoked_at = ? WHERE user_id = ? AND id = ? AND revoked_at IS NULL").bind(Utc::now()).bind(actor.user_id.0.to_string()).bind(id.to_string()).execute(&mut *tx).await.map_err(persistence)?;
        if changed.rows_affected() > 0 {
            audit(
                &mut tx,
                actor.user_id,
                "token.revoke",
                AuditTarget::Token(id),
            )
            .await?;
        }
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    #[tracing::instrument(skip_all, fields(operation = "rotate_token"), err)]
    pub async fn rotate_token(
        &self,
        actor: &Principal,
        id: Uuid,
    ) -> Result<IssuedToken, DomainError> {
        tracing::info!("rotate token started");
        actor.require(Scope::TokensManage)?;
        if actor.mode == IdentityMode::ServiceAccount {
            return Err(DomainError::Forbidden);
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let row = sqlx::query(
            "SELECT * FROM access_tokens WHERE user_id = ? AND id = ? AND revoked_at IS NULL",
        )
        .bind(actor.user_id.0.to_string())
        .bind(id.to_string())
        .fetch_optional(&mut *tx)
        .await
        .map_err(persistence)?
        .ok_or(DomainError::NotFound)?;
        let old = metadata(&row)?;
        let input = NewToken {
            scopes: old.scopes,
            expires_at: old.expires_at,
            service_account_id: old.service_account_id,
        };
        input.authorize(actor)?;
        sqlx::query("UPDATE access_tokens SET revoked_at = ? WHERE user_id = ? AND id = ?")
            .bind(Utc::now())
            .bind(actor.user_id.0.to_string())
            .bind(id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        let token = issue(&mut tx, actor.user_id, input, Some(id)).await?;
        audit(
            &mut tx,
            actor.user_id,
            "token.revoke",
            AuditTarget::Token(id),
        )
        .await?;
        tx.commit().await.map_err(persistence)?;
        Ok(token)
    }
    #[tracing::instrument(skip_all, fields(operation = "create_service_account"), err)]
    pub async fn create_service_account(
        &self,
        actor: &Principal,
        input: NewServiceAccount,
    ) -> Result<ServiceAccount, DomainError> {
        tracing::info!("create service account started");
        actor.require(Scope::TokensManage)?;
        input.validate()?;
        if actor.mode == IdentityMode::ServiceAccount {
            return Err(DomainError::Forbidden);
        }
        let account = ServiceAccount {
            id: Uuid::new_v4(),
            name: input.name.trim().into(),
            created_at: Utc::now(),
            revoked_at: None,
        };
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        sqlx::query(
            "INSERT INTO service_accounts (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(account.id.to_string())
        .bind(actor.user_id.0.to_string())
        .bind(&account.name)
        .bind(account.created_at)
        .execute(&mut *tx)
        .await
        .map_err(persistence)?;
        audit(
            &mut tx,
            actor.user_id,
            "service_account.create",
            AuditTarget::ServiceAccount(account.id),
        )
        .await?;
        tx.commit().await.map_err(persistence)?;
        Ok(account)
    }
    #[tracing::instrument(skip_all, fields(operation = "revoke_service_account"), err)]
    pub async fn revoke_service_account(
        &self,
        actor: &Principal,
        id: Uuid,
    ) -> Result<(), DomainError> {
        tracing::info!("revoke service account started");
        actor.require(Scope::TokensManage)?;
        if actor.mode == IdentityMode::ServiceAccount {
            return Err(DomainError::Forbidden);
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let result = sqlx::query("UPDATE service_accounts SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ? AND id = ?").bind(Utc::now()).bind(actor.user_id.0.to_string()).bind(id.to_string()).execute(&mut *tx).await.map_err(persistence)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        sqlx::query("UPDATE access_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ? AND service_account_id = ?").bind(Utc::now()).bind(actor.user_id.0.to_string()).bind(id.to_string()).execute(&mut *tx).await.map_err(persistence)?;
        audit(
            &mut tx,
            actor.user_id,
            "service_account.revoke",
            AuditTarget::ServiceAccount(id),
        )
        .await?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use crate::infrastructure::database::tests::{Fixture, fixture_principal};
    #[tokio::test]
    async fn local_bootstrap_is_atomic_one_time_and_never_recovers_tokens_automatically() {
        let f = Fixture::new().await;
        let (first, concurrent) = tokio::join!(
            f.store.bootstrap_local_if_needed("Europe/Paris"),
            f.store.bootstrap_local_if_needed("Europe/Paris"),
        );
        let issued: Vec<_> = [first.unwrap(), concurrent.unwrap()]
            .into_iter()
            .flatten()
            .collect();
        assert_eq!(issued.len(), 1);
        let issued = &issued[0];
        let actor = f
            .store
            .authenticate_local_token(&issued.token)
            .await
            .unwrap();
        assert_eq!(actor.scopes, Scope::all());
        assert!(issued.metadata.expires_at > Utc::now());
        assert!(issued.metadata.expires_at <= Utc::now() + chrono::Duration::hours(24));
        let timezone: String = sqlx::query_scalar("SELECT timezone FROM users WHERE id = ?")
            .bind(actor.user_id.0.to_string())
            .fetch_one(&f.store.pool)
            .await
            .unwrap();
        assert_eq!(timezone, "Europe/Paris");
        assert!(f.store.bootstrap_local("UTC").await.is_err());
        let hash: Vec<u8> = sqlx::query_scalar("SELECT token_hash FROM access_tokens WHERE id = ?")
            .bind(issued.metadata.id.to_string())
            .fetch_one(&f.store.pool)
            .await
            .unwrap();
        assert_eq!(hash, token_hash(&issued.token));
        sqlx::query("UPDATE access_tokens SET expires_at = ? WHERE id = ?")
            .bind(Utc::now() - chrono::Duration::seconds(1))
            .bind(issued.metadata.id.to_string())
            .execute(&f.store.pool)
            .await
            .unwrap();
        assert!(
            f.store
                .bootstrap_local_if_needed("UTC")
                .await
                .unwrap()
                .is_none()
        );
        f.store
            .revoke_token(&actor, issued.metadata.id)
            .await
            .unwrap();
        assert!(
            f.store
                .bootstrap_local_if_needed("UTC")
                .await
                .unwrap()
                .is_none()
        );
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM access_tokens WHERE user_id = ?")
            .bind(actor.user_id.0.to_string())
            .fetch_one(&f.store.pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
        let bootstraps: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM auth_audit WHERE user_id = ? AND action = 'admin.bootstrap'",
        )
        .bind(actor.user_id.0.to_string())
        .fetch_one(&f.store.pool)
        .await
        .unwrap();
        assert_eq!(bootstraps, 1);
    }
    #[tokio::test]
    async fn tokens_are_hashed_scoped_expiring_rotatable_and_tenant_bound() {
        let f = Fixture::new().await;
        let mut actor = fixture_principal(1);
        actor.scopes = Scope::all();
        let issued = f
            .store
            .create_token(
                &actor,
                NewToken {
                    scopes: vec![Scope::HabitsRead],
                    expires_at: Utc::now() + chrono::Duration::hours(1),
                    service_account_id: None,
                },
            )
            .await
            .unwrap();
        let principal = f.store.authenticate_token(&issued.token).await.unwrap();
        assert_eq!(principal.user_id, actor.user_id);
        assert_eq!(principal.scopes, vec![Scope::HabitsRead]);
        assert!(matches!(
            f.store
                .create_token(
                    &principal,
                    NewToken {
                        scopes: Scope::all(),
                        expires_at: Utc::now() + chrono::Duration::hours(1),
                        service_account_id: None
                    }
                )
                .await,
            Err(DomainError::Forbidden)
        ));
        let hash: Vec<u8> = sqlx::query_scalar("SELECT token_hash FROM access_tokens WHERE id = ?")
            .bind(issued.metadata.id.to_string())
            .fetch_one(&f.store.pool)
            .await
            .unwrap();
        assert_eq!(hash.len(), 32);
        assert_ne!(hash, issued.token.as_bytes());
        let mut bob = fixture_principal(2);
        bob.scopes = Scope::all();
        assert!(matches!(
            f.store.revoke_token(&bob, issued.metadata.id).await,
            Err(DomainError::NotFound)
        ));
        let rotated = f
            .store
            .rotate_token(&actor, issued.metadata.id)
            .await
            .unwrap();
        assert!(f.store.authenticate_token(&issued.token).await.is_err());
        assert!(f.store.authenticate_token(&rotated.token).await.is_ok());
        f.store
            .revoke_token(&actor, rotated.metadata.id)
            .await
            .unwrap();
        assert!(f.store.authenticate_token(&rotated.token).await.is_err());
        let expires = f
            .store
            .create_token(
                &actor,
                NewToken {
                    scopes: vec![Scope::HabitsRead],
                    expires_at: Utc::now() + chrono::Duration::hours(1),
                    service_account_id: None,
                },
            )
            .await
            .unwrap();
        sqlx::query("UPDATE access_tokens SET expires_at = ? WHERE id = ?")
            .bind(Utc::now() - chrono::Duration::seconds(1))
            .bind(expires.metadata.id.to_string())
            .execute(&f.store.pool)
            .await
            .unwrap();
        assert!(f.store.authenticate_token(&expires.token).await.is_err());
        let audits: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM auth_audit")
            .fetch_one(&f.store.pool)
            .await
            .unwrap();
        assert!(audits >= 5);
    }
    #[tokio::test]
    async fn service_accounts_are_revocable_and_cannot_cross_tenants() {
        let f = Fixture::new().await;
        let mut actor = fixture_principal(1);
        actor.scopes = Scope::all();
        let account = f
            .store
            .create_service_account(
                &actor,
                NewServiceAccount {
                    name: "HA test".into(),
                },
            )
            .await
            .unwrap();
        let token = f
            .store
            .create_token(
                &actor,
                NewToken {
                    scopes: vec![Scope::HabitsRead],
                    expires_at: Utc::now() + chrono::Duration::hours(1),
                    service_account_id: Some(account.id),
                },
            )
            .await
            .unwrap();
        assert_eq!(
            f.store.authenticate_token(&token.token).await.unwrap().mode,
            IdentityMode::ServiceAccount
        );
        let mut bob = fixture_principal(2);
        bob.scopes = Scope::all();
        assert!(
            f.store
                .create_token(
                    &bob,
                    NewToken {
                        scopes: vec![Scope::HabitsRead],
                        expires_at: Utc::now() + chrono::Duration::hours(1),
                        service_account_id: Some(account.id)
                    }
                )
                .await
                .is_err()
        );
        f.store
            .revoke_service_account(&actor, account.id)
            .await
            .unwrap();
        assert!(f.store.authenticate_token(&token.token).await.is_err());
    }
}
