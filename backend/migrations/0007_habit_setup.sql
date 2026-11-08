CREATE TABLE habit_creation_receipts (
    user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
    habit_id TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    receipt TEXT NOT NULL CHECK(json_valid(receipt)),
    PRIMARY KEY(user_id, idempotency_key),
    FOREIGN KEY(user_id, habit_id) REFERENCES habits(user_id, id) ON DELETE CASCADE
);
