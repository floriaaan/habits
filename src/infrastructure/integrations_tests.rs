#![allow(clippy::unwrap_used)]

use super::{
    database::tests::{Fixture, entry_input, fixture_principal},
    integrations::{Credentials, IntegrationRuntime},
    security::cipher::SecretCipher,
};
use crate::modules::{
    DomainError,
    auth::{Principal, Scope},
    entries,
    integrations::strava::{Activity, Athlete, Mapping, Metric, Sport},
};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::{Duration, Utc};
use reqwest::Url;
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU16, Ordering},
};
use uuid::Uuid;

fn actor(id: u128) -> Principal {
    let mut principal = fixture_principal(id);
    principal.scopes = Scope::all();
    principal
}

fn cipher() -> Arc<SecretCipher> {
    // Deterministic test key only; production reads injected random key material.
    Arc::new(SecretCipher::new(&STANDARD.encode([71_u8; 32]), "offline-tests".into()).unwrap())
}

fn credentials() -> Credentials {
    Credentials {
        access_token: "test-only-provider-access-token".into(),
        refresh_token: Some("test-only-provider-refresh-token".into()),
        expires_at: Some((Utc::now() + Duration::hours(1)).timestamp()),
        revision: 0,
    }
}

#[tokio::test]
async fn reminder_scheduler_handles_dst_replay_rests_and_disabled_delivery() {
    use crate::modules::habits::presentation::Presentation;
    let fixture = Fixture::new().await;
    let alice = actor(1);
    let habit = fixture.habit().await;
    sqlx::query("UPDATE habits SET created_at = '2026-01-01T00:00:00Z' WHERE id = ?")
        .bind(habit.id.to_string())
        .execute(&fixture.store.pool)
        .await
        .unwrap();
    fixture
        .store
        .set_presentation(
            &alice,
            habit.id,
            Presentation {
                reminder_at: Some("02:30:00".parse().unwrap()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let first = "2026-10-25T00:30:00Z".parse().unwrap();
    assert_eq!(fixture.store.enqueue_reminders_at(first).await.unwrap(), 0);
    fixture
        .store
        .connect_integration(
            alice.user_id,
            "home_assistant",
            "fixture-ha",
            &credentials(),
            &cipher(),
            1,
        )
        .await
        .unwrap();
    assert_eq!(
        fixture
            .store
            .enqueue_reminders_at("2026-10-25T00:29:00Z".parse().unwrap())
            .await
            .unwrap(),
        0
    );
    assert_eq!(fixture.store.enqueue_reminders_at(first).await.unwrap(), 1);
    assert_eq!(
        fixture
            .store
            .enqueue_reminders_at("2026-10-25T01:30:00Z".parse().unwrap())
            .await
            .unwrap(),
        0
    );
    let job = fixture.store.claim_job().await.unwrap().unwrap();
    assert_eq!(job.kind, "ha.reminder");
    assert!(fixture.store.reminder_still_due(&job, first).await.unwrap());
    fixture
        .store
        .set_rest(&alice, habit.id, "2026-10-25".parse().unwrap(), true)
        .await
        .unwrap();
    assert!(!fixture.store.reminder_still_due(&job, first).await.unwrap());
    assert!(
        !fixture
            .store
            .reminder_still_due(&job, first + Duration::days(1))
            .await
            .unwrap()
    );
    // 02:30 does not exist on this date: send at the first later local time.
    assert_eq!(
        fixture
            .store
            .enqueue_reminders_at("2026-03-29T01:00:00Z".parse().unwrap())
            .await
            .unwrap(),
        1
    );
    let integration = fixture
        .store
        .integration_id(alice.user_id, "home_assistant")
        .await
        .unwrap();
    fixture
        .store
        .disconnect_integration(alice.user_id, integration)
        .await
        .unwrap();
    fixture
        .store
        .connect_integration(
            alice.user_id,
            "home_assistant",
            "fixture-ha",
            &credentials(),
            &cipher(),
            1,
        )
        .await
        .unwrap();
    fixture
        .store
        .set_rest(&alice, habit.id, "2026-10-25".parse().unwrap(), false)
        .await
        .unwrap();
    assert_eq!(fixture.store.enqueue_reminders_at(first).await.unwrap(), 0);
    fixture
        .store
        .set_presentation(&alice, habit.id, Presentation::default())
        .await
        .unwrap();
    assert_eq!(
        fixture
            .store
            .enqueue_reminders_at("2026-03-30T03:00:00Z".parse().unwrap())
            .await
            .unwrap(),
        0
    );
}

#[derive(Clone)]
struct MockHa {
    status: Arc<AtomicU16>,
    received: Arc<Mutex<Vec<(String, Value)>>>,
}

async fn receive_notification(
    State(state): State<MockHa>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    let authorization = headers
        .get("authorization")
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();
    state.received.lock().unwrap().push((authorization, body));
    (
        StatusCode::from_u16(state.status.load(Ordering::SeqCst)).unwrap(),
        Json(json!([])),
    )
}

#[tokio::test]
async fn ha_failure_retries_with_stable_notification_identity_and_does_not_block_local_entries() {
    let fixture = Fixture::new().await;
    let alice = actor(1);
    let key = cipher();
    let token = credentials();
    let integration = fixture
        .store
        .connect_integration(
            alice.user_id,
            "home_assistant",
            "offline-ha",
            &token,
            &key,
            1,
        )
        .await
        .unwrap();
    let state = MockHa {
        status: Arc::new(AtomicU16::new(503)),
        received: Arc::new(Mutex::new(Vec::new())),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
    let app = Router::new()
        .route(
            "/api/services/persistent_notification/create",
            post(receive_notification),
        )
        .with_state(state.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let runtime = IntegrationRuntime {
        store: fixture.store.clone(),
        cipher: Some(key),
        ha_url: Some(base),
        strava: None,
        client: reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .unwrap(),
    };
    let payload = json!({"title":"Habit complete", "message":"Offline integration test"});
    let id = fixture
        .store
        .enqueue(
            alice.user_id,
            integration,
            "ha.notify",
            "ha-retry",
            payload.clone(),
        )
        .await
        .unwrap();
    let first = fixture.store.claim_job().await.unwrap().unwrap();
    assert_eq!(first.id, id);
    let failure = runtime.execute(&first).await.unwrap_err();
    assert!(!failure.permanent);
    fixture
        .store
        .finish_job(&first, false, failure.retry_after, failure.permanent)
        .await
        .unwrap();
    let pending = fixture.store.job_status(&alice, id).await.unwrap();
    assert_eq!(pending["state"], "pending");
    assert_eq!(pending["attempts"], 1);
    let available: chrono::DateTime<Utc> =
        serde_json::from_value(pending["available_at"].clone()).unwrap();
    assert!(available > Utc::now());

    let habit = fixture.habit().await;
    entries::record(
        &fixture.store,
        &alice,
        habit.id,
        "manual-during-ha-outage",
        entry_input(),
        Utc::now(),
    )
    .await
    .unwrap();
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        10
    );
    assert_eq!(fixture.count("entries").await, 1);

    state.status.store(200, Ordering::SeqCst);
    sqlx::query("UPDATE jobs SET available_at = ? WHERE id = ?")
        .bind(Utc::now() - Duration::seconds(1))
        .bind(id.to_string())
        .execute(&fixture.store.pool)
        .await
        .unwrap();
    let second = fixture.store.claim_job().await.unwrap().unwrap();
    assert_eq!(second.id, id);
    assert_eq!(second.attempts, 2);
    runtime.execute(&second).await.unwrap();
    fixture
        .store
        .finish_job(&second, true, None, false)
        .await
        .unwrap();
    assert_eq!(
        fixture.store.job_status(&alice, id).await.unwrap()["state"],
        "succeeded"
    );
    {
        let received = state.received.lock().unwrap();
        assert_eq!(received.len(), 2);
        for (authorization, body) in received.iter() {
            assert_eq!(authorization, &format!("Bearer {}", token.access_token));
            assert_eq!(body["notification_id"], id.to_string());
            assert_eq!(body["title"], payload["title"]);
            assert_eq!(body["message"], payload["message"]);
        }
        assert_eq!(received[0].1, received[1].1);
    }
    server.abort();
}

#[tokio::test]
async fn jobs_are_idempotent_claimed_once_and_fenced_after_lease_recovery() {
    let fixture = Fixture::new().await;
    let alice = actor(1);
    let integration = fixture
        .store
        .connect_integration(
            alice.user_id,
            "home_assistant",
            "offline-ha",
            &credentials(),
            &cipher(),
            1,
        )
        .await
        .unwrap();
    let payload = json!({"title":"test", "message":"one"});
    let first_id = fixture
        .store
        .enqueue(
            alice.user_id,
            integration,
            "ha.notify",
            "one",
            payload.clone(),
        )
        .await
        .unwrap();
    assert_eq!(
        fixture
            .store
            .enqueue(alice.user_id, integration, "ha.notify", "one", payload)
            .await
            .unwrap(),
        first_id
    );
    assert!(matches!(
        fixture
            .store
            .enqueue(
                alice.user_id,
                integration,
                "ha.notify",
                "one",
                json!({"message":"different"})
            )
            .await,
        Err(DomainError::Conflict)
    ));
    let second_id = fixture
        .store
        .enqueue(
            alice.user_id,
            integration,
            "ha.notify",
            "two",
            json!({"message":"two"}),
        )
        .await
        .unwrap();
    let (first, second) = tokio::join!(fixture.store.claim_job(), fixture.store.claim_job());
    let first = first.unwrap().unwrap();
    let second = second.unwrap().unwrap();
    assert_ne!(first.id, second.id);
    assert!([first_id, second_id].contains(&first.id));
    assert!([first_id, second_id].contains(&second.id));
    assert!(fixture.store.claim_job().await.unwrap().is_none());
    sqlx::query("UPDATE jobs SET lease_until = ? WHERE id = ?")
        .bind(Utc::now() - Duration::seconds(1))
        .bind(first.id.to_string())
        .execute(&fixture.store.pool)
        .await
        .unwrap();
    let recovered = fixture.store.claim_job().await.unwrap().unwrap();
    assert_eq!(recovered.id, first.id);
    assert_ne!(recovered.owner, first.owner);
    assert_eq!(recovered.attempts, 2);
    fixture
        .store
        .finish_job(&first, true, None, false)
        .await
        .unwrap();
    assert_eq!(
        fixture.store.job_status(&alice, first.id).await.unwrap()["state"],
        "running"
    );
    fixture
        .store
        .finish_job(&recovered, true, None, false)
        .await
        .unwrap();
    fixture
        .store
        .finish_job(&second, true, None, false)
        .await
        .unwrap();
    assert_eq!(
        fixture.store.job_status(&alice, first.id).await.unwrap()["state"],
        "succeeded"
    );
    assert!(fixture.store.claim_job().await.unwrap().is_none());
}

#[tokio::test]
async fn jobs_stop_after_eight_failed_attempts_without_waiting_for_wall_clock_backoff() {
    let fixture = Fixture::new().await;
    let alice = actor(1);
    let integration = fixture
        .store
        .connect_integration(
            alice.user_id,
            "home_assistant",
            "offline-ha",
            &credentials(),
            &cipher(),
            1,
        )
        .await
        .unwrap();
    let id = fixture
        .store
        .enqueue(
            alice.user_id,
            integration,
            "ha.notify",
            "eight-failures",
            json!({"message":"retry"}),
        )
        .await
        .unwrap();
    for attempt in 1..=8 {
        let job = fixture.store.claim_job().await.unwrap().unwrap();
        assert_eq!(job.id, id);
        assert_eq!(job.attempts, attempt);
        fixture
            .store
            .finish_job(&job, false, Some(Utc::now() - Duration::seconds(1)), false)
            .await
            .unwrap();
        assert_eq!(
            fixture.store.job_status(&alice, id).await.unwrap()["state"],
            if attempt == 8 { "failed" } else { "pending" }
        );
    }
    assert!(fixture.store.claim_job().await.unwrap().is_none());
    assert_eq!(
        fixture.store.job_status(&alice, id).await.unwrap()["attempts"],
        8
    );
}

#[tokio::test]
async fn strava_import_replay_correction_and_purge_preserve_only_compensated_xp_history() {
    let fixture = Fixture::new().await;
    let alice = actor(1);
    let habit = fixture.habit().await;
    let integration = fixture
        .store
        .connect_integration(alice.user_id, "strava", "42", &credentials(), &cipher(), 1)
        .await
        .unwrap();
    fixture
        .store
        .set_strava_mapping(
            &alice,
            Mapping {
                sport: Sport::Run,
                habit_id: habit.id,
                metric: Metric::Distance,
            },
        )
        .await
        .unwrap();
    let mut activity = Activity {
        id: 101,
        athlete: Athlete { id: 42 },
        sport_type: "Run".into(),
        start_date: entry_input().occurred_at,
        distance: 5000.0,
        moving_time: 1800.0,
    };
    let initial = Uuid::new_v4();
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, initial)
        .await
        .unwrap();
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, initial)
        .await
        .unwrap();
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(fixture.count("entry_events").await, 1);
    assert_eq!(fixture.count("xp_ledger").await, 1);
    let sources: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM source_identifiers")
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(sources, 1);
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        10
    );
    activity.distance = 4000.0;
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        0
    );
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(fixture.count("entry_events").await, 2);
    activity.distance = 5000.0;
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        10
    );
    fixture
        .store
        .purge_source(alice.user_id, integration, activity.id, Uuid::new_v4())
        .await
        .unwrap();
    fixture
        .store
        .purge_source(alice.user_id, integration, activity.id, Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(fixture.count("entries").await, 0);
    assert_eq!(fixture.count("entry_events").await, 0);
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        0
    );
    let sources: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM source_identifiers")
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(sources, 0);
    let retained: Vec<(String, String)> = sqlx::query_as(
        "SELECT kind, payload FROM domain_events WHERE user_id = ? AND habit_id = ? ORDER BY rowid",
    )
    .bind(alice.user_id.0.to_string())
    .bind(habit.id.to_string())
    .fetch_all(&fixture.store.pool)
    .await
    .unwrap();
    assert_eq!(retained.len(), 4);
    assert!(
        retained
            .iter()
            .all(|(kind, payload)| kind == "source.purged" && payload == "{}")
    );
    let ledger: Vec<i64> = sqlx::query_scalar("SELECT amount FROM xp_ledger ORDER BY rowid")
        .fetch_all(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(ledger, vec![10, -10, 10, -10]);
    assert!(
        sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&fixture.store.pool)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn integration_credentials_mappings_jobs_and_source_purge_are_tenant_scoped() {
    let fixture = Fixture::new().await;
    let alice = actor(1);
    let bob = actor(2);
    let key = cipher();
    let token = credentials();
    let habit = fixture.habit().await;
    let integration = fixture
        .store
        .connect_integration(alice.user_id, "strava", "42", &token, &key, 1)
        .await
        .unwrap();
    assert!(matches!(
        fixture
            .store
            .credentials(bob.user_id, integration, "strava", &key)
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .replace_credentials(bob.user_id, integration, "strava", &token, &key)
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .disconnect_integration(bob.user_id, integration)
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .connect_integration(bob.user_id, "strava", "42", &token, &key, 2)
            .await,
        Err(DomainError::Conflict)
    ));
    assert!(matches!(
        fixture
            .store
            .connect_integration(bob.user_id, "strava", "43", &token, &key, 1)
            .await,
        Err(DomainError::Validation(_))
    ));
    fixture
        .store
        .connect_integration(bob.user_id, "strava", "43", &token, &key, 2)
        .await
        .unwrap();
    assert!(matches!(
        fixture
            .store
            .set_strava_mapping(
                &bob,
                Mapping {
                    sport: Sport::Run,
                    habit_id: habit.id,
                    metric: Metric::Distance
                }
            )
            .await,
        Err(DomainError::NotFound)
    ));
    fixture
        .store
        .set_strava_mapping(
            &alice,
            Mapping {
                sport: Sport::Run,
                habit_id: habit.id,
                metric: Metric::Distance,
            },
        )
        .await
        .unwrap();
    let activity = Activity {
        id: 101,
        athlete: Athlete { id: 42 },
        sport_type: "Run".into(),
        start_date: entry_input().occurred_at,
        distance: 5000.0,
        moving_time: 1800.0,
    };
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, Uuid::new_v4())
        .await
        .unwrap();
    assert!(matches!(
        fixture
            .store
            .reconcile_activity(bob.user_id, integration, &activity, Uuid::new_v4())
            .await,
        Err(DomainError::NotFound)
    ));
    fixture
        .store
        .purge_source(bob.user_id, integration, activity.id, Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        10
    );
    assert!(matches!(
        fixture
            .store
            .enqueue(
                bob.user_id,
                integration,
                "strava.activity",
                "foreign",
                json!({})
            )
            .await,
        Err(DomainError::NotFound)
    ));
    let job = fixture
        .store
        .enqueue(
            alice.user_id,
            integration,
            "strava.activity",
            "own",
            json!({}),
        )
        .await
        .unwrap();
    assert!(matches!(
        fixture.store.job_status(&bob, job).await,
        Err(DomainError::NotFound)
    ));
    assert_eq!(
        fixture
            .store
            .credentials(alice.user_id, integration, "strava", &key)
            .await
            .unwrap()
            .access_token,
        token.access_token
    );
    let ciphertext: Vec<u8> =
        sqlx::query_scalar("SELECT secret_ciphertext FROM integrations WHERE id = ?")
            .bind(integration.to_string())
            .fetch_one(&fixture.store.pool)
            .await
            .unwrap();
    assert!(
        !ciphertext
            .windows(token.access_token.len())
            .any(|part| part == token.access_token.as_bytes())
    );
}

#[tokio::test]
async fn observed_strava_quotas_can_only_tighten_limits_and_return_a_retry_deadline() {
    let fixture = Fixture::new().await;
    fixture.store.reserve_strava_request().await.unwrap();
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("x-ratelimit-limit", "2,10".parse().unwrap());
    headers.insert("x-ratelimit-usage", "2,3".parse().unwrap());
    headers.insert("x-readratelimit-limit", "1,8".parse().unwrap());
    headers.insert("x-readratelimit-usage", "1,4".parse().unwrap());
    fixture.store.observe_strava_quota(&headers).await.unwrap();
    headers.clear();
    headers.insert("x-ratelimit-limit", "900,9000".parse().unwrap());
    headers.insert("x-ratelimit-usage", "0,0".parse().unwrap());
    fixture.store.observe_strava_quota(&headers).await.unwrap();
    let windows: Vec<(String, i64, i64)> =
        sqlx::query_as("SELECT name, used, maximum FROM provider_windows ORDER BY name")
            .fetch_all(&fixture.store.pool)
            .await
            .unwrap();
    assert_eq!(
        windows,
        vec![("strava.daily".into(), 4, 8), ("strava.short".into(), 2, 1)]
    );
    let failure = fixture.store.reserve_strava_request().await.unwrap_err();
    assert!(!failure.permanent);
    assert!(failure.retry_after.unwrap() > Utc::now());
    let unchanged: Vec<(String, i64, i64)> =
        sqlx::query_as("SELECT name, used, maximum FROM provider_windows ORDER BY name")
            .fetch_all(&fixture.store.pool)
            .await
            .unwrap();
    assert_eq!(unchanged, windows);
}

async fn strava_regression_fixture() -> (
    Fixture,
    Principal,
    Uuid,
    crate::modules::habits::Habit,
    Activity,
) {
    let fixture = Fixture::new().await;
    let alice = actor(1);
    let habit = fixture.habit().await;
    let integration = fixture
        .store
        .connect_integration(alice.user_id, "strava", "42", &credentials(), &cipher(), 1)
        .await
        .unwrap();
    fixture
        .store
        .set_strava_mapping(
            &alice,
            Mapping {
                sport: Sport::Run,
                habit_id: habit.id,
                metric: Metric::Distance,
            },
        )
        .await
        .unwrap();
    let activity = Activity {
        id: 101,
        athlete: Athlete { id: 42 },
        sport_type: "Run".into(),
        start_date: entry_input().occurred_at,
        distance: 5000.0,
        moving_time: 1800.0,
    };
    (fixture, alice, integration, habit, activity)
}

#[tokio::test]
async fn archived_habit_preserves_existing_strava_history_during_repeat_sync() {
    let (fixture, alice, integration, habit, mut activity) = strava_regression_fixture().await;
    let cause = Uuid::new_v4();
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, cause)
        .await
        .unwrap();
    let original: String = sqlx::query_scalar("SELECT entry_id FROM source_identifiers WHERE integration_id = ? AND provider_object_id = '101'").bind(integration.to_string()).fetch_one(&fixture.store.pool).await.unwrap();
    fixture.store.archive_habit(&alice, habit.id).await.unwrap();
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, cause)
        .await
        .unwrap();
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, Uuid::new_v4())
        .await
        .unwrap();
    let retained: String = sqlx::query_scalar("SELECT entry_id FROM source_identifiers WHERE integration_id = ? AND provider_object_id = '101'").bind(integration.to_string()).fetch_one(&fixture.store.pool).await.unwrap();
    assert_eq!(retained, original);
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(fixture.count("entry_events").await, 1);
    assert_eq!(fixture.count("xp_ledger").await, 1);
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        10
    );
    // Archiving retains the known source but does not import additional activities.
    activity.id = 102;
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(fixture.count("entry_events").await, 1);
}

#[tokio::test]
async fn one_strava_job_cause_can_apply_successive_changed_snapshots_without_event_conflicts() {
    let (fixture, alice, integration, habit, mut activity) = strava_regression_fixture().await;
    let cause = Uuid::new_v4();
    for (distance, expected_xp) in [(5000.0, 10), (4000.0, 0), (3000.0, 0), (5000.0, 10)] {
        activity.distance = distance;
        fixture
            .store
            .reconcile_activity(alice.user_id, integration, &activity, cause)
            .await
            .unwrap();
        assert_eq!(
            fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
            expected_xp
        );
        let stored: f64 =
            sqlx::query_scalar("SELECT value FROM entries WHERE user_id = ? AND habit_id = ?")
                .bind(alice.user_id.0.to_string())
                .bind(habit.id.to_string())
                .fetch_one(&fixture.store.pool)
                .await
                .unwrap();
        assert_eq!(stored, distance);
    }
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, cause)
        .await
        .unwrap();
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(fixture.count("entry_events").await, 4);
    assert_eq!(fixture.count("xp_ledger").await, 3);
    let distinct: i64 =
        sqlx::query_scalar("SELECT COUNT(DISTINCT idempotency_key) FROM entry_events")
            .fetch_one(&fixture.store.pool)
            .await
            .unwrap();
    assert_eq!(distinct, 4);
}

#[tokio::test]
async fn expired_and_reclaimed_leases_cannot_mutate_strava_sources_or_enqueue_or_disconnect() {
    let (fixture, alice, integration, habit, mut activity) = strava_regression_fixture().await;
    fixture
        .store
        .reconcile_activity(alice.user_id, integration, &activity, Uuid::new_v4())
        .await
        .unwrap();
    let id = fixture
        .store
        .enqueue(
            alice.user_id,
            integration,
            "strava.sync",
            "fenced-parent",
            json!({"page":1}),
        )
        .await
        .unwrap();
    let stale = fixture.store.claim_job().await.unwrap().unwrap();
    assert_eq!(stale.id, id);
    sqlx::query("UPDATE jobs SET lease_until = ? WHERE id = ?")
        .bind(Utc::now() - Duration::seconds(1))
        .bind(id.to_string())
        .execute(&fixture.store.pool)
        .await
        .unwrap();
    activity.distance = 4000.0;
    for reclaimed in [false, true] {
        if reclaimed {
            let current = fixture.store.claim_job().await.unwrap().unwrap();
            assert_eq!(current.id, stale.id);
            assert_ne!(current.owner, stale.owner);
        }
        assert!(matches!(
            fixture
                .store
                .reconcile_job_activity(&stale, &activity)
                .await,
            Err(DomainError::Conflict)
        ));
        assert!(matches!(
            fixture
                .store
                .purge_source_for_job(&stale, activity.id)
                .await,
            Err(DomainError::Conflict)
        ));
        assert!(matches!(
            fixture
                .store
                .enqueue_for_job(
                    &stale,
                    "strava.activity",
                    "stale-child",
                    json!({"object_id":999})
                )
                .await,
            Err(DomainError::Conflict)
        ));
        assert!(matches!(
            fixture.store.disconnect_for_job(&stale, 0).await,
            Err(DomainError::Conflict)
        ));
    }
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        10
    );
    let jobs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(jobs, 1);
    // Recover a current owner and demonstrate that the same operations are allowed.
    sqlx::query("UPDATE jobs SET lease_until = ? WHERE id = ?")
        .bind(Utc::now() - Duration::seconds(1))
        .bind(id.to_string())
        .execute(&fixture.store.pool)
        .await
        .unwrap();
    let current = fixture.store.claim_job().await.unwrap().unwrap();
    fixture
        .store
        .reconcile_job_activity(&current, &activity)
        .await
        .unwrap();
    assert_eq!(
        fixture.store.statistics(&alice, habit.id).await.unwrap().xp,
        0
    );
    let child = fixture
        .store
        .enqueue_for_job(
            &current,
            "strava.activity",
            "current-child",
            json!({"object_id":999}),
        )
        .await
        .unwrap();
    assert_ne!(child, current.id);
    fixture
        .store
        .purge_source_for_job(&current, activity.id)
        .await
        .unwrap();
    assert_eq!(fixture.count("entries").await, 0);
    fixture.store.disconnect_for_job(&current, 0).await.unwrap();
    assert!(matches!(
        fixture
            .store
            .credentials(alice.user_id, integration, "strava", &cipher())
            .await,
        Err(DomainError::NotFound)
    ));
    let jobs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(jobs, 0);
}

#[tokio::test]
async fn stale_credential_revision_cannot_replace_or_disconnect_refreshed_credentials() {
    let (fixture, alice, integration, _, _) = strava_regression_fixture().await;
    let key = cipher();
    let stale = fixture
        .store
        .credentials(alice.user_id, integration, "strava", &key)
        .await
        .unwrap();
    let mut replacement = credentials();
    replacement.access_token = "test-only-refreshed-access-token".into();
    replacement.revision = stale.revision;
    fixture
        .store
        .replace_credentials(alice.user_id, integration, "strava", &replacement, &key)
        .await
        .unwrap();
    assert!(matches!(
        fixture
            .store
            .replace_credentials(alice.user_id, integration, "strava", &stale, &key)
            .await,
        Err(DomainError::NotFound)
    ));
    fixture
        .store
        .disconnect_integration_at_revision(alice.user_id, integration, Some(stale.revision))
        .await
        .unwrap();
    let updated = fixture
        .store
        .credentials(alice.user_id, integration, "strava", &key)
        .await
        .unwrap();
    assert_eq!(updated.revision, stale.revision + 1);
    assert_eq!(updated.access_token, "test-only-refreshed-access-token");
    fixture
        .store
        .enqueue(
            alice.user_id,
            integration,
            "strava.sync",
            "credential-revision",
            json!({"page":1}),
        )
        .await
        .unwrap();
    let job = fixture.store.claim_job().await.unwrap().unwrap();
    fixture
        .store
        .disconnect_for_job(&job, stale.revision)
        .await
        .unwrap();
    assert_eq!(
        fixture
            .store
            .credentials(alice.user_id, integration, "strava", &key)
            .await
            .unwrap()
            .access_token,
        "test-only-refreshed-access-token"
    );
    fixture
        .store
        .disconnect_for_job(&job, updated.revision)
        .await
        .unwrap();
    assert!(matches!(
        fixture
            .store
            .credentials(alice.user_id, integration, "strava", &key)
            .await,
        Err(DomainError::NotFound)
    ));
}

#[tokio::test]
async fn sync_retry_preserves_creation_cutoff_and_reuses_the_existing_next_page_job() {
    use super::integrations::StravaConfig;
    use axum::{extract::Query, routing::get};
    use std::collections::HashMap;

    type Requests = Arc<Mutex<Vec<HashMap<String, String>>>>;
    async fn activities(
        State(requests): State<Requests>,
        Query(query): Query<HashMap<String, String>>,
    ) -> Json<Value> {
        requests.lock().unwrap().push(query);
        let batch: Vec<Value> = (1..=100)
            .map(|id| {
                json!({
                    "id":id, "athlete":{"id":42}, "sport_type":"Run",
                    "start_date":"2026-03-28T23:30:00Z", "distance":5000.0, "moving_time":1800.0
                })
            })
            .collect();
        Json(json!(batch))
    }

    let fixture = Fixture::new().await;
    let alice = actor(1);
    let key = cipher();
    let integration = fixture
        .store
        .connect_integration(alice.user_id, "strava", "42", &credentials(), &key, 1)
        .await
        .unwrap();
    // No sport mapping is needed: all 100 provider snapshots are ignored locally.
    let requests: Requests = Arc::new(Mutex::new(Vec::new()));
    let provider = Router::new()
        .route("/athlete/activities", get(activities))
        .with_state(requests.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, provider).await.unwrap();
    });
    let runtime = IntegrationRuntime {
        store: fixture.store.clone(),
        cipher: Some(key),
        ha_url: None,
        strava: Some(StravaConfig {
            client_id: "test-client".into(),
            client_secret: "test-only-secret".into(),
            redirect_uri: Url::parse("https://callback.invalid/strava").unwrap(),
            verify_token: "test-only-verify".into(),
            path_token: "test_only_path_00000000000000000001".into(),
            subscription: Some(1),
            capacity: 1,
            api: base.clone(),
            oauth: base,
        }),
        client: reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .unwrap(),
    };
    let root = fixture
        .store
        .enqueue(
            alice.user_id,
            integration,
            "strava.sync",
            "stable-cutoff",
            json!({"page":1}),
        )
        .await
        .unwrap();
    let created_at: chrono::DateTime<Utc> = "2026-01-01T12:00:00Z".parse().unwrap();
    sqlx::query("UPDATE jobs SET created_at = ? WHERE id = ?")
        .bind(created_at)
        .bind(root.to_string())
        .execute(&fixture.store.pool)
        .await
        .unwrap();
    let first = fixture.store.claim_job().await.unwrap().unwrap();
    assert_eq!(first.id, root);
    assert_eq!(first.created_at, created_at);
    runtime.execute(&first).await.unwrap();
    let child_key = format!("sync:{root}:p2");
    let (child, payload): (String, String) =
        sqlx::query_as("SELECT id, payload FROM jobs WHERE idempotency_key = ?")
            .bind(&child_key)
            .fetch_one(&fixture.store.pool)
            .await
            .unwrap();
    let expected_after = (created_at - Duration::days(90)).timestamp();
    let payload: Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(payload, json!({"page":2, "after":expected_after}));

    // Retry the root after page 2 was committed but before root success was durable.
    fixture
        .store
        .finish_job(
            &first,
            false,
            Some(Utc::now() - Duration::seconds(1)),
            false,
        )
        .await
        .unwrap();
    sqlx::query("UPDATE jobs SET available_at = ? WHERE id = ?")
        .bind(Utc::now() + Duration::days(1))
        .bind(&child)
        .execute(&fixture.store.pool)
        .await
        .unwrap();
    let retry = fixture.store.claim_job().await.unwrap().unwrap();
    assert_eq!(retry.id, root);
    assert_eq!(retry.attempts, 2);
    assert_ne!(retry.owner, first.owner);
    assert_eq!(retry.created_at, created_at);
    runtime.execute(&retry).await.unwrap();
    let children: Vec<(String, String)> =
        sqlx::query_as("SELECT id, payload FROM jobs WHERE idempotency_key = ?")
            .bind(&child_key)
            .fetch_all(&fixture.store.pool)
            .await
            .unwrap();
    assert_eq!(children.len(), 1);
    assert_eq!(children[0].0, child);
    assert_eq!(
        serde_json::from_str::<Value>(&children[0].1).unwrap(),
        payload
    );
    fixture
        .store
        .finish_job(&retry, true, None, false)
        .await
        .unwrap();
    assert_eq!(
        fixture.store.job_status(&alice, root).await.unwrap()["state"],
        "succeeded"
    );
    let job_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
        .fetch_one(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(job_count, 2);
    {
        let requests = requests.lock().unwrap();
        assert_eq!(requests.len(), 2);
        for query in requests.iter() {
            assert_eq!(query["after"], expected_after.to_string());
            assert_eq!(query["page"], "1");
            assert_eq!(query["per_page"], "100");
        }
    }
    assert_eq!(fixture.count("entries").await, 0);
    server.abort();
}
