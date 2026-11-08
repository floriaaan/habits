ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0, 1));
ALTER TABLE users ADD COLUMN disabled_at TEXT;
ALTER TABLE auth_audit ADD COLUMN service_account_id TEXT;
CREATE INDEX auth_audit_tenant ON auth_audit(user_id, created_at, id);
CREATE INDEX access_tokens_tenant ON access_tokens(user_id, created_at, id);
