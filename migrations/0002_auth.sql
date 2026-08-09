-- DormTag migration 0002 — real credentials
--
-- Replaces the demo role-picker with actual authentication:
--   staff/operator -> email + password (PBKDF2-SHA256, per-user salt)
--   resident       -> activation code, the way a welcome letter would carry it
--
-- Passwords are never stored. Only the derived hash and its salt.

ALTER TABLE staff ADD COLUMN password_hash TEXT;
ALTER TABLE staff ADD COLUMN password_salt TEXT;

ALTER TABLE tenants ADD COLUMN activation_code TEXT;

CREATE UNIQUE INDEX idx_tenants_activation
  ON tenants(activation_code) WHERE activation_code IS NOT NULL;

-- Rate-limit login attempts per identifier so the codes can't be brute-forced.
CREATE TABLE login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier  TEXT NOT NULL,
  succeeded   INTEGER NOT NULL DEFAULT 0,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX idx_login_attempts ON login_attempts(identifier, attempted_at);
