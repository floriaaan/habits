#![allow(clippy::unwrap_used)]

use super::{
    MIGRATOR, Store,
    tests::{Fixture, entry_input, fixture_principal, habit_input},
};
use crate::modules::{
    DomainError,
    auth::{Principal, Scope},
    entries::{self, CheckInPayload, NewEntry},
    habits::{self, HabitKind, Pagination, Period, Unit, UpdateHabit},
};
use chrono::{Duration, NaiveDate, Utc};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use uuid::Uuid;

fn actor(id: u128) -> Principal {
    let mut principal = fixture_principal(id);
    principal.scopes = Scope::all();
    principal
}

async fn xp(fixture: &Fixture, habit: Uuid) -> i64 {
    fixture.store.statistics(&actor(1), habit).await.unwrap().xp
}

#[tokio::test]
async fn corrections_cancellation_and_replay_compensate_xp_exactly_once() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    let alice = actor(1);
    let input = entry_input();
    let entry = entries::record(
        &fixture.store,
        &alice,
        habit.id,
        "initial",
        input.clone(),
        Utc::now(),
    )
    .await
    .unwrap()
    .entry;
    assert_eq!(xp(&fixture, habit.id).await, 10);

    let mut lower = input.clone();
    lower.value = 2500.0;
    fixture
        .store
        .change_entry(&alice, entry.id, "lower", Some(lower.clone()))
        .await
        .unwrap();
    assert_eq!(xp(&fixture, habit.id).await, 0);
    let ledger_rows = fixture.count("xp_ledger").await;
    let event_rows = fixture.count("entry_events").await;
    let retry = fixture
        .store
        .change_entry(&alice, entry.id, "lower", Some(lower))
        .await
        .unwrap();
    assert_eq!(retry.value, 2500.0);
    assert_eq!(fixture.count("xp_ledger").await, ledger_rows);
    assert_eq!(fixture.count("entry_events").await, event_rows);
    assert!(matches!(
        fixture
            .store
            .change_entry(&alice, entry.id, "lower", Some(input.clone()))
            .await,
        Err(DomainError::Conflict)
    ));

    fixture
        .store
        .change_entry(&alice, entry.id, "raise", Some(input))
        .await
        .unwrap();
    assert_eq!(xp(&fixture, habit.id).await, 10);
    assert_eq!(fixture.count("xp_ledger").await, 3);
    fixture.store.recalculate(&alice, habit.id).await.unwrap();
    fixture.store.recalculate(&alice, habit.id).await.unwrap();
    assert_eq!(xp(&fixture, habit.id).await, 10);
    assert_eq!(fixture.count("xp_ledger").await, 3);

    fixture
        .store
        .change_entry(&alice, entry.id, "cancel", None)
        .await
        .unwrap();
    fixture
        .store
        .change_entry(&alice, entry.id, "cancel", None)
        .await
        .unwrap();
    assert_eq!(xp(&fixture, habit.id).await, 0);
    assert_eq!(fixture.count("xp_ledger").await, 4);
    assert_eq!(fixture.count("entry_events").await, 4);
    assert!(matches!(
        entries::get(&fixture.store, &alice, entry.id).await,
        Err(DomainError::NotFound)
    ));
    assert!(
        entries::list(&fixture.store, &alice, habit.id, Pagination::default())
            .await
            .unwrap()
            .items
            .is_empty()
    );
    fixture.store.recalculate(&alice, habit.id).await.unwrap();
    assert_eq!(fixture.count("xp_ledger").await, 4);
    let amounts: Vec<i64> = sqlx::query_scalar("SELECT amount FROM xp_ledger ORDER BY rowid")
        .fetch_all(&fixture.store.pool)
        .await
        .unwrap();
    assert_eq!(amounts, vec![10, -10, 10, -10]);
}

#[tokio::test]
async fn tracking_mutations_and_statistics_hide_foreign_tenant_resources() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    let entry = entries::record(
        &fixture.store,
        &actor(1),
        habit.id,
        "owned",
        entry_input(),
        Utc::now(),
    )
    .await
    .unwrap()
    .entry;
    let bob = actor(2);
    let tomorrow = Utc::now()
        .with_timezone(&chrono_tz::Europe::Paris)
        .date_naive()
        + Duration::days(1);
    assert!(matches!(
        fixture.store.get_habit(&bob, habit.id).await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture.store.statistics(&bob, habit.id).await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture.store.recalculate(&bob, habit.id).await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture.store.archive_habit(&bob, habit.id).await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .update_habit(
                &bob,
                habit.id,
                UpdateHabit {
                    effective_from: tomorrow,
                    definition: habit.definition.clone()
                }
            )
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .set_rest(&bob, habit.id, entry.local_date, true)
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .set_rest(&bob, habit.id, entry.local_date, false)
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .rests(&bob, habit.id, Pagination::default())
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .change_entry(&bob, entry.id, "foreign-correction", Some(entry_input()))
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        fixture
            .store
            .change_entry(&bob, entry.id, "foreign-cancel", None)
            .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        entries::get(&fixture.store, &bob, entry.id).await,
        Err(DomainError::NotFound)
    ));
    assert_eq!(xp(&fixture, habit.id).await, 10);
    assert_eq!(fixture.count("entry_events").await, 1);
    assert_eq!(fixture.count("xp_ledger").await, 1);
    assert!(
        fixture
            .store
            .get_habit(&actor(1), habit.id)
            .await
            .unwrap()
            .archived_at
            .is_none()
    );
}

#[tokio::test]
async fn adding_and_removing_rest_compensates_completed_period_without_duplicate_rewards() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    let alice = actor(1);
    let entry = entries::record(
        &fixture.store,
        &alice,
        habit.id,
        "rest-entry",
        entry_input(),
        Utc::now(),
    )
    .await
    .unwrap()
    .entry;
    assert_eq!(xp(&fixture, habit.id).await, 10);
    fixture
        .store
        .set_rest(&alice, habit.id, entry.local_date, true)
        .await
        .unwrap();
    fixture
        .store
        .set_rest(&alice, habit.id, entry.local_date, true)
        .await
        .unwrap();
    assert_eq!(xp(&fixture, habit.id).await, 0);
    assert_eq!(fixture.count("xp_ledger").await, 2);
    let (eligible_days, progress, completed): (i64, f64, bool) = sqlx::query_as(
        "SELECT eligible_days, progress, completed FROM period_projections WHERE user_id = ? AND habit_id = ? AND period_start = ?",
    )
    .bind(alice.user_id.0.to_string())
    .bind(habit.id.to_string())
    .bind(entry.local_date)
    .fetch_one(&fixture.store.pool)
    .await
    .unwrap();
    assert_eq!(eligible_days, 0);
    assert_eq!(progress, 0.0);
    assert!(!completed);
    let rests = fixture
        .store
        .rests(&alice, habit.id, Pagination::default())
        .await
        .unwrap();
    assert_eq!(rests.len(), 1);
    assert_eq!(rests[0].local_date, entry.local_date);
    fixture
        .store
        .set_rest(&alice, habit.id, entry.local_date, false)
        .await
        .unwrap();
    fixture
        .store
        .set_rest(&alice, habit.id, entry.local_date, false)
        .await
        .unwrap();
    assert_eq!(xp(&fixture, habit.id).await, 10);
    assert_eq!(fixture.count("xp_ledger").await, 3);
    assert!(
        fixture
            .store
            .rests(&alice, habit.id, Pagination::default())
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(fixture.count("entry_events").await, 1);
}

#[tokio::test]
async fn future_definition_preserves_historical_target_completion_and_xp() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    let alice = actor(1);
    let entry = entries::record(
        &fixture.store,
        &alice,
        habit.id,
        "history",
        entry_input(),
        Utc::now(),
    )
    .await
    .unwrap()
    .entry;
    let tomorrow = Utc::now()
        .with_timezone(&chrono_tz::Europe::Paris)
        .date_naive()
        + Duration::days(1);
    let mut future = habit.definition.clone();
    future.target = 10000.0;
    let version = fixture
        .store
        .update_habit(
            &alice,
            habit.id,
            UpdateHabit {
                effective_from: tomorrow,
                definition: future,
            },
        )
        .await
        .unwrap();
    assert_eq!(version.effective_from, tomorrow);
    assert_eq!(version.definition.target, 10000.0);
    assert_eq!(
        fixture
            .store
            .get_habit(&alice, habit.id)
            .await
            .unwrap()
            .definition
            .target,
        5000.0
    );
    fixture.store.recalculate(&alice, habit.id).await.unwrap();
    let stats = fixture.store.statistics(&alice, habit.id).await.unwrap();
    let (target, progress, completed): (f64, f64, bool) = sqlx::query_as(
        "SELECT target, progress, completed FROM period_projections WHERE user_id = ? AND habit_id = ? AND period_start = ?",
    )
    .bind(alice.user_id.0.to_string())
    .bind(habit.id.to_string())
    .bind(entry.local_date)
    .fetch_one(&fixture.store.pool)
    .await
    .unwrap();
    assert_eq!(target, 5000.0);
    assert_eq!(progress, 5000.0);
    assert!(completed);
    assert_eq!(stats.xp, 10);
    assert_eq!(fixture.count("xp_ledger").await, 1);
}

#[tokio::test]
async fn weekly_frequency_rewards_one_period_after_three_distinct_checkins() {
    let fixture = Fixture::new().await;
    let alice = actor(1);
    let mut definition = habit_input();
    definition.kind = HabitKind::Frequency;
    definition.unit = Unit::Count;
    definition.period = Period::Weekly;
    definition.target = 3.0;
    let habit = habits::create(&fixture.store, &alice, definition)
        .await
        .unwrap();
    for (index, instant) in [
        "2026-03-23T12:00:00Z",
        "2026-03-24T12:00:00Z",
        "2026-03-25T12:00:00Z",
    ]
    .into_iter()
    .enumerate()
    {
        let key = format!("weekly-{index}");
        let input = NewEntry {
            occurred_at: instant.parse().unwrap(),
            value: 1.0,
        };
        let created = entries::record(
            &fixture.store,
            &alice,
            habit.id,
            &key,
            input.clone(),
            Utc::now(),
        )
        .await
        .unwrap();
        let replay = entries::record(&fixture.store, &alice, habit.id, &key, input, Utc::now())
            .await
            .unwrap();
        assert!(created.created);
        assert!(!replay.created);
        assert_eq!(created.entry.id, replay.entry.id);
        assert_eq!(
            xp(&fixture, habit.id).await,
            if index == 2 { 10 } else { 0 }
        );
    }
    let monday: NaiveDate = "2026-03-23".parse().unwrap();
    let (progress, target, completed): (f64, f64, bool) = sqlx::query_as(
        "SELECT progress, target, completed FROM period_projections WHERE user_id = ? AND habit_id = ? AND period_start = ?",
    )
    .bind(alice.user_id.0.to_string())
    .bind(habit.id.to_string())
    .bind(monday)
    .fetch_one(&fixture.store.pool)
    .await
    .unwrap();
    assert_eq!(progress, 3.0);
    assert_eq!(target, 3.0);
    assert!(completed);
    assert_eq!(fixture.count("entries").await, 3);
    assert_eq!(fixture.count("entry_events").await, 3);
    assert_eq!(fixture.count("xp_ledger").await, 1);
    entries::record(
        &fixture.store,
        &alice,
        habit.id,
        "weekly-fourth",
        NewEntry {
            occurred_at: "2026-03-26T12:00:00Z".parse().unwrap(),
            value: 1.0,
        },
        Utc::now(),
    )
    .await
    .unwrap();
    fixture.store.recalculate(&alice, habit.id).await.unwrap();
    assert_eq!(xp(&fixture, habit.id).await, 10);
    assert_eq!(fixture.count("xp_ledger").await, 1);
}

#[tokio::test]
async fn upgrading_initial_database_preserves_legacy_events_and_xp_then_allows_compensation() {
    let directory = tempfile::tempdir().unwrap();
    let migrations = directory.path().join("initial-migrations");
    std::fs::create_dir(&migrations).unwrap();
    std::fs::write(
        migrations.join("0001_initial.sql"),
        include_str!("../../../migrations/0001_initial.sql"),
    )
    .unwrap();
    let database = directory.path().join("legacy.sqlite");
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&database)
                .create_if_missing(true)
                .foreign_keys(true),
        )
        .await
        .unwrap();
    sqlx::migrate::Migrator::new(migrations.as_path())
        .await
        .unwrap()
        .run(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../../tests/fixtures/users.sql"))
        .execute(&pool)
        .await
        .unwrap();
    let alice = actor(1);
    let habit = Uuid::new_v4();
    let entry = Uuid::new_v4();
    let event = Uuid::new_v4();
    let ledger = Uuid::new_v4();
    let input = entry_input();
    let definition = habit_input();
    let local_date = input
        .occurred_at
        .with_timezone(&chrono_tz::Europe::Paris)
        .date_naive();
    sqlx::query("INSERT INTO habits (id, user_id, definition, created_at) VALUES (?, ?, ?, ?)")
        .bind(habit.to_string())
        .bind(alice.user_id.0.to_string())
        .bind(serde_json::to_string(&definition).unwrap())
        .bind(input.occurred_at)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO schedules (habit_id, user_id, definition) VALUES (?, ?, ?)")
        .bind(habit.to_string())
        .bind(alice.user_id.0.to_string())
        .bind(serde_json::to_string(&definition.schedule).unwrap())
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO entries (id, user_id, habit_id, occurred_at, local_date, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(entry.to_string()).bind(alice.user_id.0.to_string()).bind(habit.to_string()).bind(input.occurred_at).bind(local_date).bind(input.value).bind(input.occurred_at).execute(&pool).await.unwrap();
    let payload = serde_json::to_string(&CheckInPayload {
        habit_id: habit,
        entry: input.clone(),
    })
    .unwrap();
    sqlx::query("INSERT INTO entry_events (id, user_id, entry_id, idempotency_key, operation, payload, created_at) VALUES (?, ?, ?, 'legacy-entry', 'create', ?, ?)").bind(event.to_string()).bind(alice.user_id.0.to_string()).bind(entry.to_string()).bind(payload).bind(input.occurred_at).execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO xp_ledger (id, user_id, event_id, amount, created_at) VALUES (?, ?, ?, 10, ?)",
    )
    .bind(ledger.to_string())
    .bind(alice.user_id.0.to_string())
    .bind(event.to_string())
    .bind(input.occurred_at)
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;

    let store = Store::connect(&format!("sqlite://{}", database.display()))
        .await
        .unwrap();
    MIGRATOR.run(&store.pool).await.unwrap();
    assert_eq!(
        entries::get(&store, &alice, entry).await.unwrap().value,
        5000.0
    );
    assert_eq!(store.statistics(&alice, habit).await.unwrap().xp, 10);
    let preserved: (String, String, NaiveDate) =
        sqlx::query_as("SELECT id, habit_id, period_start FROM xp_ledger WHERE id = ?")
            .bind(ledger.to_string())
            .fetch_one(&store.pool)
            .await
            .unwrap();
    assert_eq!(
        preserved,
        (ledger.to_string(), habit.to_string(), local_date)
    );
    let copied_events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM domain_events WHERE id = ?")
        .bind(event.to_string())
        .fetch_one(&store.pool)
        .await
        .unwrap();
    assert_eq!(copied_events, 1);
    store.recalculate(&alice, habit).await.unwrap();
    let rewards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM xp_ledger")
        .fetch_one(&store.pool)
        .await
        .unwrap();
    assert_eq!(rewards, 1);
    store
        .change_entry(&alice, entry, "legacy-cancel", None)
        .await
        .unwrap();
    assert_eq!(store.statistics(&alice, habit).await.unwrap().xp, 0);
    let compensation: Option<String> =
        sqlx::query_scalar("SELECT compensates_id FROM xp_ledger WHERE amount = -10")
            .fetch_one(&store.pool)
            .await
            .unwrap();
    assert_eq!(compensation, Some(ledger.to_string()));
    assert!(
        sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&store.pool)
            .await
            .unwrap()
            .is_empty()
    );
    store.close().await;
}
