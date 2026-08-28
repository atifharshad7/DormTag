-- DormTag migration 0012 — the operator decides what the dashboard shows
--
-- Which numbers appear, and how each panel is drawn. Stored per ORGANISATION
-- rather than per person: two operators at the same Studierendenwerk looking at
-- different figures and then discussing them is a bad outcome, and it's one row
-- instead of one per user.
--
-- JSON rather than columns, because the set of metrics will change and a
-- migration per metric is not worth it. Nothing here is authorisation, so a
-- malformed value can only produce a duller dashboard.

ALTER TABLE orgs ADD COLUMN dash_metrics TEXT;
ALTER TABLE orgs ADD COLUMN dash_charts TEXT;
