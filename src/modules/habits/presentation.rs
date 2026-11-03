use super::{HabitKind, NewHabit, Unit};
use crate::modules::DomainError;
use chrono::NaiveTime;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct HabitSetup {
    pub habit: NewHabit,
    #[serde(default)]
    pub presentation: Presentation,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Illustration {
    #[default]
    Plain,
    Water,
    Portions,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(default, deny_unknown_fields)]
pub struct Presentation {
    pub icon: Option<String>,
    pub color: Option<String>,
    pub order: i32,
    pub weight: f64,
    pub step: f64,
    pub illustration: Illustration,
    pub reminder_at: Option<NaiveTime>,
}
impl Default for Presentation {
    fn default() -> Self {
        Self {
            icon: None,
            color: None,
            order: 0,
            weight: 1.0,
            step: 1.0,
            illustration: Illustration::Plain,
            reminder_at: None,
        }
    }
}
impl Presentation {
    pub fn validate(&self, habit: &NewHabit) -> Result<(), DomainError> {
        if self.icon.as_ref().is_some_and(|icon| {
            !icon.starts_with("mdi:")
                || icon.len() > 80
                || !icon[4..]
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
                || icon.len() <= 4
        }) || self.color.as_ref().is_some_and(|color| {
            color.len() != 7
                || !color.starts_with('#')
                || !color[1..].bytes().all(|c| c.is_ascii_hexdigit())
        }) || !(-10000..=10000).contains(&self.order)
            || !self.weight.is_finite()
            || self.weight <= 0.0
            || self.weight > 100.0
            || !self.step.is_finite()
            || self.step <= 0.0
            || self.step > 1e12
        {
            return Err(DomainError::Validation(
                "invalid presentation icon/color/order/weight/step",
            ));
        }
        if matches!(habit.kind, HabitKind::Boolean | HabitKind::Frequency) && self.step != 1.0 {
            return Err(DomainError::Validation("boolean/frequency step must be 1"));
        }
        if (self.illustration == Illustration::Water && habit.unit != Unit::Milliliters)
            || (self.illustration == Illustration::Portions && habit.unit != Unit::Count)
        {
            return Err(DomainError::Validation(
                "illustration is incompatible with the habit unit",
            ));
        }
        if let Some(time) = self.reminder_at
            && (time.nanosecond() != 0
                || time.second() != 0
                || habit.schedule.start.is_some_and(|start| time < start)
                || habit.schedule.end.is_some_and(|end| time >= end))
        {
            return Err(DomainError::Validation(
                "reminder must be HH:MM:00 within the eligible window",
            ));
        }
        Ok(())
    }
}
use chrono::Timelike;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum HabitAction {
    Complete,
    Uncomplete,
    Increment,
    Decrement,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ActionRequest {
    pub action: HabitAction,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct ActionReceipt {
    pub id: uuid::Uuid,
    pub habit_id: uuid::Uuid,
    pub action: HabitAction,
    pub local_date: chrono::NaiveDate,
    pub progress: f64,
}
