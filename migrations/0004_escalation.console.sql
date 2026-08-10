ALTER TABLE tickets ADD COLUMN handling TEXT NOT NULL DEFAULT 'caretaker' CHECK (handling IN ('caretaker', 'external'));
CREATE TABLE escalations ( id              TEXT PRIMARY KEY, ticket_id       TEXT NOT NULL REFERENCES tickets ON DELETE CASCADE, trade           TEXT NOT NULL, reason          TEXT NOT NULL, note            TEXT, raised_by       TEXT NOT NULL REFERENCES staff, raised_at       INTEGER NOT NULL, commissioned_at INTEGER, contractor      TEXT, reference       TEXT, closed_at       INTEGER );
CREATE INDEX idx_escalations_ticket ON escalations(ticket_id, raised_at);
CREATE UNIQUE INDEX one_open_escalation_per_ticket ON escalations(ticket_id) WHERE closed_at IS NULL;
CREATE INDEX idx_tickets_handling ON tickets(handling) WHERE handling = 'external';
