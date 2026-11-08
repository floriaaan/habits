use super::{
    middleware::{ApiError, ErrorEnvelope},
    routes::{identifier, json, page},
};
use crate::{
    infrastructure::database::Store,
    modules::{
        auth::Principal,
        entries::{Entry, NewEntry},
        gamification::{Gamification, LedgerPage},
        habits::{Habit, HabitVersion, Pagination, UpdateHabit},
        schedules::RestException,
        statistics::HabitStatistics,
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
use chrono::NaiveDate;
use uuid::Uuid;

pub(super) fn routes() -> Router<Store> {
    Router::new()
        .route(
            "/api/v1/habits/{habit_id}",
            get(habit).put(update).delete(archive),
        )
        .route("/api/v1/habits/{habit_id}/versions", get(versions))
        .route("/api/v1/habits/{habit_id}/exceptions", get(rests))
        .route(
            "/api/v1/habits/{habit_id}/exceptions/{date}",
            put(rest).delete(unrest),
        )
        .route("/api/v1/habits/{habit_id}/statistics", get(statistics))
        .route("/api/v1/habits/{habit_id}/recalculate", post(recalculate))
        .route("/api/v1/gamification", get(gamification))
        .route("/api/v1/gamification/ledger", get(ledger))
}
pub(super) fn entry_routes() -> Router<Store> {
    Router::new().route("/api/v1/entries/{entry_id}", put(correct).delete(cancel))
}

fn key(headers: &HeaderMap) -> Result<&str, ApiError> {
    headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ApiError::validation("Idempotency-Key is required"))
}
fn rest_path(
    path: Result<Path<(Uuid, NaiveDate)>, PathRejection>,
) -> Result<(Uuid, NaiveDate), ApiError> {
    path.map(|Path(p)| p)
        .map_err(|_| ApiError::validation("habit UUID and ISO date are required"))
}

#[utoipa::path(get,path="/api/v1/habits/{habit_id}",params(("habit_id"=Uuid,Path)),security(("bearer"=[])),responses((status=200,body=Habit),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn habit(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<Json<Habit>, ApiError> {
    Ok(Json(store.get_habit(&actor, identifier(path)?).await?))
}
#[utoipa::path(put,path="/api/v1/habits/{habit_id}",params(("habit_id"=Uuid,Path)),request_body=UpdateHabit,security(("bearer"=[])),responses((status=201,body=HabitVersion),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope),(status=409,body=ErrorEnvelope),(status=422,body=ErrorEnvelope)))]
pub(super) async fn update(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    body: Result<Json<UpdateHabit>, JsonRejection>,
) -> Result<(StatusCode, Json<HabitVersion>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(
            store
                .update_habit(&actor, identifier(path)?, json(body)?)
                .await?,
        ),
    ))
}
#[utoipa::path(delete,path="/api/v1/habits/{habit_id}",params(("habit_id"=Uuid,Path)),security(("bearer"=[])),responses((status=204,description="Archive habit, preserving history"),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn archive(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    store.archive_habit(&actor, identifier(path)?).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/habits/{habit_id}/versions",params(("habit_id"=Uuid,Path),("limit"=Option<u32>,Query),("offset"=Option<u32>,Query)),security(("bearer"=[])),responses((status=200,body=Vec<HabitVersion>),(status=401,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn versions(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<Pagination>, QueryRejection>,
) -> Result<Json<Vec<HabitVersion>>, ApiError> {
    Ok(Json(
        store
            .versions(&actor, identifier(path)?, page(query)?)
            .await?,
    ))
}
#[utoipa::path(get,path="/api/v1/habits/{habit_id}/exceptions",params(("habit_id"=Uuid,Path),("limit"=Option<u32>,Query),("offset"=Option<u32>,Query)),security(("bearer"=[])),responses((status=200,body=Vec<RestException>),(status=401,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn rests(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<Pagination>, QueryRejection>,
) -> Result<Json<Vec<RestException>>, ApiError> {
    Ok(Json(
        store.rests(&actor, identifier(path)?, page(query)?).await?,
    ))
}
#[utoipa::path(put,path="/api/v1/habits/{habit_id}/exceptions/{date}",params(("habit_id"=Uuid,Path),("date"=NaiveDate,Path)),security(("bearer"=[])),responses((status=204),(status=401,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn rest(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<(Uuid, NaiveDate)>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    let (id, date) = rest_path(path)?;
    store.set_rest(&actor, id, date, true).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(delete,path="/api/v1/habits/{habit_id}/exceptions/{date}",params(("habit_id"=Uuid,Path),("date"=NaiveDate,Path)),security(("bearer"=[])),responses((status=204),(status=401,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn unrest(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<(Uuid, NaiveDate)>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    let (id, date) = rest_path(path)?;
    store.set_rest(&actor, id, date, false).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/habits/{habit_id}/statistics",params(("habit_id"=Uuid,Path)),security(("bearer"=[])),responses((status=200,body=HabitStatistics),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn statistics(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<Json<HabitStatistics>, ApiError> {
    Ok(Json(store.statistics(&actor, identifier(path)?).await?))
}
#[utoipa::path(post,path="/api/v1/habits/{habit_id}/recalculate",params(("habit_id"=Uuid,Path)),security(("bearer"=[])),responses((status=204),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope)))]
pub(super) async fn recalculate(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    store.recalculate(&actor, identifier(path)?).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(put,path="/api/v1/entries/{entry_id}",params(("entry_id"=Uuid,Path),("Idempotency-Key"=String,Header)),request_body=NewEntry,security(("bearer"=[])),responses((status=200,body=Entry),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope),(status=409,body=ErrorEnvelope),(status=422,body=ErrorEnvelope)))]
pub(super) async fn correct(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<NewEntry>, JsonRejection>,
) -> Result<Json<Entry>, ApiError> {
    Ok(Json(
        store
            .change_entry(&actor, identifier(path)?, key(&headers)?, Some(json(body)?))
            .await?,
    ))
}
#[utoipa::path(delete,path="/api/v1/entries/{entry_id}",params(("entry_id"=Uuid,Path),("Idempotency-Key"=String,Header)),security(("bearer"=[])),responses((status=204),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope),(status=404,body=ErrorEnvelope),(status=409,body=ErrorEnvelope)))]
pub(super) async fn cancel(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    path: Result<Path<Uuid>, PathRejection>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    store
        .change_entry(&actor, identifier(path)?, key(&headers)?, None)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/gamification",security(("bearer"=[])),responses((status=200,body=Gamification),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope)))]
pub(super) async fn gamification(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
) -> Result<Json<Gamification>, ApiError> {
    Ok(Json(store.gamification(&actor).await?))
}
#[utoipa::path(get,path="/api/v1/gamification/ledger",params(("limit"=Option<u32>,Query),("offset"=Option<u32>,Query)),security(("bearer"=[])),responses((status=200,body=LedgerPage),(status=401,body=ErrorEnvelope),(status=403,body=ErrorEnvelope)))]
pub(super) async fn ledger(
    State(store): State<Store>,
    Extension(actor): Extension<Principal>,
    query: Result<Query<Pagination>, QueryRejection>,
) -> Result<Json<LedgerPage>, ApiError> {
    Ok(Json(store.ledger(&actor, page(query)?).await?))
}
