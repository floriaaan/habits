use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, ToSchema)]
pub enum Sport {
    Run,
    Swim,
}
impl Sport {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Run => "Run",
            Self::Swim => "Swim",
        }
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Metric {
    Distance,
    MovingTime,
    Count,
}
impl Metric {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Distance => "distance",
            Self::MovingTime => "moving_time",
            Self::Count => "count",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Mapping {
    pub sport: Sport,
    pub habit_id: Uuid,
    pub metric: Metric,
}
#[derive(Deserialize)]
pub struct Athlete {
    pub id: i64,
}
#[derive(Deserialize)]
pub struct Activity {
    pub id: i64,
    pub athlete: Athlete,
    pub sport_type: String,
    pub start_date: DateTime<Utc>,
    pub distance: f64,
    pub moving_time: f64,
}
#[derive(Clone, Serialize, Deserialize, ToSchema)]
pub struct Webhook {
    pub object_type: String,
    pub aspect_type: String,
    pub object_id: i64,
    pub owner_id: i64,
    pub subscription_id: i64,
    pub event_time: i64,
    #[serde(default)]
    pub updates: serde_json::Value,
}
impl Webhook {
    pub fn validate(&self, subscription: i64) -> bool {
        self.subscription_id == subscription
            && self.object_id > 0
            && self.owner_id > 0
            && self.event_time > 0
            && self.event_time <= Utc::now().timestamp() + 300
            && matches!(self.object_type.as_str(), "activity" | "athlete")
            && matches!(self.aspect_type.as_str(), "create" | "update" | "delete")
    }
    pub fn minimal(&self) -> Self {
        Self {
            updates: serde_json::Value::Null,
            ..self.clone()
        }
    }
}
