use crate::{
    http::middleware::{ApiError, ErrorEnvelope, TrafficBudget, authenticate, boundary},
    infrastructure::database::Store,
    modules::{
        auth::Principal,
        entries::{self, Entry, EntryPage, NewEntry},
        habits::{self, Habit, HabitPage, NewHabit, Pagination},
    },
};
use axum::{
    Extension, Json, Router,
    extract::{
        DefaultBodyLimit, Path, Query, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode},
    middleware,
    routing::get,
};
use chrono::Utc;
use serde::Serialize;
use tower::limit::ConcurrencyLimitLayer;
use tower_http::trace::TraceLayer;
use utoipa::{
    Modify, OpenApi, ToSchema,
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
};
use uuid::Uuid;

pub fn router(store: Store) -> Router {
    router_with_auth(store, crate::config::AuthMode::Disabled)
}

pub fn router_with_auth(store: Store, mode: crate::config::AuthMode) -> Router {
    assemble(store, mode, None, None)
}

pub fn router_with_integrations(
    store: Store,
    mode: crate::config::AuthMode,
    runtime: std::sync::Arc<crate::infrastructure::integrations::IntegrationRuntime>,
) -> Router {
    assemble(store, mode, Some(runtime), None)
}

pub fn router_with_identity(
    store: Store,
    mode: crate::config::AuthMode,
    runtime: std::sync::Arc<crate::infrastructure::integrations::IntegrationRuntime>,
    oidc: Option<std::sync::Arc<crate::infrastructure::security::oidc::OidcVerifier>>,
) -> Router {
    assemble(store, mode, Some(runtime), oidc)
}

fn private_routes() -> Router<Store> {
    Router::new()
        .merge(super::auth::routes())
        .merge(super::integrations::private_routes())
        .merge(super::tracking::routes())
        .merge(super::tracking::entry_routes())
        .merge(super::dashboard::routes())
        .route("/api/v1", get(version))
        .route("/api/v1/openapi.json", get(openapi))
        .route("/api/v1/habits", get(list_habits).post(create_habit))
        .route(
            "/api/v1/habits/{habit_id}/entries",
            get(list_entries).post(record_entry),
        )
        .route("/api/v1/entries/{entry_id}", get(get_entry))
}

fn assemble(
    store: Store,
    mode: crate::config::AuthMode,
    runtime: Option<std::sync::Arc<crate::infrastructure::integrations::IntegrationRuntime>>,
    oidc: Option<std::sync::Arc<crate::infrastructure::security::oidc::OidcVerifier>>,
) -> Router {
    let private = private_routes().layer(middleware::from_fn_with_state(
        (store.clone(), mode, oidc),
        authenticate,
    ));
    let router = Router::new()
        .merge(private)
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .fallback(|| async { ApiError::status(StatusCode::NOT_FOUND) });
    let router = if let Some(runtime) = runtime {
        router
            .merge(super::integrations::public_routes())
            .layer(Extension(runtime))
    } else {
        router
    };
    router
        .with_state(store)
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(ConcurrencyLimitLayer::new(64))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|_: &axum::http::Request<_>| tracing::info_span!("http")),
        )
        .layer(middleware::from_fn_with_state(
            TrafficBudget::default(),
            boundary,
        ))
}

#[derive(Serialize, ToSchema)]
pub struct Health {
    pub status: String,
}

#[utoipa::path(get, path = "/health/live", responses((status = 200, body = Health)))]
async fn live() -> Json<Health> {
    Json(Health {
        status: "live".into(),
    })
}

#[utoipa::path(get, path = "/health/ready", responses((status = 200, body = Health), (status = 503, body = ErrorEnvelope)))]
async fn ready(State(store): State<Store>) -> Result<Json<Health>, ApiError> {
    if store.ready().await {
        Ok(Json(Health {
            status: "ready".into(),
        }))
    } else {
        Err(ApiError::status(StatusCode::SERVICE_UNAVAILABLE))
    }
}

#[derive(Serialize, ToSchema)]
pub struct Version {
    pub version: String,
}

#[utoipa::path(get, path = "/api/v1", security(("bearer" = [])), responses((status = 200, body = Version), (status = 401, body = ErrorEnvelope)))]
async fn version() -> Json<Version> {
    Json(Version {
        version: env!("CARGO_PKG_VERSION").into(),
    })
}

pub(super) fn json<T>(value: Result<Json<T>, JsonRejection>) -> Result<T, ApiError> {
    value.map(|Json(value)| value).map_err(|error| {
        if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
            ApiError::status(StatusCode::PAYLOAD_TOO_LARGE)
        } else {
            ApiError::validation("body must match the documented JSON schema")
        }
    })
}
pub(super) fn page(
    value: Result<Query<Pagination>, QueryRejection>,
) -> Result<Pagination, ApiError> {
    value
        .map(|Query(value)| value)
        .map_err(|_| ApiError::validation("invalid pagination query"))
}
pub(super) fn identifier(value: Result<Path<Uuid>, PathRejection>) -> Result<Uuid, ApiError> {
    value
        .map(|Path(value)| value)
        .map_err(|_| ApiError::validation("path identifier must be a UUID"))
}

#[utoipa::path(post, path = "/api/v1/habits", request_body = NewHabit, security(("bearer" = [])), responses((status = 201, body = Habit), (status = 401, body = ErrorEnvelope), (status = 403, body = ErrorEnvelope), (status = 413, body = ErrorEnvelope), (status = 422, body = ErrorEnvelope), (status = 503, body = ErrorEnvelope)))]
async fn create_habit(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    body: Result<Json<NewHabit>, JsonRejection>,
) -> Result<(StatusCode, Json<Habit>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(habits::create(&store, &actor, json(body)?).await?),
    ))
}

#[utoipa::path(get, path = "/api/v1/habits", params(("limit" = Option<u32>, Query, minimum = 1, maximum = 100), ("offset" = Option<u32>, Query, minimum = 0, maximum = 100000)), security(("bearer" = [])), responses((status = 200, body = HabitPage), (status = 401, body = ErrorEnvelope), (status = 403, body = ErrorEnvelope), (status = 422, body = ErrorEnvelope), (status = 503, body = ErrorEnvelope)))]
async fn list_habits(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    query: Result<Query<Pagination>, QueryRejection>,
) -> Result<Json<HabitPage>, ApiError> {
    Ok(Json(habits::list(&store, &actor, page(query)?).await?))
}

#[utoipa::path(post, path = "/api/v1/habits/{habit_id}/entries", params(("habit_id" = Uuid, Path), ("Idempotency-Key" = String, Header, description = "Required, 1..128 visible ASCII bytes, scoped to user")), request_body = NewEntry, security(("bearer" = [])), responses((status = 201, body = Entry), (status = 200, body = Entry, description = "Identical replay"), (status = 401, body = ErrorEnvelope), (status = 403, body = ErrorEnvelope), (status = 404, body = ErrorEnvelope), (status = 409, body = ErrorEnvelope), (status = 413, body = ErrorEnvelope), (status = 422, body = ErrorEnvelope), (status = 503, body = ErrorEnvelope)))]
async fn record_entry(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<NewEntry>, JsonRejection>,
) -> Result<(StatusCode, Json<Entry>), ApiError> {
    let key = headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ApiError::validation("Idempotency-Key is required"))?;
    let recorded = entries::record(
        &store,
        &actor,
        identifier(path)?,
        key,
        json(body)?,
        Utc::now(),
    )
    .await?;
    Ok((
        if recorded.created {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        },
        Json(recorded.entry),
    ))
}

#[utoipa::path(get, path = "/api/v1/habits/{habit_id}/entries", params(("habit_id" = Uuid, Path), ("limit" = Option<u32>, Query, minimum = 1, maximum = 100), ("offset" = Option<u32>, Query, minimum = 0, maximum = 100000)), security(("bearer" = [])), responses((status = 200, body = EntryPage), (status = 401, body = ErrorEnvelope), (status = 403, body = ErrorEnvelope), (status = 404, body = ErrorEnvelope), (status = 422, body = ErrorEnvelope), (status = 503, body = ErrorEnvelope)))]
async fn list_entries(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<Pagination>, QueryRejection>,
) -> Result<Json<EntryPage>, ApiError> {
    Ok(Json(
        entries::list(&store, &actor, identifier(path)?, page(query)?).await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/entries/{entry_id}", params(("entry_id" = Uuid, Path)), security(("bearer" = [])), responses((status = 200, body = Entry), (status = 401, body = ErrorEnvelope), (status = 403, body = ErrorEnvelope), (status = 404, body = ErrorEnvelope), (status = 422, body = ErrorEnvelope), (status = 503, body = ErrorEnvelope)))]
async fn get_entry(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<Json<Entry>, ApiError> {
    Ok(Json(entries::get(&store, &actor, identifier(path)?).await?))
}

#[utoipa::path(get, path = "/api/v1/openapi.json", security(("bearer" = [])), responses((status = 200, description = "OpenAPI JSON"), (status = 401, body = ErrorEnvelope)))]
async fn openapi() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}

struct Security;
impl Modify for Security {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer",
                SecurityScheme::Http(
                    HttpBuilder::new()
                        .scheme(HttpAuthScheme::Bearer)
                        .description(Some(
                            "Opaque PAT or service-account token; enable AUTH_MODE=tokens. Disabled mode refuses all private requests.",
                        ))
                        .build(),
                ),
            );
        }
    }
}

#[derive(OpenApi)]
#[openapi(info(title = "Habit Tracker", version = "0.1.0", description = "Configurable authentication: disabled rejects private requests; local accepts the default user PAT/service-account tokens; oidc verifies RFC 9068 access tokens and tenant-scoped PATs. Global errors: 429 rate limit, 504 deadline. Max JSON body: 16384 bytes."), paths(super::dashboard::setup, super::dashboard::snapshot, super::dashboard::presentation, super::dashboard::action, super::dashboard::events, live, ready, version, openapi, create_habit, list_habits, record_entry, list_entries, get_entry, super::auth::create, super::auth::list, super::auth::revoke, super::auth::rotate, super::auth::service, super::auth::revoke_service, super::tracking::habit, super::tracking::update, super::tracking::archive, super::tracking::versions, super::tracking::rests, super::tracking::rest, super::tracking::unrest, super::tracking::statistics, super::tracking::recalculate, super::tracking::correct, super::tracking::cancel, super::tracking::gamification, super::tracking::ledger, super::integrations::list, super::integrations::connect_ha, super::integrations::notify, super::integrations::authorize, super::integrations::mapping, super::integrations::sync, super::integrations::disconnect, super::integrations::job, super::integrations::callback, super::integrations::challenge, super::integrations::webhook), components(schemas(ErrorEnvelope, Health, Version, NewHabit, Habit, HabitPage, NewEntry, Entry, EntryPage)), modifiers(&Security))]
pub struct ApiDoc;

#[cfg(test)]
pub(super) fn test_router(store: Store) -> Router {
    // ONLY compiled by cargo test. Header maps to fixture identities, never in runtime.
    async fn fixture_auth(
        mut request: axum::extract::Request,
        next: middleware::Next,
    ) -> axum::response::Response {
        use crate::{infrastructure::database::tests::fixture_principal, modules::auth::Scope};
        use axum::response::IntoResponse;
        let Some(name) = request
            .headers()
            .get("x-test-user")
            .and_then(|v| v.to_str().ok())
        else {
            return ApiError::status(StatusCode::UNAUTHORIZED).into_response();
        };
        let mut actor = match name {
            "alice" | "readonly" => fixture_principal(1),
            "bob" => fixture_principal(2),
            _ => return ApiError::status(StatusCode::UNAUTHORIZED).into_response(),
        };
        if name == "readonly" {
            actor.scopes = vec![Scope::HabitsRead, Scope::EntriesRead];
        }
        request.extensions_mut().insert(actor);
        next.run(request).await
    }
    // Place test authentication inside the same request-id/error boundary.
    let private = private_routes().layer(middleware::from_fn(fixture_auth));
    Router::new()
        .merge(private)
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .fallback(|| async { ApiError::status(StatusCode::NOT_FOUND) })
        .with_state(store)
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(middleware::from_fn_with_state(
            TrafficBudget::default(),
            boundary,
        ))
}
