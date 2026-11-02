ALTER TABLE jobs ADD COLUMN lease_owner TEXT;
ALTER TABLE jobs ADD COLUMN payload_hash BLOB;
ALTER TABLE integrations ADD COLUMN credential_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE oauth_states (
    state_hash BLOB PRIMARY KEY NOT NULL CHECK(length(state_hash) = 32),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE integration_settings (
    user_id TEXT NOT NULL,
    integration_id TEXT NOT NULL,
    settings TEXT NOT NULL CHECK(json_valid(settings)),
    PRIMARY KEY(user_id, integration_id),
    FOREIGN KEY(user_id, integration_id) REFERENCES integrations(user_id, id) ON DELETE CASCADE
);
CREATE TABLE strava_mappings (
    user_id TEXT NOT NULL,
    integration_id TEXT NOT NULL,
    sport TEXT NOT NULL CHECK(sport IN ('Run','Swim')),
    habit_id TEXT NOT NULL,
    metric TEXT NOT NULL CHECK(metric IN ('distance','moving_time','count')),
    PRIMARY KEY(user_id, integration_id, sport),
    FOREIGN KEY(user_id, integration_id) REFERENCES integrations(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
CREATE TABLE provider_cooldowns (
    provider TEXT PRIMARY KEY NOT NULL,
    available_at TEXT NOT NULL
);
CREATE TABLE provider_windows (
    name TEXT PRIMARY KEY NOT NULL,
    window_start INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    used INTEGER NOT NULL,
    maximum INTEGER NOT NULL
);
