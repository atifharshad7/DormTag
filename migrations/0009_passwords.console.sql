CREATE TABLE password_resets ( id          TEXT PRIMARY KEY, staff_id    TEXT NOT NULL REFERENCES staff ON DELETE CASCADE, token_hash  TEXT NOT NULL UNIQUE, created_at  INTEGER NOT NULL, expires_at  INTEGER NOT NULL, consumed_at INTEGER );
CREATE INDEX idx_resets_staff ON password_resets(staff_id) WHERE consumed_at IS NULL;
