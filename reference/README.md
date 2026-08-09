# Postgres reference design

The design this project started from, before D1 forced two changes.

- `schema.sql`         — full schema with `EXCLUDE USING gist` for staff double-booking
- `schema-access.sql`  — sessions, magic links, and row-level security policies
- `access.ts`          — principal resolution and capability checks for a Node/Postgres runtime

Two things D1 could not do, and what the shipped version does instead:

1. **`EXCLUDE USING gist`** over a time range prevents *overlapping* appointments
   for one caretaker. SQLite has no such constraint, so slots are generated on a
   fixed hourly grid and a unique index on `(staff_id, starts_at)` covers
   exact-time collision.
2. **Row-level security.** D1 has none, so scoping is enforced only in
   `ticketScope()` in the worker. The Postgres variant keeps both layers, so a
   raw query written in a hurry still gets refused by the database.
