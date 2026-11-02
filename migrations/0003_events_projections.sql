ALTER TABLE habits ADD COLUMN archived_at TEXT;
CREATE TABLE habit_versions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    definition TEXT NOT NULL CHECK(json_valid(definition)),
    created_at TEXT NOT NULL,
    UNIQUE(user_id, habit_id, effective_from),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
INSERT INTO habit_versions SELECT id, user_id, id, '1970-01-01', definition, created_at FROM habits;
CREATE TABLE domain_events (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    created_at TEXT NOT NULL,
    UNIQUE(user_id, id),
    UNIQUE(user_id, idempotency_key),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
INSERT INTO domain_events
SELECT v.id, v.user_id, e.habit_id, v.idempotency_key, 'entry.' || v.operation, v.payload, v.created_at
FROM entry_events v JOIN entries e ON e.user_id = v.user_id AND e.id = v.entry_id;
CREATE TABLE period_projections (
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    progress REAL NOT NULL,
    target REAL NOT NULL,
    eligible_days INTEGER NOT NULL,
    completed INTEGER NOT NULL CHECK(completed IN (0, 1)),
    PRIMARY KEY(user_id, habit_id, period_start),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
CREATE TABLE xp_ledger_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    event_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount != 0),
    compensates_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, id),
    UNIQUE(user_id, event_id, habit_id, period_start),
    UNIQUE(user_id, compensates_id),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY(user_id, event_id) REFERENCES domain_events(user_id, id) ON DELETE CASCADE,
    FOREIGN KEY(user_id, compensates_id) REFERENCES xp_ledger_v2(user_id, id)
);
INSERT INTO xp_ledger_v2
SELECT l.id, l.user_id, e.habit_id, e.local_date, l.event_id, l.amount, l.compensates_id, l.created_at
FROM xp_ledger l JOIN entry_events v ON v.user_id = l.user_id AND v.id = l.event_id
JOIN entries e ON e.user_id = v.user_id AND e.id = v.entry_id;
DROP TABLE xp_ledger;
ALTER TABLE xp_ledger_v2 RENAME TO xp_ledger;
CREATE INDEX xp_ledger_period ON xp_ledger(user_id, habit_id, period_start);
