-- DormTag migration 0007 — an outbox, and a bell to read it from
--
-- Notifications are queued in the same batch as the state change that caused
-- them, so a ticket can never move without its notification existing. The same
-- table becomes the email outbox later: `emailed_at` is the only column that
-- feature needs.
--
-- Staff notifications address a BUILDING rather than a person. Assignments
-- change, and a caretaker who takes over a house should see what happened in it
-- last week. One row instead of one per caretaker, resolved at read time.

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT REFERENCES tickets ON DELETE CASCADE,
  audience    TEXT NOT NULL CHECK (audience IN ('tenant','staff','operator')),
  tenant_id   TEXT REFERENCES tenants,
  building_id TEXT REFERENCES buildings,
  kind        TEXT NOT NULL,
  payload     TEXT,
  -- Idempotency key. The reminder cron uses the appointment id so a second run
  -- on the same day can't send the same reminder twice.
  ref         TEXT,
  created_at  INTEGER NOT NULL,
  emailed_at  INTEGER
);

CREATE INDEX idx_notif_tenant ON notifications(tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_notif_building ON notifications(building_id, created_at DESC)
  WHERE building_id IS NOT NULL;
CREATE INDEX idx_notif_audience ON notifications(audience, created_at DESC);
CREATE UNIQUE INDEX one_notification_per_ref ON notifications(kind, ref)
  WHERE ref IS NOT NULL;

-- Read state is per person, because one building-addressed row is seen by
-- several caretakers. `reader` is 'staff:<id>' or 'tenant:<id>'.
CREATE TABLE notification_reads (
  notification_id TEXT NOT NULL REFERENCES notifications ON DELETE CASCADE,
  reader          TEXT NOT NULL,
  read_at         INTEGER NOT NULL,
  PRIMARY KEY (notification_id, reader)
);
