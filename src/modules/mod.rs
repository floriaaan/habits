pub mod auth;
pub mod entries;
pub mod gamification;
pub mod habits;
pub mod integrations;
pub mod schedules;
pub mod statistics;
pub mod streaks;
pub mod users;

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("{0}")]
    Validation(&'static str),
    #[error("Resource not found")]
    NotFound,
    #[error("Insufficient scope")]
    Forbidden,
    #[error("Idempotency key already used with a different payload")]
    Conflict,
    #[error("Persistence unavailable")]
    Unavailable,
}
