ALTER TABLE tenancies ADD COLUMN issued_at INTEGER;
ALTER TABLE tenancies ADD COLUMN note TEXT;
CREATE INDEX idx_tenancies_room_live ON tenancies(room_id) WHERE ends_on IS NULL;
