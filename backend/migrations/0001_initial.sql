CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    issuer TEXT NOT NULL CHECK(length(issuer) > 0),
    subject TEXT NOT NULL CHECK(length(subject) > 0),
    timezone TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(issuer, subject)
);

CREATE TABLE habits (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    definition TEXT NOT NULL CHECK(json_valid(definition)),
    created_at TEXT NOT NULL,
    UNIQUE(user_id, id)
);
CREATE INDEX habits_tenant_page ON habits(user_id, created_at, id);

CREATE TABLE schedules (
    habit_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    definition TEXT NOT NULL CHECK(json_valid(definition)),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);

CREATE TABLE schedule_exceptions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    local_date TEXT NOT NULL CHECK(length(local_date) = 10),
    kind TEXT NOT NULL CHECK(kind IN ('rest')),
    UNIQUE(user_id, habit_id, local_date),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);

CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    value REAL NOT NULL CHECK(value > 0 AND value <= 1e12),
    created_at TEXT NOT NULL,
    cancelled_at TEXT,
    UNIQUE(user_id, id),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
CREATE INDEX entries_tenant_page ON entries(user_id, habit_id, occurred_at, id);
CREATE INDEX entries_period ON entries(user_id, habit_id, local_date);

CREATE TABLE entry_events (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
    operation TEXT NOT NULL CHECK(operation IN ('create', 'correct', 'cancel')),
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    created_at TEXT NOT NULL,
    UNIQUE(user_id, idempotency_key),
    UNIQUE(user_id, id),
    FOREIGN KEY(user_id, entry_id) REFERENCES entries(user_id, id) ON DELETE CASCADE
);

CREATE TABLE integrations (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK(provider IN ('strava', 'home_assistant')),
    provider_subject TEXT NOT NULL,
    secret_ciphertext BLOB,
    secret_nonce BLOB,
    encryption_key_id TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, id),
    UNIQUE(provider, provider_subject),
    UNIQUE(user_id, provider),
    CHECK((secret_ciphertext IS NULL AND secret_nonce IS NULL AND encryption_key_id IS NULL)
       OR (secret_ciphertext IS NOT NULL AND secret_nonce IS NOT NULL AND encryption_key_id IS NOT NULL))
);

CREATE TABLE source_identifiers (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    integration_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    provider_object_id TEXT NOT NULL,
    UNIQUE(integration_id, provider_object_id),
    FOREIGN KEY(user_id, integration_id) REFERENCES integrations(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY(user_id, entry_id) REFERENCES entries(user_id, id) ON DELETE CASCADE
);

CREATE TABLE jobs (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    integration_id TEXT,
    kind TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'running', 'succeeded', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
    available_at TEXT NOT NULL,
    lease_until TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, kind, idempotency_key),
    FOREIGN KEY(user_id, integration_id) REFERENCES integrations(user_id, id) ON DELETE CASCADE
);
CREATE INDEX jobs_available ON jobs(state, available_at);

CREATE TABLE xp_ledger (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount != 0),
    compensates_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, id),
    UNIQUE(user_id, event_id),
    UNIQUE(user_id, compensates_id),
    FOREIGN KEY(user_id, event_id) REFERENCES entry_events(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY(user_id, compensates_id) REFERENCES xp_ledger(user_id, id)
);

CREATE TABLE service_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, id)
);

CREATE TABLE access_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_account_id TEXT,
    token_hash BLOB NOT NULL UNIQUE CHECK(length(token_hash) = 32),
    scopes TEXT NOT NULL CHECK(json_valid(scopes)),
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    rotated_from_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, id),
    FOREIGN KEY(user_id, service_account_id) REFERENCES service_accounts(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY(user_id, rotated_from_id) REFERENCES access_tokens(user_id, id)
);

CREATE TABLE auth_audit (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    token_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id, token_id) REFERENCES access_tokens(user_id, id)
);
