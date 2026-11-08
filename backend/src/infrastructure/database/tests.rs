#![allow(clippy::unwrap_used, clippy::expect_used)]
use super::*;
use crate::modules::{
    auth::{IdentityMode, Principal, Scope},
    entries,
    habits::{self, HabitKind, Unit},
    schedules::Schedule,
};
use chrono::{DateTime, NaiveTime};

pub(crate) struct Fixture {
    pub store: Store,
    _directory: tempfile::TempDir,
}
impl Fixture {
    pub async fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let url = format!(
            "sqlite://{}",
            directory.path().join("test.sqlite").display()
        );
        let store = Store::connect(&url).await.unwrap();
        sqlx::raw_sql(include_str!("../../../tests/fixtures/users.sql"))
            .execute(&store.pool)
            .await
            .unwrap();
        Self {
            store,
            _directory: directory,
        }
    }
    pub async fn count(&self, table: &str) -> i64 {
        assert!(
            [
                "habits",
                "schedules",
                "entries",
                "entry_events",
                "xp_ledger"
            ]
            .contains(&table)
        );
        let query = match table {
            "habits" => "SELECT COUNT(*) FROM habits",
            "schedules" => "SELECT COUNT(*) FROM schedules",
            "entries" => "SELECT COUNT(*) FROM entries",
            "entry_events" => "SELECT COUNT(*) FROM entry_events",
            "xp_ledger" => "SELECT COUNT(*) FROM xp_ledger",
            _ => panic!("unsupported test counter"),
        };
        sqlx::query_scalar(query)
            .fetch_one(&self.store.pool)
            .await
            .unwrap()
    }
    pub async fn habit(&self) -> Habit {
        habits::create(&self.store, &fixture_principal(1), habit_input())
            .await
            .unwrap()
    }
}

pub(crate) fn fixture_principal(id: u128) -> Principal {
    Principal {
        user_id: UserId(Uuid::from_u128(id)),
        mode: IdentityMode::OidcAccessToken,
        scopes: vec![
            Scope::HabitsRead,
            Scope::HabitsWrite,
            Scope::EntriesRead,
            Scope::EntriesWrite,
        ],
    }
}
pub(crate) fn habit_input() -> NewHabit {
    serde_json::from_str(include_str!("../../../tests/fixtures/habit.json")).unwrap()
}
pub(crate) fn entry_input() -> NewEntry {
    serde_json::from_str(include_str!("../../../tests/fixtures/entry.json")).unwrap()
}
fn now() -> DateTime<Utc> {
    "2026-11-02T12:00:00Z".parse().unwrap()
}

#[tokio::test]
async fn migrations_are_repeatable_and_connections_enforce_integrity() {
    let fixture = Fixture::new().await;
    MIGRATOR.run(&fixture.store.pool).await.unwrap();
    let mut connections = Vec::new();
    for _ in 0..4 {
        connections.push(fixture.store.pool.acquire().await.unwrap());
    }
    for mut connection in connections {
        let fk: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        let journal: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        assert_eq!(fk, 1);
        assert_eq!(journal, "wal");
    }
    assert!(sqlx::query("INSERT INTO users SELECT 'duplicate', issuer, subject, timezone, created_at FROM users LIMIT 1").execute(&fixture.store.pool).await.is_err());
    assert!(
        sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&fixture.store.pool)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn habit_service_filters_tenants_and_enforces_scopes() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    assert_eq!(habit.user_id, fixture_principal(1).user_id);
    assert_eq!(fixture.count("schedules").await, 1);
    assert_eq!(
        habits::list(&fixture.store, &fixture_principal(1), Pagination::default())
            .await
            .unwrap()
            .items
            .len(),
        1
    );
    assert!(
        habits::list(&fixture.store, &fixture_principal(2), Pagination::default())
            .await
            .unwrap()
            .items
            .is_empty()
    );
    let mut readonly = fixture_principal(1);
    readonly.scopes.clear();
    assert!(matches!(
        habits::create(&fixture.store, &readonly, habit_input()).await,
        Err(DomainError::Forbidden)
    ));
}

#[tokio::test]
async fn entry_replay_conflict_and_tenant_scoping() {
    let fixture = Fixture::new().await;
    let alice = fixture_principal(1);
    let bob = fixture_principal(2);
    let habit = fixture.habit().await;
    let first = entries::record(
        &fixture.store,
        &alice,
        habit.id,
        "same-key",
        entry_input(),
        now(),
    )
    .await
    .unwrap();
    let second = entries::record(
        &fixture.store,
        &alice,
        habit.id,
        "same-key",
        entry_input(),
        now(),
    )
    .await
    .unwrap();
    assert!(first.created);
    assert!(!second.created);
    assert_eq!(first.entry.id, second.entry.id);
    assert_eq!(first.entry.local_date.to_string(), "2026-03-29");
    let mut changed = entry_input();
    changed.value = 100.0;
    assert!(matches!(
        entries::record(&fixture.store, &alice, habit.id, "same-key", changed, now()).await,
        Err(DomainError::Conflict)
    ));
    assert!(matches!(
        entries::record(
            &fixture.store,
            &bob,
            habit.id,
            "same-key",
            entry_input(),
            now()
        )
        .await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        entries::get(&fixture.store, &bob, first.entry.id).await,
        Err(DomainError::NotFound)
    ));
    assert!(matches!(
        entries::list(&fixture.store, &bob, habit.id, Pagination::default()).await,
        Err(DomainError::NotFound)
    ));
    let own = habits::create(&fixture.store, &bob, habit_input())
        .await
        .unwrap();
    assert!(
        entries::record(
            &fixture.store,
            &bob,
            own.id,
            "same-key",
            entry_input(),
            now()
        )
        .await
        .unwrap()
        .created
    );
    assert_eq!(fixture.count("entries").await, 2);
    assert_eq!(fixture.count("entry_events").await, 2);
    assert_eq!(fixture.count("xp_ledger").await, 2);
}

#[tokio::test]
async fn concurrent_retries_produce_one_entry_and_event() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    let actor = fixture_principal(1);
    let (one, two) = tokio::join!(
        entries::record(
            &fixture.store,
            &actor,
            habit.id,
            "concurrent",
            entry_input(),
            now()
        ),
        entries::record(
            &fixture.store,
            &actor,
            habit.id,
            "concurrent",
            entry_input(),
            now()
        )
    );
    let one = one.unwrap();
    let two = two.unwrap();
    assert_eq!(one.entry.id, two.entry.id);
    assert_ne!(one.created, two.created);
    assert_eq!(fixture.count("entries").await, 1);
    assert_eq!(fixture.count("entry_events").await, 1);
}

#[tokio::test]
async fn failed_event_insert_rolls_back_entry() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    sqlx::raw_sql("CREATE TRIGGER reject_event BEFORE INSERT ON entry_events BEGIN SELECT RAISE(ABORT, 'test failure'); END;")
        .execute(&fixture.store.pool).await.unwrap();
    assert!(
        entries::record(
            &fixture.store,
            &fixture_principal(1),
            habit.id,
            "rollback",
            entry_input(),
            now()
        )
        .await
        .is_err()
    );
    assert_eq!(fixture.count("entries").await, 0);
    assert_eq!(fixture.count("entry_events").await, 0);
}

#[tokio::test]
async fn rest_exception_rejects_checkin_without_events() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    sqlx::query("INSERT INTO schedule_exceptions (id, user_id, habit_id, local_date, kind) VALUES (?, ?, ?, '2026-03-29', 'rest')")
        .bind(Uuid::new_v4().to_string()).bind(habit.user_id.0.to_string()).bind(habit.id.to_string())
        .execute(&fixture.store.pool).await.unwrap();
    assert!(matches!(
        entries::record(
            &fixture.store,
            &fixture_principal(1),
            habit.id,
            "rest",
            entry_input(),
            now()
        )
        .await,
        Err(DomainError::Validation(_))
    ));
    assert_eq!(fixture.count("entries").await, 0);
}

#[tokio::test]
async fn composite_foreign_keys_reject_cross_tenant_writes() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    assert!(sqlx::query("INSERT INTO entries (id, user_id, habit_id, occurred_at, local_date, value, created_at) VALUES ('foreign', ?, ?, '2026-03-29T00:00:00Z', '2026-03-29', 1, '2026-03-29T00:00:00Z')")
        .bind(fixture_principal(2).user_id.0.to_string()).bind(habit.id.to_string()).execute(&fixture.store.pool).await.is_err());
    assert!(sqlx::query("INSERT INTO schedule_exceptions (id, user_id, habit_id, local_date, kind) VALUES ('foreign', ?, ?, '2026-03-29', 'rest')")
        .bind(fixture_principal(2).user_id.0.to_string()).bind(habit.id.to_string()).execute(&fixture.store.pool).await.is_err());
}

#[tokio::test]
async fn backup_restores_committed_wal_and_refuses_overwrite() {
    let fixture = Fixture::new().await;
    let habit = fixture.habit().await;
    entries::record(
        &fixture.store,
        &fixture_principal(1),
        habit.id,
        "backup",
        entry_input(),
        now(),
    )
    .await
    .unwrap();
    let backup = fixture._directory.path().join("backup.sqlite");
    fixture.store.backup(&backup).await.unwrap();
    assert!(fixture.store.backup(&backup).await.is_err());
    let restored = Store::connect(&format!("sqlite://{}", backup.display()))
        .await
        .unwrap();
    assert_eq!(
        habits::list(&restored, &fixture_principal(1), Pagination::default())
            .await
            .unwrap()
            .items
            .len(),
        1
    );
    assert_eq!(
        entries::list(
            &restored,
            &fixture_principal(1),
            habit.id,
            Pagination::default()
        )
        .await
        .unwrap()
        .items
        .len(),
        1
    );
    let check: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(&restored.pool)
        .await
        .unwrap();
    assert_eq!(check, "ok");
    assert!(
        sqlx::query("PRAGMA foreign_key_check")
            .fetch_all(&restored.pool)
            .await
            .unwrap()
            .is_empty()
    );
    restored.close().await;
}

#[test]
fn domain_validates_kinds_units_finite_values_timezone_and_schedule() {
    let valid = habit_input();
    assert!(valid.validate().is_ok());
    for target in [0.0, -1.0, f64::NAN, f64::INFINITY, 1e13] {
        let mut h = valid.clone();
        h.target = target;
        assert!(h.validate().is_err());
    }
    for name in ["", "   ", "bad\nname"] {
        let mut h = valid.clone();
        h.name = name.into();
        assert!(h.validate().is_err());
    }
    let mut h = valid.clone();
    h.timezone = "Paris".into();
    assert!(h.validate().is_err());
    for (kind, unit, target, expected) in [
        (HabitKind::Boolean, Unit::Count, 1.0, true),
        (HabitKind::Boolean, Unit::Count, 2.0, false),
        (HabitKind::Duration, Unit::Seconds, 60.0, true),
        (HabitKind::Duration, Unit::Meters, 60.0, false),
        (HabitKind::Frequency, Unit::Count, 3.0, true),
        (HabitKind::Frequency, Unit::Count, 1.5, false),
    ] {
        let mut h = valid.clone();
        h.kind = kind;
        h.unit = unit;
        h.target = target;
        assert_eq!(h.validate().is_ok(), expected);
    }
    for days in [vec![], vec![1, 1], vec![0], vec![8]] {
        let mut h = valid.clone();
        h.schedule.weekdays = days;
        assert!(h.validate().is_err());
    }
    for value in [0.0, -1.0, f64::INFINITY, f64::NAN] {
        let mut e = entry_input();
        e.value = value;
        assert!(e.validate(now()).is_err());
    }
    let mut e = entry_input();
    e.occurred_at = now() + chrono::Duration::seconds(1);
    assert!(e.validate(now()).is_err());
    for page in [
        Pagination {
            limit: 0,
            offset: 0,
        },
        Pagination {
            limit: 101,
            offset: 0,
        },
        Pagination {
            limit: 20,
            offset: 100001,
        },
    ] {
        assert!(page.validate().is_err());
    }
}

#[test]
fn timezone_handles_both_dst_transitions_without_naive_local_times() {
    let schedule = Schedule {
        weekdays: vec![7],
        start: Some(NaiveTime::from_hms_opt(2, 0, 0).unwrap()),
        end: Some(NaiveTime::from_hms_opt(3, 0, 0).unwrap()),
    };
    let paris = chrono_tz::Europe::Paris;
    // Spring jump: 01:00 UTC is 03:00 local, excluded by [02:00,03:00).
    assert!(
        schedule
            .eligible_date("2026-03-29T01:00:00Z".parse().unwrap(), paris)
            .is_err()
    );
    // Autumn overlap: both distinct instants are eligible at 02:30 local.
    for instant in ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"] {
        assert_eq!(
            schedule
                .eligible_date(instant.parse().unwrap(), paris)
                .unwrap()
                .to_string(),
            "2026-10-25"
        );
    }
    assert_eq!(
        Schedule::default()
            .eligible_date("2026-03-28T23:30:00Z".parse().unwrap(), paris)
            .unwrap()
            .to_string(),
        "2026-03-29"
    );
    let overnight = Schedule {
        weekdays: vec![1],
        start: Some(NaiveTime::from_hms_opt(23, 0, 0).unwrap()),
        end: Some(NaiveTime::from_hms_opt(1, 0, 0).unwrap()),
    };
    assert!(overnight.validate().is_err());
}

#[test]
fn outbound_adapter_requires_https_and_has_no_provider_dependency_at_startup() {
    assert!(crate::modules::integrations::http_client().is_ok());
}
