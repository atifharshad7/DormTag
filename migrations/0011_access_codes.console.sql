ALTER TABLE tenancies ADD COLUMN semester TEXT;
ALTER TABLE tenancies ADD COLUMN issued_at INTEGER;
CREATE INDEX idx_tenancies_room_live ON tenancies(room_id) WHERE ends_on IS NULL;
CREATE INDEX idx_tenancies_semester ON tenancies(semester);
ALTER TABLE buildings ADD COLUMN semester TEXT;
