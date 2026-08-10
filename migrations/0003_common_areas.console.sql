ALTER TABLE units ADD COLUMN is_common INTEGER NOT NULL DEFAULT 0;
UPDATE units SET is_common = 1 WHERE code = 'COM';
