-- TEST ONLY: deterministic tenants; migrations never create accounts.
INSERT INTO users (id, issuer, subject, timezone, created_at) VALUES
('00000000-0000-0000-0000-000000000001', 'https://issuer.invalid', 'alice', 'Europe/Paris', '2026-01-01T00:00:00Z'),
('00000000-0000-0000-0000-000000000002', 'https://issuer.invalid', 'bob', 'UTC', '2026-01-01T00:00:00Z');
