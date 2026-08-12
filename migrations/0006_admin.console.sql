ALTER TABLE rooms ADD COLUMN label TEXT;
ALTER TABLE staff ADD COLUMN disabled_at INTEGER;
CREATE TABLE staff_invites ( id          TEXT PRIMARY KEY, staff_id    TEXT NOT NULL REFERENCES staff ON DELETE CASCADE, token_hash  TEXT NOT NULL UNIQUE, created_at  INTEGER NOT NULL, expires_at  INTEGER NOT NULL, consumed_at INTEGER );
CREATE INDEX idx_invites_staff ON staff_invites(staff_id) WHERE consumed_at IS NULL;
ALTER TABLE buildings ADD COLUMN seeded INTEGER NOT NULL DEFAULT 0;
UPDATE buildings SET seeded = 1;
DROP VIEW IF EXISTS v_ticket_location;
CREATE VIEW v_ticket_location AS SELECT t.id AS ticket_id, t.state, t.reported_at, t.closed_at, t.cause, o.id AS object_id, o.object_type, o.riser, o.ordinal, r.id AS room_id, r.code AS room_code, r.room_type, r.kind AS room_kind, r.label AS room_label, u.id AS unit_id, u.code AS unit_code, u.floor, u.kind AS unit_kind, u.is_common, b.id AS building_id, b.code AS building_code, b.name AS building_name FROM tickets t JOIN objects   o ON o.id = t.object_id JOIN rooms     r ON r.id = o.room_id JOIN units     u ON u.id = r.unit_id JOIN buildings b ON b.id = u.building_id;
