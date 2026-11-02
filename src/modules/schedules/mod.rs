use crate::modules::DomainError;
use crate::modules::users::UserId;
use chrono::{DateTime, Datelike, NaiveDate, NaiveTime, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// An excluded local date, never a successful completion.
#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct RestException {
    pub id: Uuid,
    pub user_id: UserId,
    pub habit_id: Uuid,
    pub local_date: NaiveDate,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Schedule {
    /// ISO weekdays, Monday=1, Sunday=7; unique and non-empty.
    pub weekdays: Vec<u8>,
    pub start: Option<NaiveTime>,
    pub end: Option<NaiveTime>,
}

impl Default for Schedule {
    fn default() -> Self {
        Self {
            weekdays: (1..=7).collect(),
            start: None,
            end: None,
        }
    }
}

impl Schedule {
    pub fn validate(&self) -> Result<(), DomainError> {
        let mut days = self.weekdays.clone();
        days.sort_unstable();
        days.dedup();
        if days.is_empty()
            || days.len() != self.weekdays.len()
            || days.iter().any(|d| !(1..=7).contains(d))
        {
            return Err(DomainError::Validation(
                "weekdays must be distinct ISO days 1..7",
            ));
        }
        match (self.start, self.end) {
            (None, None) => Ok(()),
            (Some(start), Some(end)) if start < end => Ok(()),
            _ => Err(DomainError::Validation(
                "window requires start < end within one day",
            )),
        }
    }

    pub fn eligible_date(
        &self,
        instant: DateTime<Utc>,
        timezone: Tz,
    ) -> Result<NaiveDate, DomainError> {
        let local = instant.with_timezone(&timezone);
        let in_window = match (self.start, self.end) {
            (Some(start), Some(end)) => local.time() >= start && local.time() < end,
            (None, None) => true,
            _ => false,
        };
        if self
            .weekdays
            .contains(&(local.weekday().number_from_monday() as u8))
            && in_window
        {
            Ok(local.date_naive())
        } else {
            Err(DomainError::Validation(
                "instant is outside the eligible schedule",
            ))
        }
    }
}
