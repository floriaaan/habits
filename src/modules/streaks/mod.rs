use crate::modules::statistics::PeriodResult;
use chrono::NaiveDate;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct Streak {
    pub current: u32,
    pub record: u32,
}

pub fn calculate(periods: &[PeriodResult], today: NaiveDate) -> Streak {
    let (mut current, mut record) = (0, 0);
    for period in periods {
        if period.eligible_days == 0 {
            continue;
        }
        if period.completed {
            current += 1;
            record = record.max(current);
        } else if period.end < today {
            current = 0;
        }
    }
    Streak { current, record }
}
