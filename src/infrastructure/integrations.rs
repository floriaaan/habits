use crate::{
    infrastructure::{database::Store, jobs::LeasedJob, security::cipher::SecretCipher},
    modules::{
        DomainError,
        integrations::strava::{Activity, Webhook},
    },
};
use chrono::{DateTime, Utc};
use reqwest::Url;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{sync::Arc, time::Duration};
use zeroize::Zeroize;

pub struct StravaConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: Url,
    pub verify_token: String,
    pub path_token: String,
    pub subscription: Option<i64>,
    pub capacity: u32,
    pub api: Url,
    pub oauth: Url,
}
pub struct IntegrationRuntime {
    pub store: Store,
    pub cipher: Option<Arc<SecretCipher>>,
    pub ha_url: Option<Url>,
    pub strava: Option<StravaConfig>,
    pub client: reqwest::Client,
}
#[derive(Serialize, Deserialize)]
pub struct Credentials {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_at: Option<i64>,
    #[serde(skip)]
    pub revision: i64,
}
impl Drop for Credentials {
    fn drop(&mut self) {
        self.access_token.zeroize();
        if let Some(refresh) = &mut self.refresh_token {
            refresh.zeroize();
        }
    }
}
#[derive(Debug)]
pub struct UpstreamFailure {
    pub retry_after: Option<DateTime<Utc>>,
    pub permanent: bool,
    pub unauthorized: bool,
    pub not_found: bool,
}
impl UpstreamFailure {
    pub fn temporary() -> Self {
        Self {
            retry_after: None,
            permanent: false,
            unauthorized: false,
            not_found: false,
        }
    }
}
impl From<DomainError> for UpstreamFailure {
    fn from(_: DomainError) -> Self {
        Self::temporary()
    }
}

pub async fn bounded_json<T: DeserializeOwned>(
    mut response: reqwest::Response,
) -> Result<T, UpstreamFailure> {
    if !response.status().is_success() {
        let status = response.status();
        let retry = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok())
            .map(|s| Utc::now() + chrono::Duration::seconds(s.clamp(1, 86400)))
            .or_else(|| {
                (status.as_u16() == 429).then(|| Utc::now() + chrono::Duration::minutes(15))
            });
        return Err(UpstreamFailure {
            retry_after: retry,
            permanent: status.is_client_error() && status.as_u16() != 429,
            unauthorized: status.as_u16() == 401,
            not_found: status.as_u16() == 404,
        });
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| UpstreamFailure::temporary())?
    {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err(UpstreamFailure::temporary());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| UpstreamFailure::temporary())
}
fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|s| !s.is_empty())
}
fn required(name: &str) -> Result<String, DomainError> {
    env(name).ok_or(DomainError::Validation(
        "optional integration is partially configured; see docs/integrations.md",
    ))
}
fn https_url(value: &str, allow_http: bool) -> Result<Url, DomainError> {
    let url = Url::parse(value).map_err(|_| DomainError::Validation("invalid integration URL"))?;
    if (url.scheme() != "https" && !(allow_http && url.scheme() == "http"))
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(DomainError::Validation(
            "integration URL must be an explicit HTTPS URL without credentials/query/fragment",
        ));
    }
    Ok(url)
}

impl IntegrationRuntime {
    pub fn from_env(store: Store) -> Result<Arc<Self>, DomainError> {
        let cipher = match (env("ENCRYPTION_KEY"), env("ENCRYPTION_KEY_ID")) {
            (None, None) => None,
            (Some(key), Some(id)) => Some(Arc::new(SecretCipher::new(&key, id)?)),
            _ => {
                return Err(DomainError::Validation(
                    "ENCRYPTION_KEY and ENCRYPTION_KEY_ID must be set together",
                ));
            }
        };
        let ha_url = env("HOME_ASSISTANT_URL")
            .map(|url| {
                https_url(
                    &url,
                    env("HOME_ASSISTANT_ALLOW_HTTP").as_deref() == Some("true"),
                )
            })
            .transpose()?;
        let strava = if [
            "STRAVA_CLIENT_ID",
            "STRAVA_CLIENT_SECRET",
            "STRAVA_REDIRECT_URI",
            "STRAVA_WEBHOOK_VERIFY_TOKEN",
            "STRAVA_WEBHOOK_PATH_TOKEN",
            "STRAVA_SUBSCRIPTION_ID",
            "STRAVA_ATHLETE_CAPACITY",
            "STRAVA_MULTI_ATHLETE_APPROVED",
        ]
        .iter()
        .any(|name| env(name).is_some())
        {
            let capacity = env("STRAVA_ATHLETE_CAPACITY")
                .unwrap_or_else(|| "1".into())
                .parse::<u32>()
                .map_err(|_| DomainError::Validation("invalid Strava capacity"))?;
            if capacity == 0
                || (capacity > 1 && env("STRAVA_MULTI_ATHLETE_APPROVED").as_deref() != Some("true"))
            {
                return Err(DomainError::Validation(
                    "multi-athlete Strava requires explicit approved capacity",
                ));
            }
            let config = StravaConfig {
                client_id: required("STRAVA_CLIENT_ID")?,
                client_secret: required("STRAVA_CLIENT_SECRET")?,
                redirect_uri: https_url(&required("STRAVA_REDIRECT_URI")?, false)?,
                verify_token: required("STRAVA_WEBHOOK_VERIFY_TOKEN")?,
                path_token: required("STRAVA_WEBHOOK_PATH_TOKEN")?,
                subscription: env("STRAVA_SUBSCRIPTION_ID")
                    .map(|s| s.parse())
                    .transpose()
                    .map_err(|_| DomainError::Validation("invalid Strava subscription ID"))?,
                capacity,
                api: https_url("https://www.strava.com/api/v3/", false)?,
                oauth: https_url("https://www.strava.com/oauth/", false)?,
            };
            if config.path_token.len() < 32
                || !config
                    .path_token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            {
                return Err(DomainError::Validation(
                    "STRAVA_WEBHOOK_PATH_TOKEN must be >=32 random URL-safe characters",
                ));
            }
            Some(config)
        } else {
            None
        };
        if (ha_url.is_some() || strava.is_some()) && cipher.is_none() {
            return Err(DomainError::Validation(
                "configured integrations require an encryption key",
            ));
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|_| DomainError::Unavailable)?;
        Ok(Arc::new(Self {
            store,
            cipher,
            ha_url,
            strava,
            client,
        }))
    }
    pub async fn execute(&self, job: &LeasedJob) -> Result<(), UpstreamFailure> {
        match job.kind.as_str() {
            "strava.sync" => {
                let config = self
                    .strava
                    .as_ref()
                    .ok_or_else(UpstreamFailure::temporary)?;
                let token = self.strava_access(job).await?;
                let page = job
                    .payload
                    .get("page")
                    .and_then(|v| v.as_u64())
                    .filter(|p| *p > 0 && *p <= 100)
                    .ok_or_else(UpstreamFailure::temporary)?;
                let after = job
                    .payload
                    .get("after")
                    .and_then(|v| v.as_i64())
                    .unwrap_or_else(|| (job.created_at - chrono::Duration::days(90)).timestamp());
                self.store.reserve_strava_request().await?;
                let response = self
                    .client
                    .get(
                        config
                            .api
                            .join("athlete/activities")
                            .map_err(|_| UpstreamFailure::temporary())?,
                    )
                    .bearer_auth(&token.access_token)
                    .query(&[
                        ("page", page.to_string()),
                        ("per_page", "100".into()),
                        ("after", after.to_string()),
                    ])
                    .send()
                    .await
                    .map_err(|_| UpstreamFailure::temporary())?;
                self.store.observe_strava_response(&response).await?;
                if response.status().as_u16() == 401 {
                    self.store.disconnect_for_job(job, token.revision).await?;
                    return Ok(());
                }
                let activities: Vec<Activity> = bounded_json(response).await?;
                for activity in &activities {
                    self.store.reconcile_job_activity(job, activity).await?;
                }
                if activities.len() == 100 {
                    if page >= 100 {
                        return Err(UpstreamFailure {
                            permanent: true,
                            ..UpstreamFailure::temporary()
                        });
                    }
                    self.store
                        .enqueue_for_job(
                            job,
                            "strava.sync",
                            &format!("sync:{}:p{}", job.id, page + 1),
                            serde_json::json!({"page":page+1,"after":after}),
                        )
                        .await?;
                }
                Ok(())
            }
            "ha.notify" => {
                let base = self
                    .ha_url
                    .as_ref()
                    .ok_or_else(UpstreamFailure::temporary)?;
                let key = self
                    .cipher
                    .as_ref()
                    .ok_or_else(UpstreamFailure::temporary)?;
                let credentials = self
                    .store
                    .credentials(job.user_id, job.integration_id, "home_assistant", key)
                    .await?;
                let url = base
                    .join("api/services/persistent_notification/create")
                    .map_err(|_| UpstreamFailure::temporary())?;
                let response=self.client.post(url).bearer_auth(&credentials.access_token).json(&serde_json::json!({"title":job.payload["title"],"message":job.payload["message"],"notification_id":job.id.to_string()})).send().await.map_err(|_|UpstreamFailure::temporary())?;
                let _: serde_json::Value = bounded_json(response).await?;
                Ok(())
            }
            "strava.activity" => {
                let event: Webhook = serde_json::from_value(job.payload.clone())
                    .map_err(|_| UpstreamFailure::temporary())?;
                let config = self
                    .strava
                    .as_ref()
                    .ok_or_else(UpstreamFailure::temporary)?;
                let token = self.strava_access(job).await?;
                self.store.reserve_strava_request().await?;
                let path = if event.object_type == "athlete" {
                    "athlete".to_string()
                } else {
                    format!("activities/{}", event.object_id)
                };
                let response = self
                    .client
                    .get(
                        config
                            .api
                            .join(&path)
                            .map_err(|_| UpstreamFailure::temporary())?,
                    )
                    .bearer_auth(&token.access_token)
                    .send()
                    .await
                    .map_err(|_| UpstreamFailure::temporary())?;
                self.store.observe_strava_response(&response).await?;
                if response.status().as_u16() == 401 {
                    self.store.disconnect_for_job(job, token.revision).await?;
                    return Ok(());
                }
                if response.status().as_u16() == 404 && event.object_type == "activity" {
                    self.store
                        .purge_source_for_job(job, event.object_id)
                        .await?;
                    return Ok(());
                }
                if event.object_type == "athlete" {
                    let _: serde_json::Value = bounded_json(response).await?;
                    return Ok(());
                }
                let activity: Activity = bounded_json(response).await?;
                if activity.id != event.object_id || activity.athlete.id != event.owner_id {
                    return Err(UpstreamFailure {
                        permanent: true,
                        ..UpstreamFailure::temporary()
                    });
                }
                self.store.reconcile_job_activity(job, &activity).await?;
                Ok(())
            }
            _ => Err(UpstreamFailure {
                permanent: true,
                ..UpstreamFailure::temporary()
            }),
        }
    }
    async fn strava_access(&self, job: &LeasedJob) -> Result<Credentials, UpstreamFailure> {
        let user = job.user_id;
        let id = job.integration_id;
        let config = self
            .strava
            .as_ref()
            .ok_or_else(UpstreamFailure::temporary)?;
        let cipher = self
            .cipher
            .as_ref()
            .ok_or_else(UpstreamFailure::temporary)?;
        let credentials = self.store.credentials(user, id, "strava", cipher).await?;
        if credentials
            .expires_at
            .is_some_and(|expiry| expiry > Utc::now().timestamp() + 60)
        {
            return Ok(credentials);
        }
        self.store.reserve_strava_request().await?;
        let response = self
            .client
            .post(
                config
                    .oauth
                    .join("token")
                    .map_err(|_| UpstreamFailure::temporary())?,
            )
            .form(&[
                ("client_id", config.client_id.as_str()),
                ("client_secret", config.client_secret.as_str()),
                ("grant_type", "refresh_token"),
                (
                    "refresh_token",
                    credentials
                        .refresh_token
                        .as_deref()
                        .ok_or_else(UpstreamFailure::temporary)?,
                ),
            ])
            .send()
            .await
            .map_err(|_| UpstreamFailure::temporary())?;
        self.store.observe_strava_response(&response).await?;
        if matches!(response.status().as_u16(), 400 | 401) {
            if let Ok(current) = self.store.credentials(user, id, "strava", cipher).await
                && current.revision != credentials.revision
            {
                return Ok(current);
            }
            self.store
                .disconnect_for_job(job, credentials.revision)
                .await?;
            return Err(UpstreamFailure {
                permanent: true,
                unauthorized: true,
                ..UpstreamFailure::temporary()
            });
        }
        let mut refreshed: Credentials = bounded_json(response).await?;
        refreshed.revision = credentials.revision;
        self.store
            .replace_credentials(user, id, "strava", &refreshed, cipher)
            .await?;
        refreshed.revision += 1;
        Ok(refreshed)
    }
    pub async fn worker(self: Arc<Self>) {
        loop {
            match self.store.claim_job().await {
                Ok(Some(job)) => {
                    let result = self.execute(&job).await;
                    let (success, retry, permanent) = match result {
                        Ok(()) => (true, None, false),
                        Err(failure) => (false, failure.retry_after, failure.permanent),
                    };
                    if self
                        .store
                        .finish_job(&job, success, retry, permanent)
                        .await
                        .is_err()
                    {
                        tracing::error!(category = "jobs", "job completion failed");
                    }
                }
                Ok(None) => tokio::time::sleep(Duration::from_secs(1)).await,
                Err(_) => {
                    tracing::error!(category = "jobs", "job claim failed");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    }
}
