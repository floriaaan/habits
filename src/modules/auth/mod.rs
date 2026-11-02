use crate::modules::{DomainError, users::UserId};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IdentityMode {
    OidcAccessToken,
    PersonalAccessToken,
    ServiceAccount,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
    HabitsRead,
    HabitsWrite,
    EntriesRead,
    EntriesWrite,
}

/// Constructed only by a trusted authentication adapter, never from request JSON.
#[derive(Clone, Debug)]
pub struct Principal {
    pub user_id: UserId,
    pub mode: IdentityMode,
    pub scopes: Vec<Scope>,
}

impl Principal {
    pub fn require(&self, scope: Scope) -> Result<(), DomainError> {
        if self.scopes.contains(&scope) {
            Ok(())
        } else {
            Err(DomainError::Forbidden)
        }
    }
}
