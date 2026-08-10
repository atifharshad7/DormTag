ALTER TABLE rooms ADD COLUMN qr_slug TEXT;
CREATE UNIQUE INDEX one_room_slug ON rooms(qr_slug) WHERE qr_slug IS NOT NULL;
UPDATE rooms SET qr_slug = lower( (SELECT b.code || u.code || '-' || rooms.code FROM units u JOIN buildings b ON b.id = u.building_id WHERE u.id = rooms.unit_id) ) WHERE qr_slug IS NULL;
