use super::{
    middleware::{ApiError, ErrorEnvelope},
    routes::{identifier, json, page},
};
use crate::{
    infrastructure::database::Store,
    modules::{
        auth::{
            IdentityMode, IssuedToken, NewServiceAccount, NewToken, Principal, Scope,
            ServiceAccount, TokenMetadata,
        },
        habits::Pagination,
    },
};
use axum::{
    Extension, Json, Router,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::StatusCode,
    routing::{delete, get, post},
};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

pub(super) fn routes() -> Router<Store> {
    Router::new()
        .route("/api/v1/session", get(session))
        .route("/api/v1/tokens", get(list).post(create))
        .route("/api/v1/tokens/{id}", delete(revoke))
        .route("/api/v1/tokens/{id}/rotate", post(rotate))
        .route("/api/v1/service-accounts", post(service))
        .route("/api/v1/service-accounts/{id}", delete(revoke_service))
}
#[utoipa::path(post,path="/api/v1/tokens",request_body=NewToken,security(("bearer"=[])),responses((status=201,body=IssuedToken),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope),(status=422,body=ErrorEnvelope)))]
pub(super) async fn create(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    body: Result<Json<NewToken>, JsonRejection>,
) -> Result<(StatusCode, Json<IssuedToken>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(store.create_token(&actor, json(body)?).await?),
    ))
}
#[utoipa::path(get,path="/api/v1/tokens",params(("limit"=Option<u32>,Query),("offset"=Option<u32>,Query)),security(("bearer"=[])),responses((status=200,body=Vec<TokenMetadata>),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope)))]
pub(super) async fn list(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    query: Result<Query<Pagination>, QueryRejection>,
) -> Result<Json<Vec<TokenMetadata>>, ApiError> {
    Ok(Json(store.list_tokens(&actor, page(query)?).await?))
}
#[utoipa::path(delete,path="/api/v1/tokens/{id}",params(("id"=Uuid,Path)),security(("bearer"=[])),responses((status=204),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn revoke(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    store.revoke_token(&actor, identifier(path)?).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(post,path="/api/v1/tokens/{id}/rotate",params(("id"=Uuid,Path)),security(("bearer"=[])),responses((status=201,body=IssuedToken),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn rotate(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<(StatusCode, Json<IssuedToken>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(store.rotate_token(&actor, identifier(path)?).await?),
    ))
}
#[utoipa::path(post,path="/api/v1/service-accounts",request_body=NewServiceAccount,security(("bearer"=[])),responses((status=201,body=ServiceAccount),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=422,body=ErrorEnvelope)))]
pub(super) async fn service(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    body: Result<Json<NewServiceAccount>, JsonRejection>,
) -> Result<(StatusCode, Json<ServiceAccount>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(store.create_service_account(&actor, json(body)?).await?),
    ))
}
#[utoipa::path(delete,path="/api/v1/service-accounts/{id}",params(("id"=Uuid,Path)),security(("bearer"=[])),responses((status=204),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn revoke_service(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    store
        .revoke_service_account(&actor, identifier(path)?)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Public view of the authenticated principal; never serializes credentials.
#[derive(Serialize, ToSchema)]
pub struct Session {
    user_id: Uuid,
    mode: SessionMode,
    scopes: Vec<Scope>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SessionMode {
    PersonalAccessToken,
    ServiceAccount,
    OidcAccessToken,
    MobileSession,
}

#[utoipa::path(get, path = "/api/v1/session", security(("bearer" = [])), responses((status = 200, body = Session), (status = 401, body = ErrorEnvelope)))]
pub(super) async fn session(Extension(actor): Extension<Principal>) -> Json<Session> {
    Json(Session {
        user_id: actor.user_id.0,
        mode: match actor.mode {
            IdentityMode::PersonalAccessToken => SessionMode::PersonalAccessToken,
            IdentityMode::ServiceAccount => SessionMode::ServiceAccount,
            IdentityMode::OidcAccessToken => SessionMode::OidcAccessToken,
            IdentityMode::MobileSession => SessionMode::MobileSession,
        },
        scopes: actor.scopes,
    })
}
