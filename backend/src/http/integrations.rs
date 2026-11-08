use super::{
    middleware::{ApiError, ErrorEnvelope},
    routes::{identifier, json},
};
use crate::{
    infrastructure::{
        database::Store,
        integrations::{Credentials, IntegrationRuntime, bounded_json},
    },
    modules::{
        DomainError,
        auth::{Principal, Scope},
        integrations::{
            IntegrationInfo,
            home_assistant::{Connect, Notification},
            strava::{Athlete, Mapping, Webhook},
        },
    },
};
use axum::{
    Extension, Json, Router,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode},
    routing::{get, post, put},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;
use uuid::Uuid;

pub(super) fn private_routes() -> Router<Store> {
    Router::new()
        .route("/api/v1/integrations", get(list))
        .route("/api/v1/integrations/home-assistant", put(connect_ha))
        .route(
            "/api/v1/integrations/home-assistant/notifications",
            post(notify),
        )
        .route("/api/v1/integrations/strava/authorize", post(authorize))
        .route("/api/v1/integrations/strava/mappings", put(mapping))
        .route("/api/v1/integrations/strava/sync", post(sync))
        .route(
            "/api/v1/integrations/{id}",
            axum::routing::delete(disconnect),
        )
        .route("/api/v1/jobs/{id}", get(job))
}
pub(super) fn public_routes() -> Router<Store> {
    Router::new()
        .route("/integrations/strava/callback", get(callback))
        .route(
            "/integrations/strava/webhook/{token}",
            get(challenge).post(webhook),
        )
}
type Runtime = Option<Extension<Arc<IntegrationRuntime>>>;
fn runtime(value: Runtime) -> Result<Arc<IntegrationRuntime>, ApiError> {
    value
        .map(|Extension(value)| value)
        .ok_or_else(|| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))
}
fn idempotency(headers: &HeaderMap) -> Result<&str, ApiError> {
    headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.is_empty() && v.len() <= 128 && v.bytes().all(|b| b.is_ascii_graphic()))
        .ok_or_else(|| ApiError::validation("Idempotency-Key must be 1..128 visible ASCII bytes"))
}
#[derive(Serialize, ToSchema)]
pub struct JobAccepted {
    pub job_id: Uuid,
}
#[derive(Serialize, ToSchema)]
pub struct Authorization {
    pub authorization_url: String,
}

#[utoipa::path(get,path="/api/v1/integrations",security(("bearer"=[])),responses((status=200,body=Vec<IntegrationInfo>),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope)))]
pub(super) async fn list(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
) -> Result<Json<Vec<IntegrationInfo>>, ApiError> {
    Ok(Json(store.integration_info(&actor).await?))
}
#[utoipa::path(put,path="/api/v1/integrations/home-assistant",request_body=Connect,security(("bearer"=[])),responses((status=201,body=IntegrationInfo),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=503,body=ErrorEnvelope)))]
pub(super) async fn connect_ha(
    Extension(actor): Extension<Principal>,
    rt: Runtime,
    body: Result<Json<Connect>, JsonRejection>,
) -> Result<(StatusCode, Json<IntegrationInfo>), ApiError> {
    actor.require(Scope::IntegrationsManage)?;
    let rt = runtime(rt)?;
    if rt.ha_url.is_none() {
        return Err(ApiError::status(StatusCode::SERVICE_UNAVAILABLE));
    }
    let cipher = rt
        .cipher
        .as_ref()
        .ok_or_else(|| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?;
    let input = json(body)?;
    if input.token.is_empty() || input.token.len() > 4096 {
        return Err(ApiError::validation("HA token must contain 1..4096 bytes"));
    }
    let credentials = Credentials {
        access_token: input.token,
        refresh_token: None,
        expires_at: None,
        revision: 0,
    };
    let id = rt
        .store
        .connect_integration(
            actor.user_id,
            "home_assistant",
            &actor.user_id.0.to_string(),
            &credentials,
            cipher,
            1,
        )
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(IntegrationInfo {
            id,
            provider: crate::modules::integrations::Provider::HomeAssistant,
            connected: true,
        }),
    ))
}
#[utoipa::path(post,path="/api/v1/integrations/home-assistant/notifications",params(("Idempotency-Key"=String,Header)),request_body=Notification,security(("bearer"=[])),responses((status=202,body=JobAccepted),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=409,body=ErrorEnvelope),(status=503,body=ErrorEnvelope)))]
pub(super) async fn notify(
    Extension(actor): Extension<Principal>,
    rt: Runtime,
    headers: HeaderMap,
    body: Result<Json<Notification>, JsonRejection>,
) -> Result<(StatusCode, Json<JobAccepted>), ApiError> {
    actor.require(Scope::NotificationsWrite)?;
    let rt = runtime(rt)?;
    if rt.ha_url.is_none() {
        return Err(ApiError::status(StatusCode::SERVICE_UNAVAILABLE));
    }
    let input = json(body)?;
    input.validate()?;
    let integration = rt
        .store
        .integration_id(actor.user_id, "home_assistant")
        .await?;
    let id = rt
        .store
        .enqueue(
            actor.user_id,
            integration,
            "ha.notify",
            idempotency(&headers)?,
            serde_json::to_value(input)
                .map_err(|_| ApiError::status(StatusCode::INTERNAL_SERVER_ERROR))?,
        )
        .await?;
    Ok((StatusCode::ACCEPTED, Json(JobAccepted { job_id: id })))
}
#[utoipa::path(post,path="/api/v1/integrations/strava/authorize",security(("bearer"=[])),responses((status=200,body=Authorization),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=503,body=ErrorEnvelope)))]
pub(super) async fn authorize(
    Extension(actor): Extension<Principal>,
    rt: Runtime,
) -> Result<Json<Authorization>, ApiError> {
    actor.require(Scope::IntegrationsManage)?;
    let rt = runtime(rt)?;
    let config = rt
        .strava
        .as_ref()
        .ok_or_else(|| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?;
    let state = rt.store.oauth_state(&actor).await?;
    let mut url = config
        .oauth
        .join("authorize")
        .map_err(|_| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?;
    url.query_pairs_mut().extend_pairs([
        ("client_id", config.client_id.as_str()),
        ("redirect_uri", config.redirect_uri.as_str()),
        ("response_type", "code"),
        ("approval_prompt", "auto"),
        ("scope", "activity:read"),
        ("state", state.as_str()),
    ]);
    Ok(Json(Authorization {
        authorization_url: url.to_string(),
    }))
}
#[derive(Deserialize)]
pub struct Callback {
    state: String,
    code: Option<String>,
    scope: Option<String>,
    error: Option<String>,
}
#[derive(Deserialize)]
struct TokenExchange {
    #[serde(flatten)]
    credentials: Credentials,
    athlete: Athlete,
}
#[utoipa::path(get,path="/integrations/strava/callback",params(("state"=String,Query),("code"=Option<String>,Query),("scope"=Option<String>,Query),("error"=Option<String>,Query)),responses((status=200,body=IntegrationInfo),(status=401,body=ErrorEnvelope),(status=422,body=ErrorEnvelope),(status=503,body=ErrorEnvelope)))]
pub(super) async fn callback(
    rt: Runtime,
    query: Result<Query<Callback>, QueryRejection>,
) -> Result<Json<IntegrationInfo>, ApiError> {
    let rt = runtime(rt)?;
    let config = rt
        .strava
        .as_ref()
        .ok_or_else(|| ApiError::status(StatusCode::NOT_FOUND))?;
    let Query(input) = query.map_err(|_| ApiError::validation("invalid OAuth callback"))?;
    let user = rt.store.consume_oauth_state(&input.state).await?;
    if input.error.is_some() {
        return Err(ApiError::validation("Strava authorization denied"));
    }
    if !input
        .scope
        .as_deref()
        .unwrap_or("")
        .split(',')
        .any(|s| s == "activity:read" || s == "activity:read_all")
    {
        return Err(ApiError::validation("activity read permission required"));
    }
    let code = input
        .code
        .filter(|s| !s.is_empty() && s.len() <= 2048)
        .ok_or_else(|| ApiError::validation("OAuth code required"))?;
    rt.store
        .reserve_strava_request()
        .await
        .map_err(|_| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?;
    let response = rt
        .client
        .post(
            config
                .oauth
                .join("token")
                .map_err(|_| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?,
        )
        .form(&[
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("code", code.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|_| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?;
    let tokens: TokenExchange = bounded_json(response)
        .await
        .map_err(|_| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?;
    if tokens.athlete.id <= 0
        || tokens.credentials.access_token.is_empty()
        || tokens
            .credentials
            .refresh_token
            .as_ref()
            .is_none_or(|t| t.is_empty())
        || tokens
            .credentials
            .expires_at
            .is_none_or(|t| t <= chrono::Utc::now().timestamp())
    {
        return Err(ApiError::status(StatusCode::SERVICE_UNAVAILABLE));
    }
    let cipher = rt
        .cipher
        .as_ref()
        .ok_or_else(|| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?;
    let id = rt
        .store
        .connect_integration(
            user,
            "strava",
            &tokens.athlete.id.to_string(),
            &tokens.credentials,
            cipher,
            config.capacity,
        )
        .await?;
    Ok(Json(IntegrationInfo {
        id,
        provider: crate::modules::integrations::Provider::Strava,
        connected: true,
    }))
}
#[utoipa::path(put,path="/api/v1/integrations/strava/mappings",request_body=Mapping,security(("bearer"=[])),responses((status=204),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=422,body=ErrorEnvelope)))]
pub(super) async fn mapping(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    body: Result<Json<Mapping>, JsonRejection>,
) -> Result<StatusCode, ApiError> {
    store.set_strava_mapping(&actor, json(body)?).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(post,path="/api/v1/integrations/strava/sync",params(("Idempotency-Key"=String,Header)),security(("bearer"=[])),responses((status=202,body=JobAccepted),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=409,body=ErrorEnvelope),(status=503,body=ErrorEnvelope)))]
pub(super) async fn sync(
    Extension(actor): Extension<Principal>,
    rt: Runtime,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<JobAccepted>), ApiError> {
    actor.require(Scope::IntegrationsManage)?;
    let rt = runtime(rt)?;
    if rt.strava.is_none() {
        return Err(ApiError::status(StatusCode::SERVICE_UNAVAILABLE));
    }
    let id = rt.store.integration_id(actor.user_id, "strava").await?;
    let job = rt
        .store
        .enqueue(
            actor.user_id,
            id,
            "strava.sync",
            idempotency(&headers)?,
            serde_json::json!({"page":1}),
        )
        .await?;
    Ok((StatusCode::ACCEPTED, Json(JobAccepted { job_id: job })))
}
#[utoipa::path(delete,path="/api/v1/integrations/{id}",params(("id"=Uuid,Path)),security(("bearer"=[])),responses((status=204),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn disconnect(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    actor.require(Scope::IntegrationsManage)?;
    store
        .disconnect_integration(actor.user_id, identifier(path)?)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/jobs/{id}",params(("id"=Uuid,Path)),security(("bearer"=[])),responses((status=200,description="Job metadata without payload or credentials"),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn job(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<Json<serde_json::Value>, ApiError> {
    Ok(Json(store.job_status(&actor, identifier(path)?).await?))
}
#[derive(Deserialize)]
pub struct Challenge {
    #[serde(rename = "hub.mode")]
    mode: String,
    #[serde(rename = "hub.verify_token")]
    verify_token: String,
    #[serde(rename = "hub.challenge")]
    challenge: String,
}
#[utoipa::path(get,path="/integrations/strava/webhook/{token}",params(("token"=String,Path),("hub.mode"=String,Query),("hub.verify_token"=String,Query),("hub.challenge"=String,Query)),responses((status=200,description="Strava hub.challenge response"),(status=401,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn challenge(
    rt: Runtime,
    Path(token): Path<String>,
    query: Result<Query<Challenge>, QueryRejection>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let rt = runtime(rt)?;
    let config = rt
        .strava
        .as_ref()
        .ok_or_else(|| ApiError::status(StatusCode::NOT_FOUND))?;
    let Query(input) = query.map_err(|_| ApiError::validation("invalid webhook challenge"))?;
    if token != config.path_token
        || input.verify_token != config.verify_token
        || input.mode != "subscribe"
        || input.challenge.is_empty()
        || input.challenge.len() > 256
    {
        return Err(ApiError::status(StatusCode::UNAUTHORIZED));
    }
    Ok(Json(serde_json::json!({"hub.challenge":input.challenge})))
}
#[utoipa::path(post,path="/integrations/strava/webhook/{token}",params(("token"=String,Path)),request_body=Webhook,responses((status=200,description="Durable asynchronous acknowledgement, including duplicates"),(status=401,body=ErrorEnvelope),(status=422,body=ErrorEnvelope),(status=503,body=ErrorEnvelope)))]
pub(super) async fn webhook(
    rt: Runtime,
    Path(token): Path<String>,
    body: Result<Json<Webhook>, JsonRejection>,
) -> Result<StatusCode, ApiError> {
    let rt = runtime(rt)?;
    let config = rt
        .strava
        .as_ref()
        .ok_or_else(|| ApiError::status(StatusCode::NOT_FOUND))?;
    if token != config.path_token {
        return Err(ApiError::status(StatusCode::UNAUTHORIZED));
    }
    let input = json(body)?;
    if !input.validate(
        config
            .subscription
            .ok_or_else(|| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))?,
    ) {
        return Err(ApiError::validation("invalid webhook subscription/event"));
    }
    let (user, integration) = match rt.store.webhook_integration(input.owner_id).await {
        Ok(value) => value,
        Err(DomainError::NotFound) => return Ok(StatusCode::OK),
        Err(error) => return Err(error.into()),
    };
    let key = crate::infrastructure::security::token_hash(
        &serde_json::to_string(&input).map_err(|_| ApiError::validation("invalid webhook"))?,
    );
    let key = key.iter().map(|b| format!("{b:02x}")).collect::<String>();
    tokio::time::timeout(
        std::time::Duration::from_millis(1500),
        rt.store.enqueue(
            user,
            integration,
            "strava.activity",
            &key,
            serde_json::to_value(input.minimal())
                .map_err(|_| ApiError::validation("invalid webhook"))?,
        ),
    )
    .await
    .map_err(|_| ApiError::status(StatusCode::SERVICE_UNAVAILABLE))??;
    Ok(StatusCode::OK)
}
