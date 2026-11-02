#![allow(clippy::unwrap_used, clippy::expect_used)]
use super::routes::{ApiDoc, router, test_router};
use crate::infrastructure::database::tests::Fixture;
use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use utoipa::OpenApi;

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    actor: Option<&str>,
    body: Option<Value>,
    key: Option<&str>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(actor) = actor {
        builder = builder.header("x-test-user", actor);
    }
    if let Some(key) = key {
        builder = builder.header("Idempotency-Key", key);
    }
    let body = if let Some(body) = body {
        builder = builder.header("content-type", "application/json");
        Body::from(body.to_string())
    } else {
        Body::empty()
    };
    let response = app
        .clone()
        .oneshot(builder.body(body).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let id = response
        .headers()
        .get("x-request-id")
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();
    assert!(uuid::Uuid::parse_str(&id).is_ok());
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value: Value = serde_json::from_slice(&bytes).unwrap();
    if status.is_client_error() || status.is_server_error() {
        assert_eq!(value["error"]["request_id"], id);
    }
    (status, value)
}
fn habit() -> Value {
    serde_json::from_str(include_str!("../../tests/fixtures/habit.json")).unwrap()
}
fn entry() -> Value {
    serde_json::from_str(include_str!("../../tests/fixtures/entry.json")).unwrap()
}

#[tokio::test]
async fn production_refuses_all_identity_bypasses_and_keeps_health_public() {
    let fixture = Fixture::new().await;
    let app = router(fixture.store.clone());
    for path in ["/api/v1", "/api/v1/openapi.json", "/api/v1/habits"] {
        assert_eq!(
            call(&app, "GET", path, None, None, None).await.0,
            StatusCode::UNAUTHORIZED
        );
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header("authorization", "Bearer arbitrary-access-or-id-token")
                    .header("x-user-id", "1")
                    .header("x-test-user", "alice")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(response.headers()["www-authenticate"], "Bearer");
    }
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/habits",
            Some("alice"),
            Some(habit()),
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(&app, "GET", "/health/live", None, None, None).await.0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "GET", "/health/ready", None, None, None).await.0,
        StatusCode::OK
    );
    fixture.store.close().await;
    assert_eq!(
        call(&app, "GET", "/health/ready", None, None, None).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        call(&app, "GET", "/health/live", None, None, None).await.0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn vertical_http_flow_isolates_habits_and_entries() {
    let fixture = Fixture::new().await;
    let app = test_router(fixture.store.clone());
    let (status, h) = call(
        &app,
        "POST",
        "/api/v1/habits",
        Some("alice"),
        Some(habit()),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let id = h["id"].as_str().unwrap();
    let (_, own) = call(
        &app,
        "GET",
        "/api/v1/habits?limit=1",
        Some("alice"),
        None,
        None,
    )
    .await;
    assert_eq!(own["items"].as_array().unwrap().len(), 1);
    let (_, other) = call(&app, "GET", "/api/v1/habits", Some("bob"), None, None).await;
    assert_eq!(other["items"], json!([]));
    let path = format!("/api/v1/habits/{id}/entries");
    assert_eq!(
        call(
            &app,
            "POST",
            &path,
            Some("bob"),
            Some(entry()),
            Some("event-1")
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (status, e) = call(
        &app,
        "POST",
        &path,
        Some("alice"),
        Some(entry()),
        Some("event-1"),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let (status, replay) = call(
        &app,
        "POST",
        &path,
        Some("alice"),
        Some(entry()),
        Some("event-1"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(e, replay);
    let mut changed = entry();
    changed["value"] = json!(1000);
    assert_eq!(
        call(
            &app,
            "POST",
            &path,
            Some("alice"),
            Some(changed),
            Some("event-1")
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let resource = format!("/api/v1/entries/{}", e["id"].as_str().unwrap());
    assert_eq!(
        call(&app, "GET", &resource, Some("alice"), None, None)
            .await
            .1,
        e
    );
    assert_eq!(
        call(&app, "GET", &resource, Some("bob"), None, None)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, "GET", &path, Some("bob"), None, None).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, "GET", &path, Some("alice"), None, None).await.1["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(fixture.count("entry_events").await, 1);
    assert_eq!(fixture.count("xp_ledger").await, 1);
}

#[tokio::test]
async fn http_validation_scopes_body_limit_and_uniform_errors() {
    let fixture = Fixture::new().await;
    let app = test_router(fixture.store.clone());
    for patch in [
        json!({"timezone":"invalid"}),
        json!({"name":""}),
        json!({"target":-1}),
        json!({"user_id":"spoof"}),
        json!({"kind":"duration","unit":"meters"}),
        json!({"schedule":{"weekdays":[1,1],"start":null,"end":null}}),
    ] {
        let mut input = habit();
        for (key, value) in patch.as_object().unwrap() {
            input[key] = value.clone();
        }
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/habits",
                Some("alice"),
                Some(input),
                None
            )
            .await
            .0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/habits",
            Some("readonly"),
            Some(habit()),
            None
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    for path in [
        "/api/v1/habits?limit=0",
        "/api/v1/habits?offset=100001",
        "/api/v1/habits?unknown=1",
        "/api/v1/entries/invalid-uuid",
    ] {
        assert_eq!(
            call(&app, "GET", path, Some("alice"), None, None).await.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    let h = fixture.habit().await;
    let path = format!("/api/v1/habits/{}/entries", h.id);
    assert_eq!(
        call(&app, "POST", &path, Some("alice"), Some(entry()), None)
            .await
            .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        call(
            &app,
            "POST",
            &path,
            Some("readonly"),
            Some(entry()),
            Some("scope")
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let mut no_offset = entry();
    no_offset["occurred_at"] = json!("2026-03-29T02:30:00");
    assert_eq!(
        call(
            &app,
            "POST",
            &path,
            Some("alice"),
            Some(no_offset),
            Some("dst")
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let mut huge = habit();
    huge["name"] = json!("x".repeat(17000));
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/habits",
            Some("alice"),
            Some(huge),
            None
        )
        .await
        .0,
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(
        call(&app, "GET", "/missing", None, None, None).await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(&app, "DELETE", "/api/v1/habits", Some("alice"), None, None)
            .await
            .0,
        StatusCode::METHOD_NOT_ALLOWED
    );
}

#[tokio::test]
async fn rate_budget_is_bounded_and_returns_retry_after() {
    let fixture = Fixture::new().await;
    let app = router(fixture.store.clone());
    for _ in 0..120 {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/health/live")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
    let response = app
        .oneshot(
            Request::builder()
                .uri("/health/live")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(response.headers()["retry-after"], "1");
}

#[test]
fn openapi_documents_routes_security_and_request_schemas() {
    let document = serde_json::to_value(ApiDoc::openapi()).unwrap();
    for (path, item) in document["paths"].as_object().unwrap() {
        for operation in item
            .as_object()
            .unwrap()
            .values()
            .filter(|value| value.get("responses").is_some())
        {
            if path.starts_with("/api/") {
                assert!(operation["security"][0]["bearer"].is_array(), "{path}");
            }
        }
    }
    assert!(
        document["components"]["schemas"]["NewHabit"]["required"]
            .as_array()
            .unwrap()
            .contains(&json!("timezone"))
    );
    assert_eq!(
        document["components"]["schemas"]["NewEntry"]["additionalProperties"],
        false
    );
    assert!(
        document["paths"]["/api/v1/habits/{habit_id}/entries"]["post"]["responses"]["409"]
            .is_object()
    );
}
