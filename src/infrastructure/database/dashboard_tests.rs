#![allow(clippy::unwrap_used)]
use super::{
    Store,
    tests::{Fixture, fixture_principal, habit_input},
};
use crate::modules::{
    DomainError,
    auth::{Principal, Scope},
    entries::{self, NewEntry},
    habits::{
        self, Habit, HabitCategory, HabitKind, Unit,
        presentation::{ActionRequest, HabitAction, Presentation},
    },
};
use chrono::{Duration, Utc};

fn actor(id: u128) -> Principal {
    let mut p = fixture_principal(id);
    p.scopes = Scope::all();
    p
}
async fn habit(
    store: &Store,
    category: HabitCategory,
    target: f64,
    kind: HabitKind,
    value: f64,
) -> Habit {
    let mut input = habit_input();
    input.category = category;
    input.target = target;
    input.kind = kind;
    input.unit = Unit::Count;
    input.timezone = "UTC".into();
    let h = habits::create(store, &actor(1), input).await.unwrap();
    if value > 0.0 {
        entries::record(
            store,
            &actor(1),
            h.id,
            &format!("seed:{}", h.id),
            NewEntry {
                occurred_at: Utc::now(),
                value,
            },
            Utc::now(),
        )
        .await
        .unwrap();
    }
    h
}
#[tokio::test]
async fn dashboard_reproduces_ring_weights_counts_and_real_history() {
    let f = Fixture::new().await;
    habit(
        &f.store,
        HabitCategory::Sport,
        25.0,
        HabitKind::Quantity,
        22.0,
    )
    .await;
    habit(
        &f.store,
        HabitCategory::Sport,
        3000.0,
        HabitKind::Quantity,
        1400.0,
    )
    .await;
    for _ in 0..3 {
        habit(&f.store, HabitCategory::Mind, 1.0, HabitKind::Boolean, 1.0).await;
    }
    for value in [1.0, 1.0, 1.0, 1.0, 0.0] {
        habit(
            &f.store,
            HabitCategory::Daily,
            1.0,
            HabitKind::Boolean,
            value,
        )
        .await;
    }
    habit(
        &f.store,
        HabitCategory::Nutrition,
        2000.0,
        HabitKind::Quantity,
        1750.0,
    )
    .await;
    habit(
        &f.store,
        HabitCategory::Nutrition,
        5.0,
        HabitKind::Quantity,
        3.0,
    )
    .await;
    let d = f.store.dashboard(&actor(1)).await.unwrap();
    assert_eq!(d.global_percent.unwrap().round(), 80.0);
    assert!((d.groups[0].percent.unwrap() - 67.333333).abs() < 0.00001);
    assert_eq!(d.groups[1].completed, 3);
    assert_eq!(d.groups[1].eligible, 3);
    assert_eq!(d.groups[2].completed, 4);
    assert_eq!(d.groups[2].eligible, 5);
    assert_eq!(d.groups[3].percent, Some(73.75));
    assert_eq!(d.heatmap.len(), 91);
    assert_eq!(d.weekly.current.len(), 7);
    assert_eq!(d.weekly.previous.len(), 7);
    assert!(d.heatmap[..90].iter().all(|day| day.percent.is_none()));
    let other = f.store.dashboard(&actor(2)).await.unwrap();
    assert!(other.global_percent.is_none());
    assert!(other.groups.iter().all(|g| g.habits.is_empty()));
    assert!(matches!(
        f.store.dashboard(&fixture_principal(1)).await,
        Err(DomainError::Forbidden)
    ));
}
#[tokio::test]
async fn actions_are_atomic_replayable_and_compensate_without_negative_entries() {
    let f = Fixture::new().await;
    let h = habit(
        &f.store,
        HabitCategory::Nutrition,
        500.0,
        HabitKind::Quantity,
        0.0,
    )
    .await;
    f.store
        .set_presentation(
            &actor(1),
            h.id,
            Presentation {
                step: 250.0,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let request = || ActionRequest {
        action: HabitAction::Increment,
    };
    let alice = actor(1);
    let (a, b) = tokio::join!(
        f.store.habit_action(&alice, h.id, "same", request()),
        f.store.habit_action(&alice, h.id, "same", request())
    );
    assert_eq!(a.unwrap().id, b.unwrap().id);
    f.store
        .habit_action(&actor(1), h.id, "second", request())
        .await
        .unwrap();
    assert_eq!(f.store.statistics(&actor(1), h.id).await.unwrap().xp, 10);
    let undo = || ActionRequest {
        action: HabitAction::Decrement,
    };
    assert_eq!(
        f.store
            .habit_action(&actor(1), h.id, "undo", undo())
            .await
            .unwrap()
            .progress,
        250.0
    );
    f.store
        .habit_action(&actor(1), h.id, "undo", undo())
        .await
        .unwrap();
    assert_eq!(f.store.statistics(&actor(1), h.id).await.unwrap().xp, 0);
    assert!(matches!(
        f.store
            .habit_action(&actor(1), h.id, "undo", request())
            .await,
        Err(DomainError::Conflict)
    ));
    f.store
        .habit_action(&actor(1), h.id, "undo-second", undo())
        .await
        .unwrap();
    assert!(matches!(
        f.store
            .habit_action(&actor(1), h.id, "below-zero", undo())
            .await,
        Err(DomainError::Conflict)
    ));
    assert_eq!(f.count("entries").await, 2);
    let boolean = habit(&f.store, HabitCategory::Mind, 1.0, HabitKind::Boolean, 0.0).await;
    for key in ["done", "done-again"] {
        f.store
            .habit_action(
                &actor(1),
                boolean.id,
                key,
                ActionRequest {
                    action: HabitAction::Complete,
                },
            )
            .await
            .unwrap();
    }
    assert_eq!(
        f.store.statistics(&actor(1), boolean.id).await.unwrap().xp,
        10
    );
    f.store
        .habit_action(
            &actor(1),
            boolean.id,
            "not-done",
            ActionRequest {
                action: HabitAction::Uncomplete,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        f.store.statistics(&actor(1), boolean.id).await.unwrap().xp,
        0
    );
    assert!(matches!(
        f.store
            .habit_action(&actor(2), h.id, "foreign", request())
            .await,
        Err(DomainError::NotFound)
    ));
}
#[tokio::test]
async fn receipt_failure_rolls_back_entries_xp_and_revision() {
    let f = Fixture::new().await;
    let h = habit(&f.store, HabitCategory::Mind, 1.0, HabitKind::Boolean, 0.0).await;
    let revision = f.store.dashboard_revision(actor(1).user_id).await.unwrap();
    sqlx::raw_sql("CREATE TRIGGER reject_receipt BEFORE INSERT ON action_receipts BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;")
        .execute(&f.store.pool).await.unwrap();
    assert!(
        f.store
            .habit_action(
                &actor(1),
                h.id,
                "rollback",
                ActionRequest {
                    action: HabitAction::Complete
                }
            )
            .await
            .is_err()
    );
    assert_eq!(f.count("entries").await, 0);
    assert_eq!(f.count("xp_ledger").await, 0);
    assert_eq!(
        f.store.dashboard_revision(actor(1).user_id).await.unwrap(),
        revision
    );
}

#[tokio::test]
async fn fractional_and_tiny_steps_can_be_undone_to_zero() {
    let f = Fixture::new().await;
    for step in [0.1, 1e-12] {
        let h = habit(
            &f.store,
            HabitCategory::Daily,
            1.0,
            HabitKind::Quantity,
            step * 3.0,
        )
        .await;
        f.store
            .set_presentation(
                &actor(1),
                h.id,
                Presentation {
                    step,
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        for n in 0..3 {
            f.store
                .habit_action(
                    &actor(1),
                    h.id,
                    &format!("fraction:{}:{n}", h.id),
                    ActionRequest {
                        action: HabitAction::Decrement,
                    },
                )
                .await
                .unwrap();
        }
        assert_eq!(
            f.store
                .statistics(&actor(1), h.id)
                .await
                .unwrap()
                .periods
                .last()
                .unwrap()
                .progress,
            0.0
        );
    }
}

#[tokio::test]
async fn decrement_cannot_remove_provider_entries() {
    let f = Fixture::new().await;
    let h = habit(
        &f.store,
        HabitCategory::Sport,
        100.0,
        HabitKind::Quantity,
        50.0,
    )
    .await;
    let integration = uuid::Uuid::new_v4();
    sqlx::query("INSERT INTO integrations(id,user_id,provider,provider_subject,created_at) VALUES (?, ?, 'strava', 'fixture-athlete', ?)")
        .bind(integration.to_string()).bind(actor(1).user_id.0.to_string()).bind(Utc::now()).execute(&f.store.pool).await.unwrap();
    let id: String = sqlx::query_scalar("SELECT id FROM entries WHERE habit_id = ?")
        .bind(h.id.to_string())
        .fetch_one(&f.store.pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO source_identifiers(id,user_id,integration_id,entry_id,provider_object_id) VALUES (?, ?, ?, ?, 'fixture-activity')")
        .bind(uuid::Uuid::new_v4().to_string()).bind(actor(1).user_id.0.to_string()).bind(integration.to_string()).bind(id).execute(&f.store.pool).await.unwrap();
    assert!(matches!(
        f.store
            .habit_action(
                &actor(1),
                h.id,
                "provider-undo",
                ActionRequest {
                    action: HabitAction::Decrement
                }
            )
            .await,
        Err(DomainError::Conflict)
    ));
    assert_eq!(
        f.store
            .statistics(&actor(1), h.id)
            .await
            .unwrap()
            .periods
            .last()
            .unwrap()
            .progress,
        50.0
    );
}
#[tokio::test]
async fn rests_weights_presentation_validation_and_timezones_are_preserved() {
    let f = Fixture::new().await;
    let done = habit(&f.store, HabitCategory::Daily, 1.0, HabitKind::Boolean, 1.0).await;
    let pending = habit(&f.store, HabitCategory::Daily, 1.0, HabitKind::Boolean, 0.0).await;
    f.store
        .set_presentation(
            &actor(1),
            done.id,
            Presentation {
                weight: 3.0,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(
        f.store.dashboard(&actor(1)).await.unwrap().global_percent,
        Some(75.0)
    );
    f.store
        .set_rest(&actor(1), pending.id, Utc::now().date_naive(), true)
        .await
        .unwrap();
    assert_eq!(
        f.store.dashboard(&actor(1)).await.unwrap().global_percent,
        Some(100.0)
    );
    assert!(
        f.store
            .set_presentation(
                &actor(1),
                done.id,
                Presentation {
                    color: Some("url(evil)".into()),
                    ..Default::default()
                }
            )
            .await
            .is_err()
    );
    assert!(
        f.store
            .set_presentation(
                &actor(1),
                done.id,
                Presentation {
                    icon: Some("mdi:".into()),
                    ..Default::default()
                }
            )
            .await
            .is_err()
    );
    assert!(matches!(
        f.store
            .set_presentation(&actor(2), done.id, Presentation::default())
            .await,
        Err(DomainError::NotFound)
    ));
    // A UTC boundary is independently evaluated in the habit's IANA timezone.
    let mut input = habit_input();
    input.timezone = "Pacific/Kiritimati".into();
    let h = habits::create(&f.store, &actor(1), input).await.unwrap();
    let d = f
        .store
        .dashboard_at(&actor(1), Utc::now() + Duration::hours(1))
        .await
        .unwrap();
    let item = d
        .groups
        .iter()
        .flat_map(|g| &g.habits)
        .find(|i| i.habit.id == h.id)
        .unwrap();
    assert_eq!(
        item.local_date,
        (Utc::now() + Duration::hours(1))
            .with_timezone(&chrono_tz::Pacific::Kiritimati)
            .date_naive()
    );
}
