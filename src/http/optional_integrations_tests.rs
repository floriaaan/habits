#![allow(clippy::unwrap_used)]

use super::routes::{router_with_auth, router_with_integrations};
use crate::{
    config::AuthMode,
    infrastructure::{
        database::{
            Store,
            tests::{Fixture, habit_input},
        },
        integrations::{IntegrationRuntime, StravaConfig},
        security::{cipher::SecretCipher, token_hash},
    },
};
use axum::{
    Form, Json, Router,
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    routing::post,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use reqwest::Url;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

const WEBHOOK_PATH_TOKEN: &str = "test_only_strava_webhook_path_000000000001";
const VERIFY_TOKEN: &str = "test-only-verification-token";

fn runtime(store: Store, base: Option<Url>) -> Arc<IntegrationRuntime> {
    Arc::new(IntegrationRuntime {
        store,
        cipher: Some(Arc::new(
            SecretCipher::new(&STANDARD.encode([97_u8; 32]), "http-test-key".into()).unwrap(),
        )),
        ha_url: None,
        strava: base.map(|base| StravaConfig {
            client_id: "test-client-id".into(),
            client_secret: "test-only-client-secret".into(),
            redirect_uri: Url::parse("https://callback.invalid/integrations/strava/callback")
                .unwrap(),
            verify_token: VERIFY_TOKEN.into(),
            path_token: WEBHOOK_PATH_TOKEN.into(),
            subscription: Some(456),
            capacity: 1,
            api: base.clone(),
            oauth: base,
        }),
        client: reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .unwrap(),
    })
}

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut request = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        request = request.header("authorization", format!("Bearer {token}"));
    }
    let body = match body {
        Some(body) => {
            request = request.header("content-type", "application/json");
            Body::from(body.to_string())
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
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice::<Value>(&bytes).unwrap()
    };
    if status.is_client_error() || status.is_server_error() {
        assert_eq!(body["error"]["request_id"], request_id);
    }
    (status, body)
}

use tower::ServiceExt;

type Exchanges = Arc<Mutex<Vec<HashMap<String, String>>>>;

async fn exchange(
    State(exchanges): State<Exchanges>,
    Form(form): Form<HashMap<String, String>>,
) -> Json<Value> {
    exchanges.lock().unwrap().push(form);
    Json(json!({
        "access_token": "test-only-strava-access-token",
        "refresh_token": "test-only-strava-refresh-token",
        "expires_at": (Utc::now() + Duration::hours(1)).timestamp(),
        "athlete": {"id":123}
    }))
}

#[tokio::test]
async fn oauth_state_is_hashed_single_use_and_callback_exchanges_code_offline() {
    let fixture = Fixture::new().await;
    let admin = fixture.store.bootstrap_local("Europe/Paris").await.unwrap();
    let exchanges: Exchanges = Arc::new(Mutex::new(Vec::new()));
    let provider = Router::new()
        .route("/token", post(exchange))
        .with_state(exchanges.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, provider).await.unwrap();
    });
    let rt = runtime(fixture.store.clone(), Some(base));
    let app = router_with_integrations(fixture.store.clone(), AuthMode::Tokens, rt.clone());
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/integrations/strava/authorize",
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, authorization) = call(
        &app,
        "POST",
        "/api/v1/integrations/strava/authorize",
        Some(&admin.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let authorization = Url::parse(authorization["authorization_url"].as_str().unwrap()).unwrap();
    let params: HashMap<_, _> = authorization.query_pairs().into_owned().collect();
    assert_eq!(params["client_id"], "test-client-id");
    assert_eq!(params["scope"], "activity:read");
    assert_eq!(
        params["redirect_uri"],
        "https://callback.invalid/integrations/strava/callback"
    );
    let state = &params["state"];
    let stored: (Vec<u8>, String) = sqlx::query_as("SELECT state_hash, user_id FROM oauth_states")
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(stored.0, token_hash(state));
    assert_ne!(stored.0, state.as_bytes());
    assert_eq!(stored.1, admin.metadata.user_id.0.to_string());
    let callback =
        format!("/integrations/strava/callback?state={state}&code=test-code&scope=activity:read");
    let (status, connected) = call(&app, "GET", &callback, None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(connected["provider"], "strava");
    assert_eq!(connected["connected"], true);
    let integration = fixture
        .store
        .integration_id(admin.metadata.user_id, "strava")
        .await
        .unwrap();
    let credentials = fixture
        .store
        .credentials(
            admin.metadata.user_id,
            integration,
            "strava",
            rt.cipher.as_deref().unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(credentials.access_token, "test-only-strava-access-token");
    assert_eq!(
        credentials.refresh_token.as_deref(),
        Some("test-only-strava-refresh-token")
    );
    assert_eq!(
        fixture.store.webhook_integration(123).await.unwrap(),
        (admin.metadata.user_id, integration)
    );
    assert_eq!(
        call(&app, "GET", &callback, None, None).await.0,
        StatusCode::UNAUTHORIZED
    );
    let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM oauth_states")
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(remaining, 0);
    {
        let exchanges = exchanges.lock().unwrap();
        assert_eq!(exchanges.len(), 1);
        assert_eq!(exchanges[0]["client_id"], "test-client-id");
        assert_eq!(exchanges[0]["client_secret"], "test-only-client-secret");
        assert_eq!(exchanges[0]["grant_type"], "authorization_code");
        assert_eq!(exchanges[0]["code"], "test-code");
    }
    server.abort();
}

#[tokio::test]
async fn webhook_challenge_and_events_validate_protocol_and_enqueue_only_minimal_payloads() {
    let fixture = Fixture::new().await;
    let admin = fixture.store.bootstrap_local("Europe/Paris").await.unwrap();
    // No request reaches this URL: challenge and event acknowledgement are local.
    let rt = runtime(
        fixture.store.clone(),
        Some(Url::parse("http://127.0.0.1:1/").unwrap()),
    );
    let credentials = crate::infrastructure::integrations::Credentials {
        access_token: "test-only-access".into(),
        refresh_token: Some("test-only-refresh".into()),
        expires_at: Some((Utc::now() + Duration::hours(1)).timestamp()),
        revision: 0,
    };
    let integration = fixture
        .store
        .connect_integration(
            admin.metadata.user_id,
            "strava",
            "123",
            &credentials,
            rt.cipher.as_deref().unwrap(),
            1,
        )
        .await
        .unwrap();
    let app = router_with_integrations(fixture.store.clone(), AuthMode::Tokens, rt);
    let webhook = format!("/integrations/strava/webhook/{WEBHOOK_PATH_TOKEN}");
    let challenge = format!(
        "{webhook}?hub.mode=subscribe&hub.verify_token={VERIFY_TOKEN}&hub.challenge=offline-challenge"
    );
    assert_eq!(
        call(&app, "GET", &challenge, None, None).await,
        (StatusCode::OK, json!({"hub.challenge":"offline-challenge"}))
    );
    assert_eq!(
        call(
            &app,
            "GET",
            &challenge.replace(VERIFY_TOKEN, "wrong-token"),
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &app,
            "GET",
            &challenge.replace(WEBHOOK_PATH_TOKEN, "wrong-path"),
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let event = json!({"object_type":"activity", "aspect_type":"update", "object_id":789, "owner_id":123, "subscription_id":456, "event_time":Utc::now().timestamp(), "updates":{"title":"private-provider-title", "other":"must-not-be-retained"}});
    assert_eq!(
        call(
            &app,
            "POST",
            &webhook.replace(WEBHOOK_PATH_TOKEN, "wrong-path"),
            None,
            Some(event.clone())
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let mut invalid = event.clone();
    invalid["subscription_id"] = json!(999);
    assert_eq!(
        call(&app, "POST", &webhook, None, Some(invalid)).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    for _ in 0..2 {
        assert_eq!(
            call(&app, "POST", &webhook, None, Some(event.clone())).await,
            (StatusCode::OK, Value::Null)
        );
    }
    let jobs: Vec<(String, String, String)> =
        sqlx::query_as("SELECT user_id, integration_id, payload FROM jobs")
            .fetch_all(&fixture.store.pool)
            .await
            .unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].0, admin.metadata.user_id.0.to_string());
    assert_eq!(jobs[0].1, integration.to_string());
    assert!(!jobs[0].2.contains("private-provider-title"));
    assert!(!jobs[0].2.contains("must-not-be-retained"));
    let minimal: Value = serde_json::from_str(&jobs[0].2).unwrap();
    assert!(minimal["updates"].is_null());
    assert_eq!(minimal["object_id"], 789);
    assert_eq!(minimal["owner_id"], 123);
    let mut unknown = event;
    unknown["owner_id"] = json!(999);
    assert_eq!(
        call(&app, "POST", &webhook, None, Some(unknown)).await.0,
        StatusCode::OK
    );
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn unavailable_optional_providers_return_503_without_disabling_manual_habits() {
    let fixture = Fixture::new().await;
    let admin = fixture.store.bootstrap_local("Europe/Paris").await.unwrap();
    let apps = [
        router_with_auth(fixture.store.clone(), AuthMode::Tokens),
        router_with_integrations(
            fixture.store.clone(),
            AuthMode::Tokens,
            runtime(fixture.store.clone(), None),
        ),
    ];
    for app in apps {
        for (method, path, body) in [
            ("POST", "/api/v1/integrations/strava/authorize", None),
            ("POST", "/api/v1/integrations/strava/sync", None),
            (
                "PUT",
                "/api/v1/integrations/home-assistant",
                Some(json!({"token":"test-only-ha-token"})),
            ),
            (
                "POST",
                "/api/v1/integrations/home-assistant/notifications",
                Some(json!({"title":"offline", "message":"provider disabled"})),
            ),
        ] {
            assert_eq!(
                call(&app, method, path, Some(&admin.token), body).await.0,
                StatusCode::SERVICE_UNAVAILABLE
            );
        }
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/habits",
                Some(&admin.token),
                Some(serde_json::to_value(habit_input()).unwrap())
            )
            .await
            .0,
            StatusCode::CREATED
        );
    }
    assert_eq!(fixture.count("habits").await, 2);
}
