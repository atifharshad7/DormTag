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

-- Which rotation this tenancy belongs to: 'WS26', 'SS27'. Labelling only, never
-- authorisation: an old code stops working because its tenancy ended, not
-- because the string says 25.
ALTER TABLE tenancies ADD COLUMN semester TEXT;
ALTER TABLE tenancies ADD COLUMN issued_at INTEGER;

CREATE INDEX idx_tenancies_room_live ON tenancies(room_id) WHERE ends_on IS NULL;
CREATE INDEX idx_tenancies_semester ON tenancies(semester);

-- The semester a building is currently issuing for. Generating a code for a room
-- added mid-term should match everyone else's label, so the label comes from the
-- building's current rotation rather than from today's date. Only rotating
-- advances it.
ALTER TABLE buildings ADD COLUMN semester TEXT;
