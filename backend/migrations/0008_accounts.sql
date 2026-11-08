CREATE TABLE accounts (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 verified_at TEXT,
 created_at TEXT NOT NULL
);
CREATE TABLE account_challenges (
 email TEXT NOT NULL COLLATE NOCASE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify', 'reset')),
 code_hash BLOB NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(email, purpose)
);
CREATE TABLE mobile_sessions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 access_hash BLOB NOT NULL UNIQUE,
 refresh_hash BLOB NOT NULL UNIQUE,
 access_expires_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 revoked_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX mobile_sessions_user ON mobile_sessions(user_id);
CREATE TABLE consumed_refresh_tokens (
 token_hash BLOB PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES mobile_sessions(id),
 expires_at TEXT NOT NULL
);
CREATE TABLE account_rate_limits (
 bucket TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 expires_at TEXT NOT NULL
);
