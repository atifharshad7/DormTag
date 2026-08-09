-- DormTag migration 0004 — handing work to an external trade
--
-- A caretaker can change a washer and clear a trap. He cannot legally touch
-- electrical, gas or heating work, and some jobs are simply beyond one person.
-- Those go to a Fachbetrieb, commissioned by the operator who holds the budget.
--
-- Escalation is modelled as a change of HANDLING rather than a new ticket
-- state. Two reasons: the ticket is still open and still needs scheduling, so it
-- isn't a different phase of the workflow; and SQLite cannot alter the CHECK
-- constraint on tickets.state without rebuilding the table, which is not
-- something to do to a live database for a label.

ALTER TABLE tickets ADD COLUMN handling TEXT NOT NULL DEFAULT 'caretaker'
  CHECK (handling IN ('caretaker', 'external'));

CREATE TABLE escalations (
  id              TEXT PRIMARY KEY,
  ticket_id       TEXT NOT NULL REFERENCES tickets ON DELETE CASCADE,
  trade           TEXT NOT NULL,
  reason          TEXT NOT NULL,
  note            TEXT,
  raised_by       TEXT NOT NULL REFERENCES staff,
  raised_at       INTEGER NOT NULL,
  commissioned_at INTEGER,
  contractor      TEXT,
  reference       TEXT,
  closed_at       INTEGER
);

CREATE INDEX idx_escalations_ticket ON escalations(ticket_id, raised_at);

-- One live escalation per ticket. Same partial-index trick as the appointments.
CREATE UNIQUE INDEX one_open_escalation_per_ticket
  ON escalations(ticket_id) WHERE closed_at IS NULL;

CREATE INDEX idx_tickets_handling ON tickets(handling) WHERE handling = 'external';
