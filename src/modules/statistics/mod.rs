use crate::modules::{
    DomainError,
    entries::Entry,
    habits::{HabitVersion, NewHabit, Period},
};
use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use utoipa::ToSchema;

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct PeriodResult {
    pub start: NaiveDate,
    pub end: NaiveDate,
    pub progress: f64,
    pub target: f64,
    pub eligible_days: u32,
    pub completed: bool,
}
#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct DayResult {
    pub date: NaiveDate,
    pub eligible: bool,
    pub progress: f64,
    pub period_start: NaiveDate,
    pub completed: bool,
}
#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct WindowStatistics {
    pub days: u32,
    pub eligible_periods: u32,
    pub completed_periods: u32,
    pub success_rate: Option<f64>,
}
#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct HabitStatistics {
    pub through: NaiveDate,
    pub periods: Vec<PeriodResult>,
    pub heatmap: Vec<DayResult>,
    pub windows: Vec<WindowStatistics>,
    pub streak: crate::modules::streaks::Streak,
    pub xp: i64,
    pub level: u32,
}

pub fn period_start(date: NaiveDate, period: Period) -> NaiveDate {
    match period {
        Period::Daily => date,
        Period::Weekly => date - Duration::days(i64::from(date.weekday().num_days_from_monday())),
    }
}
pub fn definition_on(versions: &[HabitVersion], date: NaiveDate) -> Result<&NewHabit, DomainError> {
    versions
        .iter()
        .filter(|v| v.effective_from <= date)
        .max_by_key(|v| v.effective_from)
        .map(|v| &v.definition)
        .ok_or(DomainError::Unavailable)
}

/// Pure replay: UTC instants have already been assigned an immutable local date.
pub fn calculate(
    versions: &[HabitVersion],
    entries: &[Entry],
    rests: &BTreeSet<NaiveDate>,
    from: NaiveDate,
    through: NaiveDate,
) -> Result<(Vec<PeriodResult>, Vec<DayResult>), DomainError> {
    if through < from || (through - from).num_days() > 36600 {
        return Err(DomainError::Validation(
            "replay range must be at most 100 years",
        ));
    }
    let mut periods: BTreeMap<NaiveDate, PeriodResult> = BTreeMap::new();
    let mut heatmap = Vec::new();
    let mut totals: BTreeMap<NaiveDate, f64> = BTreeMap::new();
    for entry in entries {
        *totals.entry(entry.local_date).or_default() += entry.value;
    }
    let mut date = from;
    while date <= through {
        let definition = definition_on(versions, date)?;
        let eligible = definition
            .schedule
            .weekdays
            .contains(&(date.weekday().number_from_monday() as u8))
            && !rests.contains(&date);
        let start = period_start(date, definition.period);
        let end = match definition.period {
            Period::Daily => start,
            Period::Weekly => start + Duration::days(6),
        };
        let progress = if eligible {
            totals.get(&date).copied().unwrap_or(0.0)
        } else {
            0.0
        };
        let period = periods.entry(start).or_insert(PeriodResult {
            start,
            end,
            progress: 0.0,
            target: definition.target,
            eligible_days: 0,
            completed: false,
        });
        period.progress += progress;
        period.eligible_days += u32::from(eligible);
        period.completed = period.eligible_days > 0 && period.progress >= period.target;
        heatmap.push(DayResult {
            date,
            eligible,
            progress,
            period_start: start,
            completed: false,
        });
        date = date.succ_opt().ok_or(DomainError::Unavailable)?;
    }
    for day in &mut heatmap {
        day.completed = day.eligible && periods.get(&day.period_start).is_some_and(|p| p.completed);
    }
    Ok((periods.into_values().collect(), heatmap))
}

pub fn summarize(
    periods: Vec<PeriodResult>,
    heatmap: Vec<DayResult>,
    through: NaiveDate,
    xp: i64,
) -> HabitStatistics {
    let windows = [7, 30, 90]
        .into_iter()
        .map(|days| {
            let start = through - Duration::days(i64::from(days) - 1);
            let applicable: Vec<_> = periods
                .iter()
                .filter(|p| {
                    p.end >= start
                        && p.start <= through
                        && p.eligible_days > 0
                        && (p.end < through || p.completed)
                })
                .collect();
            let eligible_periods = applicable.len() as u32;
            let completed_periods = applicable.iter().filter(|p| p.completed).count() as u32;
            WindowStatistics {
                days,
                eligible_periods,
                completed_periods,
                success_rate: (eligible_periods > 0)
                    .then(|| f64::from(completed_periods) / f64::from(eligible_periods)),
            }
        })
        .collect();
    let streak = crate::modules::streaks::calculate(&periods, through);
    let periods = periods
        .into_iter()
        .filter(|p| p.end > through - Duration::days(90))
        .collect();
    let heatmap = heatmap
        .into_iter()
        .filter(|d| d.date > through - Duration::days(90))
        .collect();
    HabitStatistics {
        through,
        periods,
        heatmap,
        windows,
        streak,
        xp,
        level: crate::modules::gamification::level(xp),
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use crate::{
        infrastructure::database::tests::{entry_input, fixture_principal, habit_input},
        modules::entries::Entry,
    };
    use chrono::Utc;
    use uuid::Uuid;
    #[test]
    fn rest_is_neutral_for_rate_streak_and_xp_and_weekly_targets_work() {
        let from: NaiveDate = "2026-03-27".parse().unwrap();
        let through = from + Duration::days(3);
        let mut definition = habit_input();
        definition.target = 1.0;
        let versions = vec![HabitVersion {
            effective_from: from,
            definition: definition.clone(),
        }];
        let entries: Vec<_> = [0, 2, 3]
            .into_iter()
            .map(|d| Entry {
                id: Uuid::new_v4(),
                habit_id: Uuid::new_v4(),
                user_id: fixture_principal(1).user_id,
                occurred_at: entry_input().occurred_at,
                local_date: from + Duration::days(d),
                value: 1.0,
                created_at: Utc::now(),
            })
            .collect();
        let rests = BTreeSet::from([from + Duration::days(1)]);
        let (periods, days) = calculate(&versions, &entries, &rests, from, through).unwrap();
        let summary = summarize(periods, days, through, 30);
        assert_eq!(summary.streak.current, 3);
        assert_eq!(summary.streak.record, 3);
        assert_eq!(summary.windows[0].completed_periods, 3);
        assert_eq!(summary.windows[0].eligible_periods, 3);
        assert_eq!(summary.windows[0].success_rate, Some(1.0));
        definition.period = Period::Weekly;
        definition.target = 3.0;
        let versions = vec![HabitVersion {
            effective_from: from,
            definition,
        }];
        let (periods, _) = calculate(&versions, &entries, &BTreeSet::new(), from, through).unwrap();
        assert_eq!(periods.len(), 2);
        assert!(!periods[0].completed); // split at ISO Monday
    }
}
