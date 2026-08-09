-- DormTag migration 0005 — stickers move to the room
--
-- One sticker per object meant 26 stickers for a single four-person flat, each
-- needing a sensible physical home ("where does the window sticker go?") and each
-- going stale when the fixture is replaced.
--
-- Granularity now follows ambiguity: one sticker per room, and an extra sticker
-- per object only where a room holds more than one of the same type — a laundry
-- with three washing machines, where knowing it's machine 3 is the whole point.
--
-- Object slugs are kept, so every sticker already printed still resolves.

ALTER TABLE rooms ADD COLUMN qr_slug TEXT;

CREATE UNIQUE INDEX one_room_slug ON rooms(qr_slug) WHERE qr_slug IS NOT NULL;
