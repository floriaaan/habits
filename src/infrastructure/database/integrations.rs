use super::{Store, entry_from_row, owned_habit, persistence, tracking};
use crate::{
    infrastructure::{
        integrations::{Credentials, UpstreamFailure},
        security::{
            cipher::{Encrypted, SecretCipher},
            opaque_token, token_hash,
        },
    },
    modules::{
        DomainError,
        auth::{Principal, Scope},
        entries::{CheckInPayload, NewEntry},
        habits::Unit,
        integrations::{
            IntegrationInfo, Provider,
            strava::{Activity, Mapping},
        },
        users::UserId,
    },
};
use chrono::{DateTime, Duration, Utc};
use sqlx::{Row, Sqlite, Transaction};
use uuid::Uuid;
use zeroize::Zeroizing;

async fn source_rows(
    tx: &mut Transaction<'_, Sqlite>,
    user: UserId,
    integration: Uuid,
    object: Option<i64>,
) -> Result<Vec<sqlx::sqlite::SqliteRow>, DomainError> {
    sqlx::query("SELECT e.* FROM source_identifiers s JOIN entries e ON e.user_id = s.user_id AND e.id = s.entry_id WHERE s.user_id = ? AND s.integration_id = ? AND (? IS NULL OR s.provider_object_id = ?)").bind(user.0.to_string()).bind(integration.to_string()).bind(object.map(|v|v.to_string())).bind(object.map(|v|v.to_string())).fetch_all(&mut **tx).await.map_err(persistence)
}
async fn purge_entries(
    tx: &mut Transaction<'_, Sqlite>,
    user: UserId,
    rows: Vec<sqlx::sqlite::SqliteRow>,
    cause: Uuid,
) -> Result<(), DomainError> {
    for row in rows {
        let entry = entry_from_row(&row)?;
        sqlx::query("UPDATE domain_events SET payload = '{}', kind = 'source.purged' WHERE user_id = ? AND id IN (SELECT id FROM entry_events WHERE user_id = ? AND entry_id = ?)").bind(user.0.to_string()).bind(user.0.to_string()).bind(entry.id.to_string()).execute(&mut **tx).await.map_err(persistence)?;
        sqlx::query("DELETE FROM entries WHERE user_id = ? AND id = ?")
            .bind(user.0.to_string())
            .bind(entry.id.to_string())
            .execute(&mut **tx)
            .await
            .map_err(persistence)?;
        let event = tracking::append_event(
            tx,
            user,
            entry.habit_id,
            &format!("purge:{cause}:{}", entry.id),
            "source.purged",
            "{}",
        )
        .await?;
        tracking::rebuild(tx, user, entry.habit_id, event).await?;
    }
    Ok(())
}

impl Store {
    pub async fn integration_info(
        &self,
        actor: &Principal,
    ) -> Result<Vec<IntegrationInfo>, DomainError> {
        actor.require(Scope::IntegrationsManage)?;
        let rows = sqlx::query(
            "SELECT id, provider, revoked_at FROM integrations WHERE user_id = ? ORDER BY provider",
        )
        .bind(actor.user_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(persistence)?;
        let mut result = Vec::new();
        for row in rows {
            let id: String = row.try_get("id").map_err(persistence)?;
            let provider: String = row.try_get("provider").map_err(persistence)?;
            let revoked: Option<String> = row.try_get("revoked_at").map_err(persistence)?;
            result.push(IntegrationInfo {
                id: id.parse().map_err(persistence)?,
                provider: match provider.as_str() {
                    "strava" => Provider::Strava,
                    "home_assistant" => Provider::HomeAssistant,
                    _ => return Err(DomainError::Unavailable),
                },
                connected: revoked.is_none(),
            });
        }
        Ok(result)
    }
    pub async fn integration_id(&self, user: UserId, provider: &str) -> Result<Uuid, DomainError> {
        let id: Option<String> = sqlx::query_scalar(
            "SELECT id FROM integrations WHERE user_id = ? AND provider = ? AND revoked_at IS NULL",
        )
        .bind(user.0.to_string())
        .bind(provider)
        .fetch_optional(&self.pool)
        .await
        .map_err(persistence)?;
        id.ok_or(DomainError::NotFound)?
            .parse()
            .map_err(persistence)
    }
    pub async fn connect_integration(
        &self,
        user: UserId,
        provider: &str,
        subject: &str,
        credentials: &Credentials,
        cipher: &SecretCipher,
        capacity: u32,
    ) -> Result<Uuid, DomainError> {
        let encrypted = cipher.encrypt(
            user,
            provider,
            &Zeroizing::new(serde_json::to_vec(credentials).map_err(persistence)?),
        )?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let foreign:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM integrations WHERE provider = ? AND provider_subject = ? AND user_id != ?)").bind(provider).bind(subject).bind(user.0.to_string()).fetch_one(&mut *tx).await.map_err(persistence)?;
        if foreign {
            return Err(DomainError::Conflict);
        }
        let old: Option<String> =
            sqlx::query_scalar("SELECT id FROM integrations WHERE user_id = ? AND provider = ?")
                .bind(user.0.to_string())
                .bind(provider)
                .fetch_optional(&mut *tx)
                .await
                .map_err(persistence)?;
        if provider == "strava" {
            let old_subject:Option<String>=sqlx::query_scalar("SELECT provider_subject FROM integrations WHERE user_id = ? AND provider = 'strava' AND revoked_at IS NULL").bind(user.0.to_string()).fetch_optional(&mut *tx).await.map_err(persistence)?;
            if old_subject
                .as_deref()
                .is_some_and(|previous| previous != subject)
            {
                return Err(DomainError::Validation(
                    "disconnect the previous athlete before connecting another",
                ));
            }
            let active:i64=sqlx::query_scalar("SELECT COUNT(*) FROM integrations WHERE provider = 'strava' AND revoked_at IS NULL AND user_id != ?").bind(user.0.to_string()).fetch_one(&mut *tx).await.map_err(persistence)?;
            if active >= i64::from(capacity) {
                return Err(DomainError::Validation(
                    "approved Strava athlete capacity reached",
                ));
            }
        }
        let id = old
            .map(|id| id.parse())
            .transpose()
            .map_err(persistence)?
            .unwrap_or_else(Uuid::new_v4);
        sqlx::query("INSERT INTO integrations (id, user_id, provider, provider_subject, secret_ciphertext, secret_nonce, encryption_key_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, provider) DO UPDATE SET provider_subject = excluded.provider_subject, secret_ciphertext = excluded.secret_ciphertext, secret_nonce = excluded.secret_nonce, encryption_key_id = excluded.encryption_key_id, revoked_at = NULL, credential_revision = integrations.credential_revision + 1").bind(id.to_string()).bind(user.0.to_string()).bind(provider).bind(subject).bind(encrypted.ciphertext).bind(encrypted.nonce).bind(encrypted.key_id).bind(Utc::now()).execute(&mut *tx).await.map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(id)
    }
    pub async fn credentials(
        &self,
        user: UserId,
        id: Uuid,
        provider: &str,
        cipher: &SecretCipher,
    ) -> Result<Credentials, DomainError> {
        let row=sqlx::query("SELECT secret_ciphertext, secret_nonce, encryption_key_id, credential_revision FROM integrations WHERE user_id = ? AND id = ? AND provider = ? AND revoked_at IS NULL").bind(user.0.to_string()).bind(id.to_string()).bind(provider).fetch_optional(&self.pool).await.map_err(persistence)?.ok_or(DomainError::NotFound)?;
        let bytes = cipher.decrypt(
            user,
            provider,
            Encrypted {
                ciphertext: row.try_get("secret_ciphertext").map_err(persistence)?,
                nonce: row.try_get("secret_nonce").map_err(persistence)?,
                key_id: row.try_get("encryption_key_id").map_err(persistence)?,
            },
        )?;
        let mut credentials: Credentials = serde_json::from_slice(&bytes).map_err(persistence)?;
        credentials.revision = row.try_get("credential_revision").map_err(persistence)?;
        Ok(credentials)
    }
    pub async fn replace_credentials(
        &self,
        user: UserId,
        id: Uuid,
        provider: &str,
        credentials: &Credentials,
        cipher: &SecretCipher,
    ) -> Result<(), DomainError> {
        let encrypted = cipher.encrypt(
            user,
            provider,
            &Zeroizing::new(serde_json::to_vec(credentials).map_err(persistence)?),
        )?;
        let result=sqlx::query("UPDATE integrations SET secret_ciphertext = ?, secret_nonce = ?, encryption_key_id = ?, credential_revision = credential_revision + 1 WHERE user_id = ? AND id = ? AND provider = ? AND revoked_at IS NULL AND credential_revision = ?").bind(encrypted.ciphertext).bind(encrypted.nonce).bind(encrypted.key_id).bind(user.0.to_string()).bind(id.to_string()).bind(provider).bind(credentials.revision).execute(&self.pool).await.map_err(persistence)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        Ok(())
    }
    pub async fn disconnect_integration(&self, user: UserId, id: Uuid) -> Result<(), DomainError> {
        self.disconnect_integration_at_revision(user, id, None)
            .await
    }
    pub async fn disconnect_integration_at_revision(
        &self,
        user: UserId,
        id: Uuid,
        expected: Option<i64>,
    ) -> Result<(), DomainError> {
        self.disconnect_inner(user, id, expected, None).await
    }
    pub async fn disconnect_for_job(
        &self,
        job: &crate::infrastructure::jobs::LeasedJob,
        expected: i64,
    ) -> Result<(), DomainError> {
        self.disconnect_inner(job.user_id, job.integration_id, Some(expected), Some(job))
            .await
    }
    async fn disconnect_inner(
        &self,
        user: UserId,
        id: Uuid,
        expected: Option<i64>,
        job: Option<&crate::infrastructure::jobs::LeasedJob>,
    ) -> Result<(), DomainError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        if let Some(job) = job {
            super::jobs::fence(&mut tx, job).await?;
        }
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM integrations WHERE user_id = ? AND id = ? AND (? IS NULL OR credential_revision = ?))",
        )
        .bind(user.0.to_string())
        .bind(id.to_string())
        .bind(expected).bind(expected)
        .fetch_one(&mut *tx)
        .await
        .map_err(persistence)?;
        if !exists {
            if expected.is_some() {
                return Ok(());
            }
            return Err(DomainError::NotFound);
        }
        let rows = source_rows(&mut tx, user, id, None).await?;
        purge_entries(&mut tx, user, rows, Uuid::new_v4()).await?;
        sqlx::query("UPDATE integrations SET revoked_at = COALESCE(revoked_at, ?), secret_ciphertext = NULL, secret_nonce = NULL, encryption_key_id = NULL, provider_subject = ? WHERE user_id = ? AND id = ?").bind(Utc::now()).bind(format!("revoked:{id}")).bind(user.0.to_string()).bind(id.to_string()).execute(&mut *tx).await.map_err(persistence)?;
        sqlx::query("DELETE FROM jobs WHERE user_id = ? AND integration_id = ?")
            .bind(user.0.to_string())
            .bind(id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        sqlx::query("DELETE FROM strava_mappings WHERE user_id = ? AND integration_id = ?")
            .bind(user.0.to_string())
            .bind(id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    pub async fn oauth_state(&self, actor: &Principal) -> Result<String, DomainError> {
        actor.require(Scope::IntegrationsManage)?;
        let state = opaque_token()?;
        let now = Utc::now();
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        sqlx::query("DELETE FROM oauth_states WHERE expires_at <= ?")
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(persistence)?;
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM oauth_states WHERE user_id = ?")
            .bind(actor.user_id.0.to_string())
            .fetch_one(&mut *tx)
            .await
            .map_err(persistence)?;
        if count >= 20 {
            return Err(DomainError::Validation("too many pending OAuth requests"));
        }
        sqlx::query("INSERT INTO oauth_states (state_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(token_hash(&state)).bind(actor.user_id.0.to_string()).bind(now+Duration::minutes(10)).bind(now).execute(&mut *tx).await.map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(state)
    }
    pub async fn consume_oauth_state(&self, state: &str) -> Result<UserId, DomainError> {
        if state.len() != 46 {
            return Err(DomainError::Unauthenticated);
        }
        let user: Option<String> = sqlx::query_scalar(
            "DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING user_id",
        )
        .bind(token_hash(state))
        .bind(Utc::now())
        .fetch_optional(&self.pool)
        .await
        .map_err(persistence)?;
        Ok(UserId(
            user.ok_or(DomainError::Unauthenticated)?
                .parse()
                .map_err(persistence)?,
        ))
    }
    pub async fn set_strava_mapping(
        &self,
        actor: &Principal,
        mapping: Mapping,
    ) -> Result<(), DomainError> {
        actor.require(Scope::IntegrationsManage)?;
        actor.require(Scope::HabitsWrite)?;
        let id = self.integration_id(actor.user_id, "strava").await?;
        let habit = self.get_habit(actor, mapping.habit_id).await?;
        let unit = match mapping.metric {
            crate::modules::integrations::strava::Metric::Distance => Unit::Meters,
            crate::modules::integrations::strava::Metric::MovingTime => Unit::Seconds,
            crate::modules::integrations::strava::Metric::Count => Unit::Count,
        };
        if habit.definition.unit != unit {
            return Err(DomainError::Validation(
                "Strava metric does not match habit unit",
            ));
        }
        sqlx::query("INSERT INTO strava_mappings (user_id, integration_id, sport, habit_id, metric) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, integration_id, sport) DO UPDATE SET habit_id = excluded.habit_id, metric = excluded.metric").bind(actor.user_id.0.to_string()).bind(id.to_string()).bind(mapping.sport.as_str()).bind(mapping.habit_id.to_string()).bind(mapping.metric.as_str()).execute(&self.pool).await.map_err(persistence)?;
        Ok(())
    }
    pub async fn webhook_integration(&self, athlete: i64) -> Result<(UserId, Uuid), DomainError> {
        let row=sqlx::query("SELECT id, user_id FROM integrations WHERE provider = 'strava' AND provider_subject = ? AND revoked_at IS NULL").bind(athlete.to_string()).fetch_optional(&self.pool).await.map_err(persistence)?.ok_or(DomainError::NotFound)?;
        let id: String = row.try_get("id").map_err(persistence)?;
        let user: String = row.try_get("user_id").map_err(persistence)?;
        Ok((
            UserId(user.parse().map_err(persistence)?),
            id.parse().map_err(persistence)?,
        ))
    }
    pub async fn purge_source(
        &self,
        user: UserId,
        integration: Uuid,
        object: i64,
        cause: Uuid,
    ) -> Result<(), DomainError> {
        self.purge_source_inner(user, integration, object, cause, None)
            .await
    }
    pub async fn purge_source_for_job(
        &self,
        job: &crate::infrastructure::jobs::LeasedJob,
        object: i64,
    ) -> Result<(), DomainError> {
        self.purge_source_inner(job.user_id, job.integration_id, object, job.id, Some(job))
            .await
    }
    async fn purge_source_inner(
        &self,
        user: UserId,
        integration: Uuid,
        object: i64,
        cause: Uuid,
        job: Option<&crate::infrastructure::jobs::LeasedJob>,
    ) -> Result<(), DomainError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        if let Some(job) = job {
            super::jobs::fence(&mut tx, job).await?;
        }
        let rows = source_rows(&mut tx, user, integration, Some(object)).await?;
        purge_entries(&mut tx, user, rows, cause).await?;
        sqlx::query("UPDATE jobs SET payload = '{}', state = 'succeeded', lease_owner = NULL, lease_until = NULL WHERE user_id = ? AND integration_id = ? AND kind = 'strava.activity' AND json_extract(payload, '$.object_id') = ?").bind(user.0.to_string()).bind(integration.to_string()).bind(object).execute(&mut *tx).await.map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    pub async fn reconcile_activity(
        &self,
        user: UserId,
        integration: Uuid,
        activity: &Activity,
        cause: Uuid,
    ) -> Result<(), DomainError> {
        self.reconcile_inner(user, integration, activity, cause, None)
            .await
    }
    pub async fn reconcile_job_activity(
        &self,
        job: &crate::infrastructure::jobs::LeasedJob,
        activity: &Activity,
    ) -> Result<(), DomainError> {
        self.reconcile_inner(job.user_id, job.integration_id, activity, job.id, Some(job))
            .await
    }
    async fn reconcile_inner(
        &self,
        user: UserId,
        integration: Uuid,
        activity: &Activity,
        cause: Uuid,
        job: Option<&crate::infrastructure::jobs::LeasedJob>,
    ) -> Result<(), DomainError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        if let Some(job) = job {
            super::jobs::fence(&mut tx, job).await?;
        }
        let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM integrations WHERE user_id = ? AND id = ? AND provider = 'strava' AND provider_subject = ? AND revoked_at IS NULL)").bind(user.0.to_string()).bind(integration.to_string()).bind(activity.athlete.id.to_string()).fetch_one(&mut *tx).await.map_err(persistence)?;
        if !valid {
            return Err(DomainError::NotFound);
        }
        let previous = source_rows(&mut tx, user, integration, Some(activity.id)).await?;
        let sport = match activity.sport_type.as_str() {
            "Run" | "TrailRun" | "VirtualRun" => "Run",
            "Swim" => "Swim",
            _ => "unsupported",
        };
        let mapping=sqlx::query("SELECT habit_id, metric FROM strava_mappings WHERE user_id = ? AND integration_id = ? AND sport = ?").bind(user.0.to_string()).bind(integration.to_string()).bind(sport).fetch_optional(&mut *tx).await.map_err(persistence)?;
        let mut desired = None;
        if let Some(mapping) = mapping {
            let habit_id: String = mapping.try_get("habit_id").map_err(persistence)?;
            let habit_id: Uuid = habit_id.parse().map_err(persistence)?;
            let metric: String = mapping.try_get("metric").map_err(persistence)?;
            let mut habit = owned_habit(&mut tx, user, habit_id).await?;
            if habit.archived_at.is_some() && previous.is_empty() {
                tx.commit().await.map_err(persistence)?;
                return Ok(());
            }
            let timezone = habit
                .definition
                .timezone
                .parse::<chrono_tz::Tz>()
                .map_err(persistence)?;
            tracking::apply_version(
                &mut tx,
                &mut habit,
                activity.start_date.with_timezone(&timezone).date_naive(),
            )
            .await?;
            let input = NewEntry {
                occurred_at: activity.start_date,
                value: match metric.as_str() {
                    "distance" => activity.distance,
                    "moving_time" => activity.moving_time,
                    "count" => 1.0,
                    _ => return Err(DomainError::Unavailable),
                },
            };
            if input.validate(Utc::now()).is_ok()
                && habit
                    .archived_at
                    .is_none_or(|archived| input.occurred_at < archived)
                && let Ok(date) = input.eligible_date(&habit)
            {
                let rest:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM schedule_exceptions WHERE user_id = ? AND habit_id = ? AND local_date = ?)").bind(user.0.to_string()).bind(habit_id.to_string()).bind(date).fetch_one(&mut *tx).await.map_err(persistence)?;
                if !rest {
                    desired = Some((habit_id, input, date));
                }
            }
        }
        if desired.is_none()
            || previous
                .first()
                .map(entry_from_row)
                .transpose()?
                .is_some_and(|e| {
                    desired
                        .as_ref()
                        .is_some_and(|(habit, _, _)| *habit != e.habit_id)
                })
        {
            purge_entries(&mut tx, user, previous, cause).await?;
            if desired.is_none() {
                tx.commit().await.map_err(persistence)?;
                return Ok(());
            }
        }
        let Some((habit, input, date)) = desired else {
            return Err(DomainError::Unavailable);
        };
        let previous = source_rows(&mut tx, user, integration, Some(activity.id)).await?;
        if let Some(row) = previous.first() {
            let entry = entry_from_row(row)?;
            if entry.occurred_at == input.occurred_at && entry.value == input.value {
                tx.commit().await.map_err(persistence)?;
                return Ok(());
            }
        }
        let old = previous.first().map(entry_from_row).transpose()?;
        let id = old.as_ref().map(|e| e.id).unwrap_or_else(Uuid::new_v4);
        let now = Utc::now();
        let payload = serde_json::to_string(&CheckInPayload {
            habit_id: habit,
            entry: input.clone(),
        })
        .map_err(persistence)?;
        let revision: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM entry_events WHERE user_id = ? AND entry_id = ?",
        )
        .bind(user.0.to_string())
        .bind(id.to_string())
        .fetch_one(&mut *tx)
        .await
        .map_err(persistence)?;
        let key = format!("source:{cause}:{id}:{revision}");
        let operation = if old.is_some() { "correct" } else { "create" };
        let event = tracking::append_event(
            &mut tx,
            user,
            habit,
            &key,
            if old.is_some() {
                "entry.correct"
            } else {
                "entry.create"
            },
            &payload,
        )
        .await?;
        sqlx::query("INSERT INTO entries (id, user_id, habit_id, occurred_at, local_date, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET occurred_at = excluded.occurred_at, local_date = excluded.local_date, value = excluded.value, cancelled_at = NULL").bind(id.to_string()).bind(user.0.to_string()).bind(habit.to_string()).bind(input.occurred_at).bind(date).bind(input.value).bind(now).execute(&mut *tx).await.map_err(persistence)?;
        sqlx::query("INSERT INTO entry_events (id, user_id, entry_id, idempotency_key, operation, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(event.to_string()).bind(user.0.to_string()).bind(id.to_string()).bind(key).bind(operation).bind(payload).bind(now).execute(&mut *tx).await.map_err(persistence)?;
        sqlx::query("INSERT INTO source_identifiers (id, user_id, integration_id, entry_id, provider_object_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(integration_id, provider_object_id) DO UPDATE SET entry_id = excluded.entry_id").bind(Uuid::new_v4().to_string()).bind(user.0.to_string()).bind(integration.to_string()).bind(id.to_string()).bind(activity.id.to_string()).execute(&mut *tx).await.map_err(persistence)?;
        tracking::rebuild(&mut tx, user, habit, event).await?;
        tx.commit().await.map_err(persistence)?;
        Ok(())
    }
    pub async fn reserve_strava_request(&self) -> Result<(), UpstreamFailure> {
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(|_| UpstreamFailure::temporary())?;
        let now = Utc::now();
        let cooldown: Option<DateTime<Utc>> = sqlx::query_scalar(
            "SELECT available_at FROM provider_cooldowns WHERE provider = 'strava'",
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| UpstreamFailure::temporary())?;
        if let Some(until) = cooldown.filter(|until| *until > now) {
            return Err(UpstreamFailure {
                retry_after: Some(until),
                ..UpstreamFailure::temporary()
            });
        }
        for (name, duration, maximum) in [("strava.short", 900, 100), ("strava.daily", 86400, 1000)]
        {
            let start = now.timestamp() / duration * duration;
            sqlx::query("INSERT INTO provider_windows (name, window_start, duration, used, maximum) VALUES (?, ?, ?, 0, ?) ON CONFLICT(name) DO UPDATE SET used = CASE WHEN window_start = excluded.window_start THEN used ELSE 0 END, window_start = excluded.window_start").bind(name).bind(start).bind(duration).bind(maximum).execute(&mut *tx).await.map_err(|_|UpstreamFailure::temporary())?;
            let row = sqlx::query("SELECT used, maximum FROM provider_windows WHERE name = ?")
                .bind(name)
                .fetch_one(&mut *tx)
                .await
                .map_err(|_| UpstreamFailure::temporary())?;
            if row
                .try_get::<i64, _>("used")
                .map_err(|_| UpstreamFailure::temporary())?
                >= row
                    .try_get::<i64, _>("maximum")
                    .map_err(|_| UpstreamFailure::temporary())?
            {
                return Err(UpstreamFailure {
                    retry_after: DateTime::from_timestamp(start + duration, 0),
                    ..UpstreamFailure::temporary()
                });
            }
            sqlx::query("UPDATE provider_windows SET used = used + 1 WHERE name = ?")
                .bind(name)
                .execute(&mut *tx)
                .await
                .map_err(|_| UpstreamFailure::temporary())?;
        }
        tx.commit()
            .await
            .map_err(|_| UpstreamFailure::temporary())?;
        Ok(())
    }
    pub async fn observe_strava_quota(
        &self,
        headers: &reqwest::header::HeaderMap,
    ) -> Result<(), DomainError> {
        for (limit, usage) in [
            ("x-ratelimit-limit", "x-ratelimit-usage"),
            ("x-readratelimit-limit", "x-readratelimit-usage"),
        ] {
            let parse = |name: &str| {
                headers
                    .get(name)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| {
                        let values = v
                            .split(',')
                            .map(str::trim)
                            .map(str::parse::<i64>)
                            .collect::<Result<Vec<_>, _>>()
                            .ok()?;
                        (values.len() == 2).then_some(values)
                    })
            };
            if let (Some(limits), Some(used)) = (parse(limit), parse(usage)) {
                for (i, name) in ["strava.short", "strava.daily"].into_iter().enumerate() {
                    sqlx::query("UPDATE provider_windows SET used = MAX(used, ?), maximum = MIN(maximum, ?) WHERE name = ?").bind(used[i].max(0)).bind(limits[i].max(1)).bind(name).execute(&self.pool).await.map_err(persistence)?;
                }
            }
        }
        Ok(())
    }
    pub async fn observe_strava_response(
        &self,
        response: &reqwest::Response,
    ) -> Result<(), DomainError> {
        self.observe_strava_quota(response.headers()).await?;
        if response.status().as_u16() == 429 {
            let seconds = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<i64>().ok())
                .unwrap_or(900)
                .clamp(1, 86400);
            sqlx::query("INSERT INTO provider_cooldowns (provider, available_at) VALUES ('strava', ?) ON CONFLICT(provider) DO UPDATE SET available_at = MAX(available_at, excluded.available_at)").bind(Utc::now()+Duration::seconds(seconds)).execute(&self.pool).await.map_err(persistence)?;
        }
        Ok(())
    }
    pub async fn job_status(
        &self,
        actor: &Principal,
        id: Uuid,
    ) -> Result<serde_json::Value, DomainError> {
        actor.require(Scope::IntegrationsManage)?;
        let row = sqlx::query(
            "SELECT state, attempts, available_at FROM jobs WHERE user_id = ? AND id = ?",
        )
        .bind(actor.user_id.0.to_string())
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(persistence)?
        .ok_or(DomainError::NotFound)?;
        Ok(
            serde_json::json!({"id":id,"state":row.try_get::<String,_>("state").map_err(persistence)?,"attempts":row.try_get::<i64,_>("attempts").map_err(persistence)?,"available_at":row.try_get::<DateTime<Utc>,_>("available_at").map_err(persistence)?}),
        )
    }
}
