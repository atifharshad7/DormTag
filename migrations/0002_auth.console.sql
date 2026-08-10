ALTER TABLE staff ADD COLUMN password_hash TEXT;
ALTER TABLE staff ADD COLUMN password_salt TEXT;
ALTER TABLE tenants ADD COLUMN activation_code TEXT;
CREATE UNIQUE INDEX idx_tenants_activation ON tenants(activation_code) WHERE activation_code IS NOT NULL;
CREATE TABLE login_attempts ( id          INTEGER PRIMARY KEY AUTOINCREMENT, identifier  TEXT NOT NULL, succeeded   INTEGER NOT NULL DEFAULT 0, attempted_at INTEGER NOT NULL );
CREATE INDEX idx_login_attempts ON login_attempts(identifier, attempted_at);
