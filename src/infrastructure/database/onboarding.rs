use super::{Store, insert_habit, persistence};
use crate::modules::{
    DomainError,
    auth::{Principal, Scope},
    habits::{Habit, presentation::HabitSetup},
};
use sqlx::Row;

impl Store {
    pub async fn setup_habit(
        &self,
        actor: &Principal,
        key: &str,
        mut input: HabitSetup,
    ) -> Result<Habit, DomainError> {
        actor.require(Scope::HabitsWrite)?;
        if key.is_empty() || key.len() > 128 || !key.bytes().all(|v| v.is_ascii_graphic()) {
            return Err(DomainError::Validation("invalid idempotency key"));
        }
        input.habit.name = input.habit.name.trim().to_owned();
        input.habit.validate()?;
        input.presentation.validate(&input.habit)?;
        let payload = serde_json::to_string(&input).map_err(persistence)?;
        let mut tx = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(persistence)?;
        if let Some(row) = sqlx::query("SELECT payload, receipt FROM habit_creation_receipts WHERE user_id = ? AND idempotency_key = ?")
            .bind(actor.user_id.0.to_string()).bind(key).fetch_optional(&mut *tx).await.map_err(persistence)? {
            if row.try_get::<String, _>("payload").map_err(persistence)? != payload {
                return Err(DomainError::Conflict);
            }
            let receipt = row.try_get::<String, _>("receipt").map_err(persistence)?;
            tx.commit().await.map_err(persistence)?;
            return serde_json::from_str(&receipt).map_err(persistence);
        }
        let habit = insert_habit(&mut tx, actor.user_id, input.habit).await?;
        sqlx::query(
            "INSERT INTO habit_presentations (user_id, habit_id, definition) VALUES (?, ?, ?)",
        )
        .bind(actor.user_id.0.to_string())
        .bind(habit.id.to_string())
        .bind(serde_json::to_string(&input.presentation).map_err(persistence)?)
        .execute(&mut *tx)
        .await
        .map_err(persistence)?;
        sqlx::query("INSERT INTO habit_creation_receipts (user_id, idempotency_key, habit_id, payload, receipt) VALUES (?, ?, ?, ?, ?)")
            .bind(actor.user_id.0.to_string()).bind(key).bind(habit.id.to_string()).bind(payload)
            .bind(serde_json::to_string(&habit).map_err(persistence)?)
            .execute(&mut *tx).await.map_err(persistence)?;
        tx.commit().await.map_err(persistence)?;
        Ok(habit)
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use crate::infrastructure::database::tests::{Fixture, fixture_principal};

    fn input() -> HabitSetup {
        serde_json::from_value(serde_json::json!({
            "habit": {"name":"Water", "category":"nutrition", "kind":"quantity", "unit":"milliliters", "target":2000, "timezone":"Europe/Paris"},
            "presentation": {"step":250, "illustration":"water"}
        })).unwrap()
    }

    #[tokio::test]
    async fn setup_is_atomic_idempotent_and_tenant_scoped() {
        let f = Fixture::new().await;
        let mut alice = fixture_principal(1);
        alice.scopes = Scope::all();
        let mut bob = fixture_principal(2);
        bob.scopes = Scope::all();
        let (first, replay) = tokio::join!(
            f.store.setup_habit(&alice, "setup-test", input()),
            f.store.setup_habit(&alice, "setup-test", input()),
        );
        let first = first.unwrap();
        assert_eq!(first.id, replay.unwrap().id);
        let other = f
            .store
            .setup_habit(&bob, "setup-test", input())
            .await
            .unwrap();
        assert_ne!(first.id, other.id);
        assert_eq!(other.user_id, bob.user_id);
        let mut changed = input();
        changed.habit.target = 3000.0;
        assert!(matches!(
            f.store.setup_habit(&alice, "setup-test", changed).await,
            Err(DomainError::Conflict)
        ));
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM habits")
            .fetch_one(&f.store.pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
        let dashboard = f.store.dashboard(&alice).await.unwrap();
        let item = &dashboard
            .groups
            .iter()
            .find(|group| !group.habits.is_empty())
            .unwrap()
            .habits[0];
        assert_eq!(item.presentation.step, 250.0);
        assert_eq!(item.habit.id, first.id);
        alice.scopes = vec![Scope::HabitsRead];
        assert!(matches!(
            f.store.setup_habit(&alice, "new", input()).await,
            Err(DomainError::Forbidden)
        ));
    }

    #[tokio::test]
    async fn validation_and_receipt_failure_leave_no_partial_habit() {
        let f = Fixture::new().await;
        let mut actor = fixture_principal(1);
        actor.scopes = Scope::all();
        let mut invalid = input();
        invalid.presentation.step = 0.0;
        assert!(matches!(
            f.store.setup_habit(&actor, "invalid", invalid).await,
            Err(DomainError::Validation(_))
        ));
        sqlx::query("CREATE TRIGGER fail_setup_receipt BEFORE INSERT ON habit_creation_receipts BEGIN SELECT RAISE(ABORT, 'fixture'); END;")
            .execute(&f.store.pool).await.unwrap();
        assert!(matches!(
            f.store.setup_habit(&actor, "rollback", input()).await,
            Err(DomainError::Unavailable)
        ));
        for (table, query) in [
            ("habits", "SELECT COUNT(*) FROM habits"),
            ("schedules", "SELECT COUNT(*) FROM schedules"),
            ("habit_versions", "SELECT COUNT(*) FROM habit_versions"),
            (
                "habit_presentations",
                "SELECT COUNT(*) FROM habit_presentations",
            ),
            (
                "habit_creation_receipts",
                "SELECT COUNT(*) FROM habit_creation_receipts",
            ),
            (
                "dashboard_revisions",
                "SELECT COUNT(*) FROM dashboard_revisions",
            ),
        ] {
            let count: i64 = sqlx::query_scalar(query)
                .fetch_one(&f.store.pool)
                .await
                .unwrap();
            assert_eq!(count, 0, "{table}");
        }
    }
}
