use crate::modules::{
    DomainError,
    auth::{Principal, Scope},
    schedules::Schedule,
    users::UserId,
};
use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use std::future::Future;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum HabitKind {
    Boolean,
    Quantity,
    Duration,
    Frequency,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Unit {
    Count,
    Meters,
    Seconds,
    Milliliters,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NewHabit {
    pub name: String,
    pub kind: HabitKind,
    pub unit: Unit,
    pub target: f64,
    /// IANA zone, e.g. Europe/Paris.
    pub timezone: String,
    #[serde(default)]
    pub schedule: Schedule,
}

impl NewHabit {
    pub fn validate(&self) -> Result<(), DomainError> {
        if self.name.trim().is_empty()
            || self.name.chars().count() > 120
            || self.name.chars().any(char::is_control)
        {
            return Err(DomainError::Validation(
                "name must contain 1..120 non-control characters",
            ));
        }
        if !self.target.is_finite() || self.target <= 0.0 || self.target > 1e12 {
            return Err(DomainError::Validation(
                "target must be finite and in (0, 1e12]",
            ));
        }
        let compatible = match self.kind {
            HabitKind::Boolean => self.unit == Unit::Count && self.target == 1.0,
            HabitKind::Frequency => self.unit == Unit::Count && self.target.fract() == 0.0,
            HabitKind::Duration => self.unit == Unit::Seconds,
            HabitKind::Quantity => self.unit != Unit::Seconds,
        };
        if !compatible {
            return Err(DomainError::Validation(
                "kind, unit and target are incompatible",
            ));
        }
        self.timezone
            .parse::<Tz>()
            .map_err(|_| DomainError::Validation("timezone must be an IANA zone"))?;
        self.schedule.validate()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct Habit {
    pub id: Uuid,
    pub user_id: UserId,
    #[serde(flatten)]
    pub definition: NewHabit,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, ToSchema)]
#[serde(default, deny_unknown_fields)]
pub struct Pagination {
    pub limit: u32,
    pub offset: u32,
}
impl Default for Pagination {
    fn default() -> Self {
        Self {
            limit: 20,
            offset: 0,
        }
    }
}
impl Pagination {
    pub fn validate(self) -> Result<Self, DomainError> {
        if !(1..=100).contains(&self.limit) || self.offset > 100_000 {
            Err(DomainError::Validation(
                "limit must be 1..100 and offset <= 100000",
            ))
        } else {
            Ok(self)
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct HabitPage {
    pub items: Vec<Habit>,
    pub limit: u32,
    pub offset: u32,
}

pub trait HabitRepository: Send + Sync {
    fn create(
        &self,
        user: UserId,
        input: NewHabit,
    ) -> impl Future<Output = Result<Habit, DomainError>> + Send;
    fn list(
        &self,
        user: UserId,
        page: Pagination,
    ) -> impl Future<Output = Result<Vec<Habit>, DomainError>> + Send;
}

pub async fn create(
    repo: &impl HabitRepository,
    actor: &Principal,
    mut input: NewHabit,
) -> Result<Habit, DomainError> {
    actor.require(Scope::HabitsWrite)?;
    input.name = input.name.trim().to_owned();
    input.validate()?;
    repo.create(actor.user_id, input).await
}

pub async fn list(
    repo: &impl HabitRepository,
    actor: &Principal,
    page: Pagination,
) -> Result<HabitPage, DomainError> {
    actor.require(Scope::HabitsRead)?;
    let page = page.validate()?;
    Ok(HabitPage {
        items: repo.list(actor.user_id, page).await?,
        limit: page.limit,
        offset: page.offset,
    })
}
