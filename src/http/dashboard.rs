use super::{
    middleware::{ApiError, ErrorEnvelope, StreamIdentity},
    routes::{identifier, json},
};
use crate::{
    infrastructure::database::Store,
    modules::{
        auth::{Principal, Scope},
        habits::presentation::{ActionReceipt, ActionRequest, Presentation},
        statistics::dashboard::Dashboard,
    },
};
use axum::{
    Extension, Json, Router,
    extract::{
        Path, State,
        rejection::{JsonRejection, PathRejection},
    },
    http::{HeaderMap, StatusCode},
    response::{
        IntoResponse, Sse,
        sse::{Event, KeepAlive},
    },
    routing::{get, post, put},
};
use std::{convert::Infallible, time::Duration};
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

pub(super) fn routes() -> Router<Store> {
    Router::new()
        .route("/api/v1/dashboard", get(snapshot))
        .route("/api/v1/dashboard/events", get(events))
        .route("/api/v1/habits/{habit_id}/presentation", put(presentation))
        .route("/api/v1/habits/{habit_id}/actions", post(action))
}

#[utoipa::path(get, path="/api/v1/dashboard", security(("bearer"=[])), responses((status=200,body=Dashboard),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=422,body=ErrorEnvelope)))]
pub(super) async fn snapshot(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
) -> Result<Json<Dashboard>, ApiError> {
    Ok(Json(store.dashboard(&actor).await?))
}
#[utoipa::path(put, path="/api/v1/habits/{habit_id}/presentation", params(("habit_id"=Uuid,Path)), request_body=Presentation, security(("bearer"=[])), responses((status=200,body=Presentation),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope),(status=422,body=ErrorEnvelope)))]
pub(super) async fn presentation(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    body: Result<Json<Presentation>, JsonRejection>,
) -> Result<Json<Presentation>, ApiError> {
    Ok(Json(
        store
            .set_presentation(&actor, identifier(path)?, json(body)?)
            .await?,
    ))
}
#[utoipa::path(post, path="/api/v1/habits/{habit_id}/actions", params(("habit_id"=Uuid,Path),("Idempotency-Key"=String,Header)), request_body=ActionRequest, security(("bearer"=[])), responses((status=200,body=ActionReceipt),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope),(status=409,body=ErrorEnvelope),(status=422,body=ErrorEnvelope)))]
pub(super) async fn action(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<ActionRequest>, JsonRejection>,
) -> Result<Json<ActionReceipt>, ApiError> {
    let key = headers
        .get("idempotency-key")
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| ApiError::validation("Idempotency-Key is required"))?;
    Ok(Json(
        store
            .habit_action(&actor, identifier(path)?, key, json(body)?)
            .await?,
    ))
}
#[utoipa::path(get, path="/api/v1/dashboard/events", security(("bearer"=[])), responses((status=200,description="SSE invalidation; authenticated header, reconnect and GET dashboard",body=String,content_type="text/event-stream"),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=429,body=ErrorEnvelope)))]
pub(super) async fn events(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    Extension(identity): Extension<StreamIdentity>,
) -> Result<axum::response::Response, ApiError> {
    actor.require(Scope::HabitsRead)?;
    actor.require(Scope::StatisticsRead)?;
    let permit = store
        .streams
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::status(StatusCode::TOO_MANY_REQUESTS))?;
    let (sender, receiver) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(1);
    tokio::spawn(async move {
        let _permit = permit;
        let mut last = None;
        let mut timer = tokio::time::interval(Duration::from_secs(1));
        for _ in 0..300 {
            tokio::select! { _ = sender.closed() => break, _ = timer.tick() => {} }
            let valid = identity.verify().await.is_ok_and(|p| {
                p.user_id == actor.user_id
                    && p.require(Scope::HabitsRead).is_ok()
                    && p.require(Scope::StatisticsRead).is_ok()
            });
            if !valid {
                break;
            }
            let Ok(revision) = store.dashboard_revision(actor.user_id).await else {
                break;
            };
            let marker = (revision, chrono::Utc::now().timestamp() / 60);
            if last == Some(marker) {
                continue;
            }
            let event = Event::default()
                .event("invalidate")
                .data(format!("{revision}:{}", marker.1));
            match sender.try_send(Ok(event)) {
                Ok(()) => last = Some(marker),
                Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => break,
                Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {}
            }
        }
    });
    let mut response = Sse::new(ReceiverStream::new(receiver))
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
        .into_response();
    response.headers_mut().insert(
        "x-accel-buffering",
        axum::http::HeaderValue::from_static("no"),
    );
    Ok(response)
}
