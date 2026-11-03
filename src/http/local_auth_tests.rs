#![allow(clippy::unwrap_used)]

use super::routes::{router, router_with_auth};
use crate::{
    config::AuthMode,
    infrastructure::database::tests::{Fixture, fixture_principal, habit_input},
    modules::auth::{NewToken, Scope},
};
use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
    key: Option<&str>,
) -> (StatusCode, Value) {
    let mut request = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    if let Some(key) = key {
        request = request.header("idempotency-key", key);
    }
    let body = match body {
        Some(value) => {
            request = request.header("content-type", "application/json");
            Body::from(value.to_string())
        }
        None => Body::empty(),
    };
    let response = app
        .clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap();
    let status = response.status();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let request_id = response.headers()["x-request-id"]
        .to_str()
        .unwrap()
        .to_owned();
    assert!(uuid::Uuid::parse_str(&request_id).is_ok());
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value = if status == StatusCode::NO_CONTENT {
        assert!(bytes.is_empty());
        Value::Null
    } else {
        serde_json::from_slice::<Value>(&bytes).unwrap()
    };
    if status.is_client_error() || status.is_server_error() {
        assert_eq!(value["error"]["request_id"], request_id);
    }
    (status, value)
}

#[tokio::test]
async fn dashboard_actions_and_sse_enforce_auth_scopes_and_revocation() {
    let fixture = Fixture::new().await;
    let foreign = fixture.habit().await;
    let admin = fixture.store.bootstrap_local("UTC").await.unwrap();
    let app = router_with_auth(fixture.store.clone(), AuthMode::Tokens);
    assert_eq!(
        call(&app, "GET", "/api/v1/dashboard", None, None, None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, created) = call(
        &app,
        "POST",
        "/api/v1/habits",
        Some(&admin.token),
        Some(serde_json::to_value(habit_input()).unwrap()),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let id = created["id"].as_str().unwrap();
    let actions = format!("/api/v1/habits/{id}/actions");
    assert_eq!(
        call(
            &app,
            "POST",
            &actions,
            Some(&admin.token),
            Some(json!({"action":"increment"})),
            None
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        call(
            &app,
            "PUT",
            &format!("/api/v1/habits/{}/presentation", foreign.id),
            Some(&admin.token),
            Some(json!({"step":250})),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let mut response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/dashboard/events")
                .header("authorization", format!("Bearer {}", admin.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["x-accel-buffering"], "no");
    let first = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        response.body_mut().frame(),
    )
    .await
    .unwrap()
    .unwrap()
    .unwrap()
    .into_data()
    .unwrap();
    assert!(
        std::str::from_utf8(&first)
            .unwrap()
            .contains("event: invalidate")
    );
    assert!(!std::str::from_utf8(&first).unwrap().contains(id));
    assert_eq!(
        call(
            &app,
            "POST",
            &actions,
            Some(&admin.token),
            Some(json!({"action":"increment"})),
            Some("sse-action")
        )
        .await
        .0,
        StatusCode::OK
    );
    let next = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        response.body_mut().frame(),
    )
    .await
    .unwrap()
    .unwrap()
    .unwrap()
    .into_data()
    .unwrap();
    assert_ne!(first, next);
    let (_, dashboard) = call(
        &app,
        "GET",
        "/api/v1/dashboard",
        Some(&admin.token),
        None,
        None,
    )
    .await;
    assert_eq!(dashboard["groups"][0]["habits"][0]["progress"], 1.0);
    assert!(!dashboard.to_string().contains(&foreign.id.to_string()));
    assert_eq!(
        call(
            &app,
            "DELETE",
            &format!("/api/v1/tokens/{}", admin.metadata.id),
            Some(&admin.token),
            None,
            None
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_secs(3),
            response.body_mut().frame()
        )
        .await
        .unwrap()
        .is_none()
    );
    let readonly = fixture
        .store
        .issue_local_token(
            admin.metadata.user_id,
            NewToken {
                scopes: vec![Scope::HabitsRead],
                expires_at: Utc::now() + Duration::hours(1),
                service_account_id: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        call(
            &app,
            "GET",
            "/api/v1/dashboard",
            Some(&readonly.token),
            None,
            None
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        call(
            &app,
            "POST",
            &actions,
            Some(&readonly.token),
            Some(json!({"action":"increment"})),
            Some("readonly-action")
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn habit_categories_round_trip_with_local_auth_and_legacy_default() {
    let fixture = Fixture::new().await;
    let foreign = fixture.habit().await;
    let admin = fixture.store.bootstrap_local("UTC").await.unwrap();
    let app = router_with_auth(fixture.store.clone(), AuthMode::Tokens);
    for category in [
        Some("nutrition"),
        Some("sport"),
        Some("mind"),
        Some("daily"),
        None,
    ] {
        let mut input = serde_json::to_value(habit_input()).unwrap();
        if let Some(category) = category {
            input["category"] = json!(category);
        } else {
            input.as_object_mut().unwrap().remove("category");
        }
        let (status, habit) = call(
            &app,
            "POST",
            "/api/v1/habits",
            Some(&admin.token),
            Some(input),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(habit["category"], category.unwrap_or("daily"));
        let path = format!("/api/v1/habits/{}", habit["id"].as_str().unwrap());
        assert_eq!(
            call(&app, "GET", &path, Some(&admin.token), None, None).await,
            (StatusCode::OK, habit)
        );
    }
    let (status, list) = call(
        &app,
        "GET",
        "/api/v1/habits",
        Some(&admin.token),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let items = list["items"].as_array().unwrap();
    assert_eq!(items.len(), 5);
    for category in ["nutrition", "sport", "mind", "daily"] {
        assert!(items.iter().any(|habit| habit["category"] == category));
    }
    assert!(
        items
            .iter()
            .all(|habit| habit["user_id"] == admin.metadata.user_id.0.to_string())
    );
    assert_eq!(
        call(
            &app,
            "GET",
            &format!("/api/v1/habits/{}", foreign.id),
            Some(&admin.token),
            None,
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn real_local_bearer_supports_tracking_and_idempotent_cancellation() {
    let fixture = Fixture::new().await;
    let provisioned = fixture.store.local_user("UTC").await.unwrap();
    let admin = fixture.store.bootstrap_local("Europe/Paris").await.unwrap();
    assert_eq!(admin.metadata.user_id, provisioned);
    let timezone: String = sqlx::query_scalar("SELECT timezone FROM users WHERE id = ?")
        .bind(provisioned.0.to_string())
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(timezone, "Europe/Paris");
    let app = router_with_auth(fixture.store.clone(), AuthMode::Tokens);
    assert_eq!(
        call(&app, "GET", "/api/v1/habits", None, None, None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            "GET",
            "/api/v1/habits",
            Some(&admin.token),
            None,
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, habit) = call(
        &app,
        "POST",
        "/api/v1/habits",
        Some(&admin.token),
        Some(serde_json::to_value(habit_input()).unwrap()),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(habit["user_id"], admin.metadata.user_id.0.to_string());
    let habit_id = habit["id"].as_str().unwrap();
    let occurred_at = Utc::now() - Duration::days(1);
    let payload = json!({"occurred_at": occurred_at, "value": 5000.0});
    let entries_path = format!("/api/v1/habits/{habit_id}/entries");
    let (status, entry) = call(
        &app,
        "POST",
        &entries_path,
        Some(&admin.token),
        Some(payload.clone()),
        Some("http-create"),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let entry_id = entry["id"].as_str().unwrap();
    let entry_path = format!("/api/v1/entries/{entry_id}");
    let (status, replay) = call(
        &app,
        "POST",
        &entries_path,
        Some(&admin.token),
        Some(payload),
        Some("http-create"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(replay["id"], entry_id);
    let stats_path = format!("/api/v1/habits/{habit_id}/statistics");
    let (status, stats) = call(&app, "GET", &stats_path, Some(&admin.token), None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(stats["xp"], 10);
    let correction = json!({"occurred_at": occurred_at, "value": 2500.0});
    let (status, corrected) = call(
        &app,
        "PUT",
        &entry_path,
        Some(&admin.token),
        Some(correction.clone()),
        Some("http-correct"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(corrected["value"], 2500.0);
    assert_eq!(
        call(
            &app,
            "PUT",
            &entry_path,
            Some(&admin.token),
            Some(correction),
            Some("http-correct")
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "GET", &stats_path, Some(&admin.token), None, None)
            .await
            .1["xp"],
        0
    );
    for _ in 0..2 {
        assert_eq!(
            call(
                &app,
                "DELETE",
                &entry_path,
                Some(&admin.token),
                None,
                Some("http-cancel")
            )
            .await,
            (StatusCode::NO_CONTENT, Value::Null)
        );
    }
    assert_eq!(
        call(&app, "GET", &entry_path, Some(&admin.token), None, None)
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert!(
        call(&app, "GET", &entries_path, Some(&admin.token), None, None)
            .await
            .1["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        call(&app, "GET", &stats_path, Some(&admin.token), None, None)
            .await
            .1["xp"],
        0
    );
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(fixture.count("entry_events").await, 3);
    assert_eq!(fixture.count("xp_ledger").await, 2);
}

#[tokio::test]
async fn real_http_tokens_enforce_scopes_and_revocation() {
    let fixture = Fixture::new().await;
    let admin = fixture.store.bootstrap_local("Europe/Paris").await.unwrap();
    let app = router_with_auth(fixture.store.clone(), AuthMode::Tokens);
    let (status, issued) = call(&app, "POST", "/api/v1/tokens", Some(&admin.token), Some(json!({"scopes":["habits:read"], "expires_at": Utc::now() + Duration::hours(1), "service_account_id": null})), None).await;
    assert_eq!(status, StatusCode::CREATED);
    let readonly = issued["token"].as_str().unwrap();
    assert_eq!(
        issued["metadata"]["user_id"],
        admin.metadata.user_id.0.to_string()
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/habits", Some(readonly), None, None)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/habits",
            Some(readonly),
            Some(serde_json::to_value(habit_input()).unwrap()),
            None
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let id = issued["metadata"]["id"].as_str().unwrap();
    assert_eq!(
        call(
            &app,
            "DELETE",
            &format!("/api/v1/tokens/{id}"),
            Some(&admin.token),
            None,
            None
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, "GET", "/api/v1/habits", Some(readonly), None, None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            "GET",
            "/api/v1/habits",
            Some(&admin.token),
            None,
            None
        )
        .await
        .0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn local_auth_ignores_forged_identity_headers_and_rejects_other_valid_users() {
    let fixture = Fixture::new().await;
    let admin = fixture.store.bootstrap_local("Europe/Paris").await.unwrap();
    let local_id = admin.metadata.user_id;
    assert_eq!(
        fixture.store.local_user("Europe/Paris").await.unwrap(),
        local_id
    );
    assert!(fixture.store.bootstrap_local("Europe/Paris").await.is_err());
    assert_eq!(fixture.store.local_user("UTC").await.unwrap(), local_id);
    let app = router_with_auth(fixture.store.clone(), AuthMode::Tokens);
    for token in [None, Some(admin.token.as_str())] {
        let mut request = Request::builder()
            .method("POST")
            .uri("/api/v1/habits")
            .header("content-type", "application/json")
            .header("x-test-user", "bob")
            .header("x-user-id", fixture_principal(2).user_id.0.to_string());
        if let Some(token) = token {
            request = request.header("authorization", format!("Bearer {token}"));
        }
        let response = app
            .clone()
            .oneshot(
                request
                    .body(Body::from(serde_json::to_string(&habit_input()).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let expected = if token.is_some() {
            StatusCode::CREATED
        } else {
            StatusCode::UNAUTHORIZED
        };
        assert_eq!(response.status(), expected);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        if token.is_some() {
            assert_eq!(body["user_id"], local_id.0.to_string());
            assert_ne!(body["user_id"], fixture_principal(2).user_id.0.to_string());
        }
    }
    let foreign = fixture
        .store
        .issue_local_token(
            fixture_principal(2).user_id,
            NewToken {
                scopes: Scope::all(),
                expires_at: Utc::now() + Duration::hours(1),
                service_account_id: None,
            },
        )
        .await
        .unwrap();
    assert!(
        fixture
            .store
            .authenticate_token(&foreign.token)
            .await
            .is_ok()
    );
    assert_eq!(
        call(
            &app,
            "GET",
            "/api/v1/habits",
            Some(&foreign.token),
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(fixture.count("habits").await, 1);
}

#[tokio::test]
async fn disabled_runtime_rejects_even_a_valid_bootstrapped_bearer() {
    let fixture = Fixture::new().await;
    let admin = fixture.store.bootstrap_local("Europe/Paris").await.unwrap();
    assert!(
        fixture
            .store
            .authenticate_local_token(&admin.token)
            .await
            .is_ok()
    );
    let app = router(fixture.store.clone());
    for path in ["/api/v1", "/api/v1/habits", "/api/v1/openapi.json"] {
        assert_eq!(
            call(&app, "GET", path, Some(&admin.token), None, None)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        call(&app, "GET", "/health/live", None, None, None).await.0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "GET", "/health/ready", None, None, None).await.0,
        StatusCode::OK
    );
}
