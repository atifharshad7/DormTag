# DormTag

Repair coordination for student halls. A resident scans a QR sticker, taps
what's broken, and picks an appointment slot; the caretaker works a queue and
closes each job with a cause code; the operator sees which faults keep coming
back from the same pipe.

The name is the front door: every fixture in the building carries a tag, and
scanning it is the whole reporting flow.

Built as a product-engineering exercise. The interesting parts are the data
model and the state machine, not the CRUD.

**Stack:** Cloudflare Workers · D1 (SQLite) · React · Vite · TypeScript, no framework.

---

## The problem

German student halls run repairs on email, phone and paper slips pinned by the
caretaker's door. Three things go wrong:

1. **No status.** The resident reports a leak and hears nothing for three weeks.
   Usually the honest answer is "we're waiting for a part" — but nobody says so.
2. **Missed appointments.** The caretaker arrives, nobody's home, repeat in three
   weeks. In the seeded data this is **31% of visits**, and until now nobody could
   measure it.
3. **No memory.** Eleven blocked drains on one riser looks like eleven clumsy
   students, because the pattern only exists in one person's head.

Most tenant portals solve (1) with a web form. This tries to solve (2) and (3).

---

## Three design decisions worth reading the code for

### 1. Structured locations, not free text

The location tree is `Building → Unit → Room → Object`, and every report stores
`object_id` plus a symptom code — never a sentence. `Unit` exists as its own
level because a WG breaks a flat building/room model: **tenancies attach to a
room**, but **shared spaces attach to the unit**.

Objects also carry a `riser` — the plumbing or electrical stack they sit on.
That single nullable column is what makes repeat-fault detection possible.
Group faults by building and you learn nothing; group by riser and the pipe
problem falls out.

Free-text reports would have made this permanently unrecoverable. You cannot
retrofit structure onto a year of prose.

### 2. Appointments are append-only

`UPDATE appointments SET slot_id = ...` destroys the thing the dashboard needs.
Instead each change inserts a row and cancels the previous one, with a status of
`booked` / `completed` / `cancelled_by_tenant` / `cancelled_by_staff` /
`no_access`.

`no_access` is the important one. It's a one-tap outcome for the caretaker, and
it's the only reason the failed-visit metric can exist at all.

### 3. Three concurrency guards live in the database

Not in a service layer, where they'd fail under concurrency:

```sql
CREATE UNIQUE INDEX one_open_ticket_per_object
  ON tickets(object_id) WHERE state NOT IN ('done','cancelled');
CREATE UNIQUE INDEX one_booked_appt_per_ticket
  ON appointments(ticket_id) WHERE status = 'booked';
CREATE UNIQUE INDEX staff_not_double_booked
  ON appointments(staff_id, starts_at) WHERE status = 'booked';
```

The first is deduplication: three residents reporting the same corridor light
produce one ticket and three `ticket_reporters` rows. Everyone gets updates;
the caretaker gets one job.

Postgres would express the third as an `EXCLUDE USING gist` over a time range.
D1 has no `btree_gist`, so slots are generated on a fixed hourly grid and the
index covers exact-time collision. That's a real trade-off, written down rather
than hidden — see the comment at the top of `migrations/0001_init.sql`.

---

## The state machine

```
reported → accepted → slots_offered → scheduled → done
                            ↑              │
                            └──────────────┤  no_access, reschedule
                            └── waiting_for_parts
```

Transitions are declared in one table in `worker/index.ts` and checked on every
write; an illegal one returns 409 rather than silently corrupting state.

The `waiting_for_parts` branch looping **back to slot offering** is the piece a
naive implementation misses. Without it the caretaker either closes the ticket
early or leaves it open forever.

Parts show facts, never predictions: *ordered Tuesday · supplier says KW 34*.
Promising a date you then miss is worse than saying nothing.

---

## Access control

Three principals, three mechanisms, because they have three different trust
levels and three different tolerances for friction:

| Principal | Mechanism | Why |
| --- | --- | --- |
| Resident | signed session cookie, magic-link ready; capability token per ticket | Reports twice a year — an account is friction they'll never pay |
| Caretaker | signed session cookie, scoped to assigned buildings | Daily user with a persistent queue |
| Operator | signed session cookie, aggregate views only | Sees the whole estate |

Session tokens are stored **hashed**, so a database dump doesn't hand over live
sessions. The cookie carries the raw token unsigned — an HMAC would add no
security over an unguessable 256-bit token validated against the database, and
it adds a deploy-time secret that can silently be missing. `ticketScope()` is the single source of truth for row visibility:

- Operator — everything
- Caretaker — only buildings in `staff_buildings`
- Resident — own private room, plus every shared room in their unit. **Never a
  flatmate's bedroom.**
- Capability token — exactly one ticket

Anonymous reporting is allowed for **shared rooms only**, because the person who
notices a broken corridor light may not live on that floor.

And `mayBookOrConsent()` is deliberately one function used for both picking the
slot and granting entry — they're the same permission wearing two hats. A
flatmate can report that your radiator is dead; only you can let someone into
your room.

**No client-side role variable, and no role-switch endpoint.** Staff sign in
with email and password (PBKDF2-SHA256, per-user salt, 100k iterations);
residents sign in with an access code of the kind a welcome letter would carry.
The role comes from the account row, never from the request. Both paths are
throttled per identifier, and the password check derives a hash even for unknown
emails so response time doesn't leak whether an account exists.

In demo mode the login screen *displays* working credentials, but the reviewer
still signs in through the production path. A resident session cannot become a
caretaker session by any request the client can make.

### QR stickers

Every fixture has a `qr_slug`, and `/r/:slug` is the front door: scanning it
resolves the sticker, pre-fills building, room and object, and offers the rest
of the room as one-tap alternatives. No app install — a phone's built-in camera
reads the code and opens the browser.

Shared rooms (kitchen, corridor, laundry) can be reported anonymously, because
the person who notices a dead corridor light may not live on that floor. Private
rooms require a session. An anonymous report returns a capability token and the
reporter gets `/t/:token` as their only way back to the ticket.

Staff can print a sheet of stickers per building from the app (`/api/stickers/:code`,
scoped to their assigned buildings). Each sticker carries the QR, the
human-readable location, and the slug in text as a fallback for when the code is
scuffed or the phone is dead.

### Analytics are per-object, never per-person

The dashboard groups by building, riser and object — never by caretaker
response time. In a German public body, a system that scores individual
employees triggers works-council co-determination and can stall a rollout
outright. Designed out rather than argued about later.

---

## Running it

```bash
npm install
npm run build
npm run db:local          # apply the schema to a local D1
npm run dev               # http://localhost:8787
```

Then click **Load demo data** once, and pick a role.

> **Local gotcha:** if `wrangler dev` dies with `Address already in use`, a stale
> `workerd` is holding the port. `pkill -f workerd` and retry. `npm run dev`
> does this for you.

### Deploying to Cloudflare

```bash
npx wrangler d1 create dormtag      # paste the id into wrangler.jsonc
npm run db:remote
npm run deploy
```

Set `DEMO_MODE` to `"false"` in `wrangler.jsonc` before making the URL public —
the seed endpoint wipes the database.

### Tests

```bash
npm run typecheck
npm run smoke             # against a running `wrangler dev`
```

`scripts/smoke.mjs` covers the state machine, all three concurrency guards, and
every authorization rule — including the ones that must *fail*: forged cookies,
a resident reaching the dashboard, anonymous reporting of a private room, a
flatmate booking someone else's slot, reusing a claimed slot, and the 24-hour
reschedule cutoff.

---

## Seeded data

The seed generates 12 months of history across three buildings with a pattern
**deliberately planted in it**: eleven blocked-drain tickets on Haus C riser 2,
across seven rooms, eight of them closed with cause `RISER`.

This is on purpose. Repeat-fault detection needs a year of history before it
says anything, so a reviewer opening an empty dashboard would see nothing. With
the seed, the finding is visible on first load — and it's surrounded by
background noise so the pattern has to actually stand out.

---

## Language

The database stores `KITCHEN` / `SINK` / `RISER`. `src/lib.ts` is the only place
those become words. So the dashboard counts sink leaks across the whole estate
regardless of which language each report was filed in, and the caretaker reads
German while the resident reads English off the same row.

This matters more than it sounds: a large share of hall residents don't speak
German, and writing a Schadensmeldung email in German is a real barrier. Tapping
`kitchen → sink → leaking` is not. The tile picker is the accessibility feature,
not a styling choice.

---

## Design direction

German institutional signage rather than generic SaaS: slate enamel plates with
mono room codes, traffic yellow used only where it signals something — the QR
sticker and the waiting state. The plate `B-312 · Küche` appears in all three
roles, which is what makes them feel like one system.

Mobile-first throughout. The resident is on a phone; the caretaker is on a phone
in a stairwell, which is why closing a job is four taps and no typing; only the
operator dashboard wants the width.

---

## What's deliberately missing

- **Email/push notifications.** A slot offer nobody sees is worthless, so this
  is the first real gap. Structure is in place (`ticket_reporters.locale`,
  per-reporter tokens); the sender is not.
- **Photo upload.** Needs R2. The schema has nowhere to put it yet.
- **Rate limiting** on the public report endpoint. An open endpoint is an open
  spam endpoint.
- **Password reset and magic links.** Staff passwords are set at seed time;
  there is no self-service reset, because there is no email sender yet.
- **A caretaker availability calendar.** Slots are generated per ticket, which
  is simpler and enough here. A weekly availability grid would be a new table
  with `slot_offers` generated from it.

## Repository layout

```
migrations/0001_init.sql   schema, indexes, v_ticket_location
worker/index.ts            API, auth, row scoping, state machine, seed
src/lib.ts                 i18n catalogue, label resolution, API client
src/App.tsx                all three role views
src/styles.css             design tokens and layout
scripts/smoke.mjs          end-to-end tests
```

There is also a Postgres variant of the schema (`schema.sql`,
`schema-access.sql`) with `EXCLUDE USING gist` and row-level security, kept as
the reference design — see the D1 notes above for what changed and why.
