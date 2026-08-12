-- DormTag migration 0006 — operators run the estate themselves
--
-- Until now buildings, rooms and staff existed only because the seed created
-- them. This is what makes the app deployable: an operator creates the first
-- account, then buildings, units, rooms and colleagues, without touching code.

-- Optional human name for a room, on top of the structural type.
--
-- room_type stays a CODE. If operators typed room names freely we would get
-- "Bad", "Badezimmer", "bathroom" and "WC" as four different things and the
-- dashboard's grouping would quietly stop working. The label is for what the
-- code cannot express: a flat with two bathrooms needs "Bad links" and
-- "Bad rechts", both still counted as BATHROOM.
ALTER TABLE rooms ADD COLUMN label TEXT;

-- Staff are never deleted: their name sits on closed tickets. They are disabled.
ALTER TABLE staff ADD COLUMN disabled_at INTEGER;

-- One-time setup links. The operator never learns anyone's password.
CREATE TABLE staff_invites (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT NOT NULL REFERENCES staff ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX idx_invites_staff ON staff_invites(staff_id) WHERE consumed_at IS NULL;

-- Buildings created by an operator are theirs; the demo seed must not wipe them.
ALTER TABLE buildings ADD COLUMN seeded INTEGER NOT NULL DEFAULT 0;
UPDATE buildings SET seeded = 1;

-- Rebuild the location view so every screen can show a room's label.
DROP VIEW IF EXISTS v_ticket_location;
CREATE VIEW v_ticket_location AS
SELECT
  t.id AS ticket_id, t.state, t.reported_at, t.closed_at, t.cause,
  o.id AS object_id, o.object_type, o.riser, o.ordinal,
  r.id AS room_id, r.code AS room_code, r.room_type, r.kind AS room_kind, r.label AS room_label,
  u.id AS unit_id, u.code AS unit_code, u.floor, u.kind AS unit_kind, u.is_common,
  b.id AS building_id, b.code AS building_code, b.name AS building_name
FROM tickets t
JOIN objects   o ON o.id = t.object_id
JOIN rooms     r ON r.id = o.room_id
JOIN units     u ON u.id = r.unit_id
JOIN buildings b ON b.id = u.building_id;
