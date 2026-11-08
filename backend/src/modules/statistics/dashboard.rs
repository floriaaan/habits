use crate::modules::{
    gamification::Gamification,
    habits::{Habit, HabitCategory, presentation::Presentation},
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct DashboardHabit {
    pub habit: Habit,
    pub presentation: Presentation,
    pub local_date: NaiveDate,
    pub eligible: bool,
    pub actionable: bool,
    pub progress: f64,
    pub target: f64,
    pub percent: Option<f64>,
    pub completed: bool,
}
#[derive(Debug, Serialize, ToSchema)]
pub struct Group {
    pub category: HabitCategory,
    pub percent: Option<f64>,
    pub completed: u32,
    pub eligible: u32,
    pub habits: Vec<DashboardHabit>,
}
#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct DashboardDay {
    pub date: NaiveDate,
    pub percent: Option<f64>,
    pub completed: u32,
    pub eligible: u32,
}
#[derive(Debug, Serialize, ToSchema)]
pub struct WeekComparison {
    pub current: Vec<DashboardDay>,
    pub previous: Vec<DashboardDay>,
    pub current_percent: Option<f64>,
    pub previous_percent: Option<f64>,
    pub current_success_percent: Option<f64>,
    pub previous_success_percent: Option<f64>,
}
#[derive(Debug, Serialize, ToSchema)]
pub struct Dashboard {
    pub user_id: crate::modules::users::UserId,
    pub generated_at: DateTime<Utc>,
    pub date: NaiveDate,
    pub timezone: String,
    pub revision: i64,
    pub global_percent: Option<f64>,
    pub groups: Vec<Group>,
    pub weekly: WeekComparison,
    pub heatmap: Vec<DashboardDay>,
    pub gamification: Gamification,
    pub streak_91_days: crate::modules::streaks::Streak,
}

pub const CATEGORIES: [HabitCategory; 4] = [
    HabitCategory::Sport,
    HabitCategory::Mind,
    HabitCategory::Daily,
    HabitCategory::Nutrition,
];

pub fn weighted_percent<'a>(habits: impl Iterator<Item = &'a DashboardHabit>) -> Option<f64> {
    let mut sum = 0.0;
    let mut weights = 0.0;
    for item in habits.filter(|h| h.eligible) {
        sum += (item.progress / item.target).clamp(0.0, 1.0) * item.presentation.weight;
        weights += item.presentation.weight;
    }
    (weights > 0.0).then(|| sum / weights * 100.0)
}
pub fn mean(values: impl Iterator<Item = f64>) -> Option<f64> {
    let (sum, n) = values.fold((0.0, 0), |(sum, n), v| (sum + v, n + 1));
    (n > 0).then(|| sum / f64::from(n))
}
pub fn day(date: NaiveDate, habits: &[DashboardHabit]) -> DashboardDay {
    DashboardDay {
        date,
        percent: mean(CATEGORIES.iter().filter_map(|c| {
            weighted_percent(habits.iter().filter(|h| h.habit.definition.category == *c))
        })),
        completed: habits.iter().filter(|h| h.eligible && h.completed).count() as u32,
        eligible: habits.iter().filter(|h| h.eligible).count() as u32,
    }
}

pub fn success_percent(days: &[DashboardDay]) -> Option<f64> {
    let eligible: u32 = days.iter().map(|d| d.eligible).sum();
    let completed: u32 = days.iter().map(|d| d.completed).sum();
    (eligible > 0).then(|| f64::from(completed) / f64::from(eligible) * 100.0)
}
