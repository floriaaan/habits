CREATE TABLE habit_presentations (
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    definition TEXT NOT NULL CHECK(json_valid(definition)),
    PRIMARY KEY(user_id, habit_id),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
CREATE TABLE action_receipts (
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    receipt TEXT NOT NULL CHECK(json_valid(receipt)),
    PRIMARY KEY(user_id, idempotency_key),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
CREATE TABLE dashboard_revisions (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE reminder_deliveries (
    user_id TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    local_date TEXT NOT NULL,
    notification_id TEXT NOT NULL,
    PRIMARY KEY(user_id, habit_id, local_date),
    -- A durable receipt must outlive purged/revoked jobs to avoid a second reminder.
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
CREATE TRIGGER dashboard_habit_create AFTER INSERT ON habits BEGIN
 INSERT INTO dashboard_revisions(user_id, revision) VALUES(NEW.user_id, 1)
 ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER dashboard_habit_update AFTER UPDATE ON habits BEGIN
 INSERT INTO dashboard_revisions(user_id, revision) VALUES(NEW.user_id, 1)
 ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER dashboard_event AFTER INSERT ON domain_events BEGIN
 INSERT INTO dashboard_revisions(user_id, revision) VALUES(NEW.user_id, 1)
 ON CONFLICT(user_id) DO UPDATE SET revision = revision + 1;
END;
