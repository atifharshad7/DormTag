-- DormTag migration 0011 — access codes an operator can actually issue
--
-- Until now residents existed only because the seed created them. This is what
-- makes a pilot possible: an operator generates a code per room, prints a sheet,
-- and the Studierendenwerk hands them out with the keys.
--
-- A code belongs to a TENANCY, not a person. "Whoever holds Z2 this semester."
-- Otherwise last year's occupant keeps access to this year's occupant's room.
--
-- No names, no email addresses at creation. The account is a room. A resident
-- who wants email adds their own address later, so nothing is held until
-- somebody volunteers it — a far easier ask of a Studierendenwerk than
-- importing five hundred students.

-- When this code was issued, and an optional line about the handover.
--
-- The date lives here rather than in the code itself. An earlier version put the
-- semester in the string, on the theory that a stale sheet should be obvious —
-- but students stay in the same room for years, so a four-year-old code would
-- have read as expired while working perfectly. On the sheet, a 2026 date reads
-- as long-standing, which is what it is.
ALTER TABLE tenancies ADD COLUMN issued_at INTEGER;
ALTER TABLE tenancies ADD COLUMN note TEXT;

CREATE INDEX idx_tenancies_room_live ON tenancies(room_id) WHERE ends_on IS NULL;
