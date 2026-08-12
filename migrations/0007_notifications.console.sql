CREATE TABLE notifications ( id          TEXT PRIMARY KEY, ticket_id   TEXT REFERENCES tickets ON DELETE CASCADE, audience    TEXT NOT NULL CHECK (audience IN ('tenant','staff','operator')), tenant_id   TEXT REFERENCES tenants, building_id TEXT REFERENCES buildings, kind        TEXT NOT NULL, payload     TEXT, ref         TEXT, created_at  INTEGER NOT NULL, emailed_at  INTEGER );
CREATE INDEX idx_notif_tenant ON notifications(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_notif_building ON notifications(building_id, created_at DESC) WHERE building_id IS NOT NULL;
CREATE INDEX idx_notif_audience ON notifications(audience, created_at DESC);
CREATE UNIQUE INDEX one_notification_per_ref ON notifications(kind, ref) WHERE ref IS NOT NULL;
CREATE TABLE notification_reads ( notification_id TEXT NOT NULL REFERENCES notifications ON DELETE CASCADE, reader          TEXT NOT NULL, read_at         INTEGER NOT NULL, PRIMARY KEY (notification_id, reader) );
