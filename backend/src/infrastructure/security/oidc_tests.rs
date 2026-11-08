#![allow(clippy::unwrap_used)]

use super::*;
use axum::{Json, Router, extract::State, http::StatusCode, routing::get};
use chrono::Utc;
use jsonwebtoken::{EncodingKey, Header, encode};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex as StdMutex,
    atomic::{AtomicU16, AtomicUsize, Ordering},
};

// Generated Ed25519 private keys are PUBLIC TEST FIXTURES, never runtime secrets.
const TEST_PRIVATE_1: &[u8] = b"-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIMBZERiguawoHCU49PHjfI2NgVmunAe3Nw74Q1tSRPxa
-----END PRIVATE KEY-----
";
const TEST_PUBLIC_1: &str = "Ek9feW5RjdaaTMS2E3cstJsxDYBAurih848Hrh4AQoQ";
const TEST_PRIVATE_2: &[u8] = b"-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIOcWP9Zl5CvGh94X/RbsZcIOX/1r4EnQWeYesxK2lMvK
-----END PRIVATE KEY-----
";
const TEST_PUBLIC_2: &str = "y_6fCljsCxR5D4MHhUgvsuMylg7HpQbU-h7CPgpHv5Y";

#[derive(Clone)]
struct Provider {
    body: Arc<StdMutex<Value>>,
    status: Arc<AtomicU16>,
    requests: Arc<AtomicUsize>,
}
struct Server {
    url: Url,
    provider: Provider,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn jwks(State(provider): State<Provider>) -> (StatusCode, Json<Value>) {
    provider.requests.fetch_add(1, Ordering::SeqCst);
    (
        StatusCode::from_u16(provider.status.load(Ordering::SeqCst)).unwrap(),
        Json(provider.body.lock().unwrap().clone()),
    )
}
impl Server {
    async fn new(body: Value) -> Self {
        let provider = Provider {
            body: Arc::new(StdMutex::new(body)),
            status: Arc::new(AtomicU16::new(200)),
            requests: Arc::new(AtomicUsize::new(0)),
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = Url::parse(&format!("http://{}/jwks", listener.local_addr().unwrap())).unwrap();
        let app = Router::new()
            .route("/jwks", get(jwks))
            .with_state(provider.clone());
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Self {
            url,
            provider,
            task,
        }
    }
    fn config(&self) -> OidcConfig {
        OidcConfig {
            issuer: "https://issuer.invalid".into(),
            audience: "habit-api".into(),
            jwks_url: self.url.clone(),
            algorithms: vec![Algorithm::EdDSA],
        }
    }
    fn verifier(&self) -> OidcVerifier {
        OidcVerifier::new_for_test(self.config()).unwrap()
    }
    fn requests(&self) -> usize {
        self.provider.requests.load(Ordering::SeqCst)
    }
}
fn public_key(kid: &str, public: &str) -> Value {
    json!({"kty":"OKP", "crv":"Ed25519", "kid":kid, "alg":"EdDSA", "use":"sig", "key_ops":["verify"], "x":public})
}
fn key_set(kid: &str, public: &str) -> Value {
    json!({"keys":[public_key(kid, public)]})
}
fn claims() -> Value {
    let now = Utc::now().timestamp();
    json!({"iss":"https://issuer.invalid", "aud":"habit-api", "sub":"stable-subject", "exp":now+600, "nbf":now-60, "scope":"habits:read entries:write unknown:scope habits:read"})
}
fn header(kid: &str) -> Header {
    let mut header = Header::new(Algorithm::EdDSA);
    header.typ = Some("at+jwt".into());
    header.kid = Some(kid.into());
    header
}
fn sign_with_header(header: &Header, claims: &Value, private: &[u8]) -> String {
    encode(header, claims, &EncodingKey::from_ed_pem(private).unwrap()).unwrap()
}
fn token(kid: &str, claims: &Value, private: &[u8]) -> String {
    sign_with_header(&header(kid), claims, private)
}

#[tokio::test]
async fn strict_claims_signature_algorithm_and_access_token_type_are_verified() {
    let server = Server::new(key_set("key-1", TEST_PUBLIC_1)).await;
    let verifier = server.verifier();
    let identity = verifier
        .verify(&token("key-1", &claims(), TEST_PRIVATE_1))
        .await
        .unwrap();
    assert_eq!(identity.issuer, "https://issuer.invalid");
    assert_eq!(identity.subject, "stable-subject");
    assert_eq!(
        identity.scopes,
        vec![Scope::HabitsRead, Scope::EntriesWrite]
    );
    let now = Utc::now().timestamp();
    for (field, value) in [
        ("iss", json!("https://wrong-issuer.invalid")),
        ("aud", json!("another-api")),
        ("exp", json!(now - 120)),
        ("nbf", json!(now + 120)),
        ("sub", json!("")),
        ("sub", json!("bad\nsubject")),
        ("sub", json!("x".repeat(256))),
    ] {
        let mut invalid = claims();
        invalid[field] = value;
        assert!(
            matches!(
                verifier
                    .verify(&token("key-1", &invalid, TEST_PRIVATE_1))
                    .await,
                Err(DomainError::Unauthenticated)
            ),
            "{field}"
        );
    }
    for required in ["iss", "aud", "sub", "exp", "nbf"] {
        let mut invalid = claims();
        invalid.as_object_mut().unwrap().remove(required);
        assert!(
            matches!(
                verifier
                    .verify(&token("key-1", &invalid, TEST_PRIVATE_1))
                    .await,
                Err(DomainError::Unauthenticated)
            ),
            "missing {required}"
        );
    }
    for typ in [None, Some("JWT".into()), Some("id+jwt".into())] {
        let mut invalid = header("key-1");
        invalid.typ = typ;
        assert!(matches!(
            verifier
                .verify(&sign_with_header(&invalid, &claims(), TEST_PRIVATE_1))
                .await,
            Err(DomainError::Unauthenticated)
        ));
    }
    assert!(matches!(
        verifier
            .verify(&token("key-1", &claims(), TEST_PRIVATE_2))
            .await,
        Err(DomainError::Unauthenticated)
    ));
    let mut symmetric = Header::new(Algorithm::HS256);
    symmetric.typ = Some("at+jwt".into());
    symmetric.kid = Some("key-1".into());
    let confusion = encode(
        &symmetric,
        &claims(),
        &EncodingKey::from_secret(b"public-test-secret"),
    )
    .unwrap();
    assert!(matches!(
        verifier.verify(&confusion).await,
        Err(DomainError::Unauthenticated)
    ));
    let mut injected = header("key-1");
    injected.jku = Some("https://attacker.invalid/jwks".into());
    assert!(matches!(
        verifier
            .verify(&sign_with_header(&injected, &claims(), TEST_PRIVATE_1))
            .await,
        Err(DomainError::Unauthenticated)
    ));
    assert!(matches!(
        verifier.verify(&"x".repeat(8193)).await,
        Err(DomainError::Unauthenticated)
    ));
    assert!(matches!(
        verifier
            .verify(&token(&"k".repeat(129), &claims(), TEST_PRIVATE_1))
            .await,
        Err(DomainError::Unauthenticated)
    ));
    assert_eq!(server.requests(), 1);
}

#[tokio::test]
async fn unknown_key_refresh_is_throttled_rotation_is_single_flight_and_expired_cache_fails_closed()
{
    let server = Server::new(key_set("key-1", TEST_PUBLIC_1)).await;
    let verifier = server.verifier();
    let old = token("key-1", &claims(), TEST_PRIVATE_1);
    verifier.verify(&old).await.unwrap();
    let unknown = token("key-2", &claims(), TEST_PRIVATE_2);
    for _ in 0..3 {
        assert!(matches!(
            verifier.verify(&unknown).await,
            Err(DomainError::Unauthenticated)
        ));
    }
    assert_eq!(server.requests(), 1);
    *server.provider.body.lock().unwrap() = key_set("key-2", TEST_PUBLIC_2);
    verifier.cache.lock().await.attempted_at =
        Some(Instant::now() - REFRESH_INTERVAL - Duration::from_secs(1));
    let (one, two) = tokio::join!(verifier.verify(&unknown), verifier.verify(&unknown));
    assert_eq!(one.unwrap().subject, "stable-subject");
    assert_eq!(two.unwrap().subject, "stable-subject");
    assert_eq!(server.requests(), 2);
    assert!(matches!(
        verifier.verify(&old).await,
        Err(DomainError::Unauthenticated)
    ));
    server.provider.status.store(503, Ordering::SeqCst);
    verifier.verify(&unknown).await.unwrap();
    assert_eq!(server.requests(), 2);
    {
        let mut cache = verifier.cache.lock().await;
        cache.fetched_at = Some(Instant::now() - CACHE_TTL - Duration::from_secs(1));
        cache.attempted_at = Some(Instant::now() - REFRESH_INTERVAL - Duration::from_secs(1));
    }
    assert!(matches!(
        verifier.verify(&unknown).await,
        Err(DomainError::Unavailable)
    ));
    assert!(matches!(
        verifier.verify(&unknown).await,
        Err(DomainError::Unavailable)
    ));
    assert_eq!(server.requests(), 3);
}

#[tokio::test]
async fn jwks_requires_signature_use_matching_algorithm_curve_and_verification_operation() {
    let good = public_key("key-1", TEST_PUBLIC_1);
    let server = Server::new(json!({"keys":[good.clone()]})).await;
    for (field, value) in [
        ("use", json!("enc")),
        ("alg", json!("RS256")),
        ("crv", json!("P-256")),
        ("key_ops", json!(["sign"])),
    ] {
        let mut invalid = good.clone();
        invalid[field] = value;
        *server.provider.body.lock().unwrap() = json!({"keys":[invalid]});
        assert!(
            matches!(
                server
                    .verifier()
                    .verify(&token("key-1", &claims(), TEST_PRIVATE_1))
                    .await,
                Err(DomainError::Unavailable)
            ),
            "{field}"
        );
    }
    *server.provider.body.lock().unwrap() = json!({"keys":[good.clone(), good.clone()]});
    assert!(matches!(
        server
            .verifier()
            .verify(&token("key-1", &claims(), TEST_PRIVATE_1))
            .await,
        Err(DomainError::Unavailable)
    ));
    *server.provider.body.lock().unwrap() = json!({"keys":vec![good;65]});
    assert!(matches!(
        server
            .verifier()
            .verify(&token("key-1", &claims(), TEST_PRIVATE_1))
            .await,
        Err(DomainError::Unavailable)
    ));
    *server.provider.body.lock().unwrap() =
        json!({"keys":[], "padding":"x".repeat(MAX_JWKS_BYTES)});
    assert!(matches!(
        server
            .verifier()
            .verify(&token("key-1", &claims(), TEST_PRIVATE_1))
            .await,
        Err(DomainError::Unavailable)
    ));
}

#[tokio::test]
async fn constructor_rejects_http_credentials_and_unsafe_algorithm_configuration() {
    let server = Server::new(key_set("key-1", TEST_PUBLIC_1)).await;
    assert!(OidcVerifier::new(server.config()).is_err());
    let mut config = server.config();
    config.jwks_url = Url::parse("https://jwks.invalid/keys").unwrap();
    assert!(OidcVerifier::new(config.clone()).is_ok());
    for algorithms in [
        vec![],
        vec![Algorithm::HS256],
        vec![Algorithm::EdDSA, Algorithm::EdDSA],
    ] {
        let mut invalid = config.clone();
        invalid.algorithms = algorithms;
        assert!(OidcVerifier::new(invalid).is_err());
    }
    for url in [
        "https://user:password@jwks.invalid/keys",
        "https://jwks.invalid/keys#fragment",
    ] {
        let mut invalid = config.clone();
        invalid.jwks_url = Url::parse(url).unwrap();
        assert!(OidcVerifier::new(invalid).is_err());
    }
    config.audience = String::new();
    assert!(OidcVerifier::new(config).is_err());
}

#[tokio::test]
async fn http_oidc_authentication_provisions_stable_isolated_tenants_and_survives_cached_outage() {
    use crate::{
        config::AuthMode,
        http::routes::router_with_identity,
        infrastructure::{
            database::tests::{Fixture, habit_input},
            integrations::IntegrationRuntime,
        },
    };
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    async fn call(
        app: &Router,
        method: &str,
        path: &str,
        jwt: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut request = Request::builder().method(method).uri(path);
        if let Some(jwt) = jwt {
            request = request.header("authorization", format!("Bearer {jwt}"));
        }
        let body = if let Some(body) = body {
            request = request.header("content-type", "application/json");
            Body::from(body.to_string())
        } else {
            Body::empty()
        };
        let response = app
            .clone()
            .oneshot(request.body(body).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        };
        (status, value)
    }

    let fixture = Fixture::new().await;
    let server = Server::new(key_set("key-1", TEST_PUBLIC_1)).await;
    let verifier = Arc::new(server.verifier());
    let runtime = Arc::new(IntegrationRuntime {
        store: fixture.store.clone(),
        cipher: None,
        ha_url: None,
        strava: None,
        client: reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap(),
    });
    let app = router_with_identity(
        fixture.store.clone(),
        AuthMode::Oidc,
        runtime,
        Some(verifier),
    );
    let mut alice_claims = claims();
    alice_claims["sub"] = json!("alice-resource");
    alice_claims["scope"] = json!("habits:read habits:write entries:read entries:write");
    let alice = token("key-1", &alice_claims, TEST_PRIVATE_1);
    let mut bob_claims = alice_claims.clone();
    bob_claims["sub"] = json!("bob-resource");
    let bob = token("key-1", &bob_claims, TEST_PRIVATE_1);
    let (status, alice_session) = call(&app, "GET", "/api/v1/session", Some(&alice), None).await;
    let (_, bob_session) = call(&app, "GET", "/api/v1/session", Some(&bob), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(alice_session["mode"], "oidc_access_token");
    assert_ne!(alice_session["user_id"], bob_session["user_id"]);
    assert_eq!(alice_session.as_object().unwrap().len(), 3);

    assert_eq!(
        call(&app, "GET", "/api/v1/habits", None, None).await.0,
        StatusCode::UNAUTHORIZED
    );
    let (status, habit) = call(
        &app,
        "POST",
        "/api/v1/habits",
        Some(&alice),
        Some(serde_json::to_value(habit_input()).unwrap()),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let habit_id = habit["id"].as_str().unwrap();
    let owner = habit["user_id"].as_str().unwrap();
    let (status, own_list) = call(&app, "GET", "/api/v1/habits", Some(&alice), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(own_list["items"].as_array().unwrap().len(), 1);
    assert_eq!(own_list["items"][0]["id"], habit_id);
    assert_eq!(own_list["items"][0]["user_id"], owner);
    let (status, foreign_list) = call(&app, "GET", "/api/v1/habits", Some(&bob), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(foreign_list["items"].as_array().unwrap().is_empty());
    assert_eq!(
        call(
            &app,
            "GET",
            &format!("/api/v1/habits/{habit_id}"),
            Some(&bob),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let users: Vec<(String, String)> =
        sqlx::query_as("SELECT subject, id FROM users WHERE issuer = ? AND subject IN ('alice-resource', 'bob-resource') ORDER BY subject")
            .bind("https://issuer.invalid")
            .fetch_all(&fixture.store.pool)
            .await
            .unwrap();
    assert_eq!(users.len(), 2);
    assert_eq!(users[0], ("alice-resource".into(), owner.into()));
    assert_eq!(users[1].0, "bob-resource");
    assert_ne!(users[0].1, users[1].1);
    let mut wrong_audience = alice_claims.clone();
    wrong_audience["aud"] = json!("another-resource");
    assert_eq!(
        call(
            &app,
            "GET",
            "/api/v1/habits",
            Some(&token("key-1", &wrong_audience, TEST_PRIVATE_1)),
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let mut id_header = header("key-1");
    id_header.typ = Some("JWT".into());
    let id_token = sign_with_header(&id_header, &alice_claims, TEST_PRIVATE_1);
    assert_eq!(
        call(&app, "GET", "/api/v1/habits", Some(&id_token), None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let mut read_only_claims = alice_claims.clone();
    read_only_claims["scope"] = json!("habits:read");
    let read_only = token("key-1", &read_only_claims, TEST_PRIVATE_1);
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v1/habits",
            Some(&read_only),
            Some(serde_json::to_value(habit_input()).unwrap())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    server.provider.status.store(503, Ordering::SeqCst);
    let (status, cached_list) = call(&app, "GET", "/api/v1/habits", Some(&alice), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(cached_list["items"][0]["user_id"], owner);
    assert_eq!(server.requests(), 1);
    sqlx::query("UPDATE users SET disabled_at = ? WHERE id = ?")
        .bind(Utc::now())
        .bind(owner)
        .execute(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(
        call(&app, "GET", "/api/v1/habits", Some(&alice), None)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}
