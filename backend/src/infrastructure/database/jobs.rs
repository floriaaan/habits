use super::{Store, persistence};
use crate::infrastructure::security::token_hash;
use crate::{
    infrastructure::jobs::LeasedJob,
    modules::{DomainError, users::UserId},
};
use chrono::{DateTime, Duration, Utc};
use sqlx::Row;
use uuid::Uuid;

pub(super) async fn fence(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    job: &LeasedJob,
) -> Result<(), DomainError> {
    let now = Utc::now();
    let updated=sqlx::query("UPDATE jobs SET lease_until = ? WHERE user_id = ? AND id = ? AND state = 'running' AND lease_owner = ? AND lease_until > ?").bind(now+Duration::seconds(60)).bind(job.user_id.0.to_string()).bind(job.id.to_string()).bind(job.owner.to_string()).bind(now).execute(&mut **tx).await.map_err(persistence)?;
    if updated.rows_affected() == 0 {
        return Err(DomainError::Conflict);
    }
    Ok(())
}

impl Store {
    pub async fn enqueue(
        &self,
        user: UserId,
        integration: Uuid,
        kind: &str,
        key: &str,
        payload: serde_json::Value,
    ) -> Result<Uuid, DomainError> {
        self.enqueue_inner(user, integration, kind, key, payload, None)
            .await
    }
    pub async fn enqueue_for_job(
        &self,
        job: &LeasedJob,
        kind: &str,
        key: &str,
        payload: serde_json::Value,
    ) -> Result<Uuid, DomainError> {
        self.enqueue_inner(
            job.user_id,
            job.integration_id,
            kind,
            key,
            payload,
            Some(job),
        )
        .await
    }
    async fn enqueue_inner(
        &self,
        user: UserId,
        integration: Uuid,
        kind: &str,
        key: &str,
        payload: serde_json::Value,
        job: Option<&LeasedJob>,
    ) -> Result<Uuid, DomainError> {
        if key.is_empty() || key.len() > 128 {
            return Err(DomainError::Validation(
                "job idempotency key must be 1..128 bytes",
            ));
        }
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        if let Some(job) = job {
            fence(&mut tx, job).await?;
        }
        let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM integrations WHERE user_id = ? AND id = ? AND revoked_at IS NULL)").bind(user.0.to_string()).bind(integration.to_string()).fetch_one(&mut *tx).await.map_err(persistence)?;
        if !valid {
            return Err(DomainError::NotFound);
        }
        if let Some(row)=sqlx::query("SELECT id, integration_id, payload, payload_hash FROM jobs WHERE user_id = ? AND kind = ? AND idempotency_key = ?").bind(user.0.to_string()).bind(kind).bind(key).fetch_optional(&mut *tx).await.map_err(persistence)? {
            let previous:String=row.try_get("payload").map_err(persistence)?;let source:Option<String>=row.try_get("integration_id").map_err(persistence)?;
            let hash:Option<Vec<u8>>=row.try_get("payload_hash").map_err(persistence)?;
            let same=if let Some(hash)=hash {hash==token_hash(&payload.to_string())}else{serde_json::from_str::<serde_json::Value>(&previous).map_err(persistence)?==payload};
            if !same||source.as_deref()!=Some(integration.to_string().as_str()){return Err(DomainError::Conflict);}
            let id:String=row.try_get("id").map_err(persistence)?;return id.parse().map_err(persistence);
        }
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM jobs WHERE user_id = ? AND state IN ('pending','running')",
        )
        .bind(user.0.to_string())
        .fetch_one(&mut *tx)
        .await
        .map_err(persistence)?;
        if count >= 1000 {
            return Err(DomainError::Validation("tenant job queue capacity reached"));
        }
        let id = Uuid::new_v4();
        let now = Utc::now();
        sqlx::query("INSERT INTO jobs (id, user_id, integration_id, kind, idempotency_key, payload, available_at, created_at, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id.to_string()).bind(user.0.to_string()).bind(integration.to_string()).bind(kind).bind(key).bind(payload.to_string()).bind(now).bind(now).bind(token_hash(&payload.to_string())).execute(&mut *tx).await.map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(id)
    }
    pub async fn claim_job(&self) -> Result<Option<LeasedJob>, DomainError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        let now = Utc::now();
        sqlx::query("UPDATE jobs SET state = 'failed', lease_owner = NULL, lease_until = NULL WHERE state = 'running' AND attempts >= 8 AND lease_until <= ?").bind(now).execute(&mut *tx).await.map_err(persistence)?;
        let row=sqlx::query("SELECT j.* FROM jobs j JOIN integrations i ON i.user_id = j.user_id AND i.id = j.integration_id WHERE i.revoked_at IS NULL AND j.attempts < 8 AND ((j.state = 'pending' AND j.available_at <= ?) OR (j.state = 'running' AND j.lease_until <= ?)) ORDER BY j.available_at, j.id LIMIT 1").bind(now).bind(now).fetch_optional(&mut *tx).await.map_err(persistence)?;
        let Some(row) = row else {
            tx.commit().await.map_err(persistence)?;
            return Ok(None);
        };
        let id: String = row.try_get("id").map_err(persistence)?;
        let user: String = row.try_get("user_id").map_err(persistence)?;
        let integration: String = row.try_get("integration_id").map_err(persistence)?;
        let payload: String = row.try_get("payload").map_err(persistence)?;
        let owner = Uuid::new_v4();
        sqlx::query("UPDATE jobs SET state = 'running', attempts = attempts + 1, lease_until = ?, lease_owner = ? WHERE id = ?").bind(now+Duration::seconds(60)).bind(owner.to_string()).bind(&id).execute(&mut *tx).await.map_err(persistence)?;
        let job = LeasedJob {
            id: id.parse().map_err(persistence)?,
            user_id: UserId(user.parse().map_err(persistence)?),
            integration_id: integration.parse().map_err(persistence)?,
            kind: row.try_get("kind").map_err(persistence)?,
            payload: serde_json::from_str(&payload).map_err(persistence)?,
            attempts: row.try_get::<u32, _>("attempts").map_err(persistence)? + 1,
            owner,
            created_at: row.try_get("created_at").map_err(persistence)?,
        };
        tx.commit().await.map_err(persistence)?;
        Ok(Some(job))
    }
    pub async fn finish_job(
        &self,
        job: &LeasedJob,
        success: bool,
        retry_after: Option<DateTime<Utc>>,
        permanent: bool,
    ) -> Result<(), DomainError> {
        let state = if success {
            "succeeded"
        } else if permanent || job.attempts >= 8 {
            "failed"
        } else {
            "pending"
        };
        let retry = retry_after.unwrap_or_else(|| {
            Utc::now() + Duration::seconds((5 * (1i64 << job.attempts.min(12))).min(21600))
        });
        sqlx::query("UPDATE jobs SET state = ?, available_at = ?, lease_until = NULL, lease_owner = NULL, payload = CASE WHEN ? = 1 AND kind LIKE 'strava.%' AND payload_hash IS NOT NULL THEN '{}' ELSE payload END WHERE user_id = ? AND id = ? AND state = 'running' AND lease_owner = ?").bind(state).bind(retry).bind(success).bind(job.user_id.0.to_string()).bind(job.id.to_string()).bind(job.owner.to_string()).execute(&self.pool).await.map_err(persistence)?;
        Ok(())
    }
}
