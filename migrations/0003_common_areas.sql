-- DormTag migration 0003 — common areas vs. rooms inside a dwelling
--
-- The original rule was "private rooms need access, shared rooms don't". That's
-- wrong for a WG: the shared kitchen and bathroom sit *inside* a locked flat, so
-- the caretaker still has to be let in — any flatmate can do it, but somebody
-- must. Only genuine common areas (stairwell, laundry, entrance) need nobody.
--
-- So access follows the UNIT, not the room.

ALTER TABLE units ADD COLUMN is_common INTEGER NOT NULL DEFAULT 0;

UPDATE units SET is_common = 1 WHERE code = 'COM';
