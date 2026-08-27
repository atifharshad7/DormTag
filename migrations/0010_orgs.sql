-- DormTag migration 0010 — one app, several organisations
--
-- Until now every operator saw every building, which is correct with one
-- customer and a data breach with two. Each organisation now gets its own
-- sealed-off estate.
--
-- Shared database with an org_id rather than a database each: the schema is
-- identical either way, so moving to per-org databases later means exporting
-- rows and dropping this column, not a rewrite. What it costs is that isolation
-- depends on every query carrying the condition, which is why scoping is
-- centralised and why there are tests that deliberately try to cross the line.

CREATE TABLE orgs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  -- Signup is open, but nothing is usable until a platform admin approves it.
  -- 'demo' is permanent and public; the seed only ever touches that one.
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'suspended', 'rejected', 'demo')),
  -- The domain of the address that signed up. Not proof of authority, but it is
  -- evidence you didn't have to take on trust: you can't get an address on
  -- someone else's domain.
  signup_email  TEXT,
  signup_domain TEXT,
  created_at    INTEGER NOT NULL,
  approved_at   INTEGER,
  note          TEXT
);

CREATE INDEX idx_orgs_status ON orgs(status, created_at DESC);

-- Everything that already exists belongs to one organisation.
INSERT INTO orgs (id, name, status, created_at, approved_at)
VALUES ('org-demo', 'Studierendenwerk (Demo)', 'demo', 0, 0);

ALTER TABLE buildings ADD COLUMN org_id TEXT REFERENCES orgs;
ALTER TABLE staff     ADD COLUMN org_id TEXT REFERENCES orgs;
ALTER TABLE tenants   ADD COLUMN org_id TEXT REFERENCES orgs;

UPDATE buildings SET org_id = 'org-demo' WHERE org_id IS NULL;
UPDATE staff     SET org_id = 'org-demo' WHERE org_id IS NULL;
UPDATE tenants   SET org_id = 'org-demo' WHERE org_id IS NULL;

CREATE INDEX idx_buildings_org ON buildings(org_id);
CREATE INDEX idx_staff_org ON staff(org_id);
CREATE INDEX idx_tenants_org ON tenants(org_id);

-- Approving organisations and reading their tickets are different powers, so
-- this flag deliberately grants only the former. Set it in the D1 console: an
-- interface for granting the most powerful role in the system is a liability
-- when exactly one person should ever hold it.
ALTER TABLE staff ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0;

-- Note on email uniqueness, deliberately left alone.
--
-- staff.email is UNIQUE as an inline column constraint, so SQLite's implicit
-- index can't be dropped without rebuilding the table — not something to do to
-- a live database. So an address stays unique across the whole platform rather
-- than per organisation.
--
-- That is a real limitation: one person cannot hold accounts at two
-- Studierendenwerke. It is also the simpler design, because sign-in resolves an
-- account from the address alone and never has to ask which organisation you
-- meant. Resident access codes are likewise globally unique, for the same
-- reason: the code is the whole credential.

-- Rebuild the location view with org_id, so scoping a ticket query stays a
-- single condition instead of a join every caller has to remember.
DROP VIEW IF EXISTS v_ticket_location;
CREATE VIEW v_ticket_location AS
SELECT
  t.id AS ticket_id, t.state, t.reported_at, t.closed_at, t.cause,
  o.id AS object_id, o.object_type, o.riser, o.ordinal,
  r.id AS room_id, r.code AS room_code, r.room_type, r.kind AS room_kind, r.label AS room_label,
  u.id AS unit_id, u.code AS unit_code, u.floor, u.kind AS unit_kind, u.is_common,
  b.id AS building_id,
  COALESCE(b.display_code, b.code) AS building_code,
  b.name AS building_name,
  b.org_id AS org_id
FROM tickets t
JOIN objects   o ON o.id = t.object_id
JOIN rooms     r ON r.id = o.room_id
JOIN units     u ON u.id = r.unit_id
JOIN buildings b ON b.id = u.building_id;

-- Notifications need the organisation too. Without it an operator's bell would
-- show escalations from every organisation, since the only condition on that
-- audience is the audience itself.
ALTER TABLE notifications ADD COLUMN org_id TEXT REFERENCES orgs;
UPDATE notifications SET org_id = 'org-demo' WHERE org_id IS NULL;
CREATE INDEX idx_notif_org ON notifications(org_id, created_at DESC);

-- Two Studierendenwerke both have a Haus A, but buildings.code is UNIQUE
-- platform-wide (an inline constraint, so SQLite's implicit index can't be
-- dropped without rebuilding the table).
--
-- More importantly, QR slugs must stay globally unique whatever happens:
-- /r/a112-ba is a URL, and a URL cannot be ambiguous between two customers.
--
-- So each organisation gets a short prefix. The stored code is prefixed and
-- stays globally unique; display_code is what the operator typed and what every
-- screen shows. The demo organisation keeps an empty prefix so its existing
-- slugs and printed stickers still resolve.
ALTER TABLE orgs ADD COLUMN slug_prefix TEXT;
UPDATE orgs SET slug_prefix = '' WHERE id = 'org-demo';

ALTER TABLE buildings ADD COLUMN display_code TEXT;
UPDATE buildings SET display_code = code WHERE display_code IS NULL;
