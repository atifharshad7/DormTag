-- DormTag migration 0009 — changing and resetting a password
--
-- Staff and operators only. Residents sign in with a room access code and have
-- no password to lose.
--
-- Same shape as staff_invites: the token is stored hashed, single use, and
-- short-lived. Shorter than an invite, though — an invite is sent by hand and
-- may sit in a chat for days, while a reset arrives instantly, so a long window
-- is pure exposure.

CREATE TABLE password_resets (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT NOT NULL REFERENCES staff ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX idx_resets_staff ON password_resets(staff_id) WHERE consumed_at IS NULL;
