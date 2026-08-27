ALTER TABLE tenants ADD COLUMN wants_email INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notifications ADD COLUMN email_to TEXT;
ALTER TABLE notifications ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN email_error TEXT;
CREATE INDEX idx_notif_unsent ON notifications(created_at) WHERE email_to IS NOT NULL AND emailed_at IS NULL;
