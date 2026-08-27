-- DormTag migration 0008 — send the notifications as email
--
-- The outbox from 0007 already records what needs saying and to whom. What it
-- lacks is an address: a notification points at a tenant or a building, not an
-- inbox.
--
-- Addresses are asked for, never imported. A resident who skips it still gets
-- the bell, so nothing in the app depends on holding their email.

ALTER TABLE tenants ADD COLUMN wants_email INTEGER NOT NULL DEFAULT 1;

-- Resolved when the notification is queued, not when it is sent: if a resident
-- later changes or removes their address, mail already queued should go where it
-- was addressed rather than follow them.
ALTER TABLE notifications ADD COLUMN email_to TEXT;
ALTER TABLE notifications ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN email_error TEXT;

CREATE INDEX idx_notif_unsent ON notifications(created_at)
  WHERE email_to IS NOT NULL AND emailed_at IS NULL;
