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

The caretaker chooses the offered times himself. Two steps on one screen: pick a
day from a strip, tap the hours. Appointments sit on whole hours and last an
hour — that's a simplification for someone working on a phone, not a database
workaround, and it also means two visits can never partially overlap.

Appointment hours belong to the **building**, not the server or the browser. A
Worker runs in UTC, so `new Date(ms).getHours()` on 09:00 Berlin returns 7 and
every morning slot was rejected as "not offered" — a bug that only showed up once
real times were being picked. Validation now converts through
`Intl.DateTimeFormat` with an explicit zone, the client constructs timestamps the
same way, and the seed places its appointments on offerable local hours so demo
data reads like something a caretaker created.

Hours he's already committed to are greyed out and labelled *already booked*
before he submits. An earlier version accepted them and then reported that some
had been skipped, which is a confusing way to find out you're double-booked.

Booking still claims a slot in a single `INSERT ... SELECT ... WHERE NOT EXISTS`,
which evaluates the overlap guard and performs the write atomically inside
SQLite. With hourly slots the unique index would mostly suffice; the atomic
guard is kept because a read-then-write check would race, and it costs nothing.

The picker is built from `slotRules` served by `/api/session`, so the client and
the validator can't drift apart.

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

**Sticker granularity follows ambiguity.** One sticker per room, not per fixture:
a four-person flat needs 7 stickers instead of 26, a door frame is an obvious
place to put one, and it doesn't go stale when the fridge is replaced. Scanning
resolves the room and offers its fixtures as one-tap choices.

The exception is multiples. A laundry with three washing machines gets a sticker
per machine, because "machine 3" has to reach machine 3 — and the number matters
for the repeat-fault analysis, since one bad machine and a bad laundry are
different problems. The sticker sheet works this out from the data rather than
being told: an object sticker is printed only where a room holds more than one of
that type.

Common areas belong to a floor rather than a flat, so each corridor gets its own
sticker. Object slugs still resolve, so anything already printed keeps working. No app install — a phone's built-in camera
reads the code and opens the browser.

Access follows the **unit**, not the room kind. A WG's shared kitchen sits inside
a locked flat, so somebody still has to let the caretaker in — any flatmate will
do, but it needs an appointment. Only genuine common areas (stairwell, laundry)
need nobody present, and even there the caretaker can still offer times if he
wants residents to know he's coming. My first version keyed this off
private-versus-shared and got WG bathrooms wrong.

Shared rooms (kitchen, corridor, laundry) can be reported anonymously, because
the person who notices a dead corridor light may not live on that floor. Private
rooms require a session. An anonymous report returns a capability token and the
reporter gets `/t/:token` as their only way back to the ticket.

There is also an in-app scanner (the camera icon in the header) for staff
walking a building: native `BarcodeDetector` where available, jsQR as a fallback
for Safari and Firefox, lazily loaded so it costs nothing until opened. It needs
a secure context, and it degrades with an explicit message rather than a dead
button when permission is refused or no camera exists.

Staff can print a sheet of stickers per building from the app (`/api/stickers/:code`,
scoped to their assigned buildings). Each sticker carries the QR, the
human-readable location, and the slug in text as a fallback for when the code is
scuffed or the phone is dead.

### Work a caretaker can't legally do

A caretaker changes washers and clears traps. He cannot touch electrical, gas or
heating work — in Germany that requires a qualified firm — and some jobs are
simply beyond one person. So he can hand a ticket to a trade, choosing the trade
(Elektro, Sanitär, Heizung, Schlosser, Glaser, Schädlinge, Aufzug) and a reason:
needs a qualified firm, too big, keeps coming back, safety risk, warranty.

The **operator** commissions the firm, because that's who holds the budget and
the contracts, and records the firm name and order reference. The dashboard has a
metric for work sitting with a trade, split by whether it's been commissioned
yet — uncommissioned work is listed first, since that's the queue somebody has to
act on. Escalated tickets leave the caretaker's working queue and appear under
*with an external firm*; the resident is told a firm is taking it on, which is
better than silence while nothing appears to happen.

`SYSTEMIC` as a reason is the interesting one: it's the point where the
caretaker's ground truth meets the repeat-fault dashboard. He's seen the same
riser three times and is saying so in a field the operator can count.

Escalation is a change of **handling**, not a new ticket state — the ticket is
still open and still needs an appointment. That's also the pragmatic choice:
SQLite can't alter the CHECK constraint on `tickets.state` without rebuilding the
table, which isn't worth doing to a live database for a label.

### The operator dashboard

Four metrics, a trend chart, an object breakdown, the repeat-fault ranking, and a
building grid — all driven by two controls: a period (1, 3, 6 or 12 months) and a
building filter. Clicking a building card filters everything to it; clicking it
again clears.

Three of the four metric cards are clickable and open the tickets behind the
number: everything currently open, everything waiting on a supplier (with the
part and the unit), and every visit where nobody was home (with the missed time).
A number you can't interrogate is a number nobody trusts.

The trend chart is hand-rolled from divs — reported per month as the outline,
fixed as the filled portion — because a charting library would have cost more
bundle than the chart is worth. Each bar carries its count and is a real button:
tapping a month opens a panel with that month's reported / fixed / still-open
counts and median fix time, plus breakdowns by building, by object and by cause,
and the tickets themselves.

The chart and the panel share one SQL expression for the month bucket
(`MONTH_BUCKET`), so a bar and its detail are computed the same way rather than
nearly the same way. A test asserts the panel total equals the bar it came from,
which is the invariant most likely to drift silently, along with the building
split summing to the month total and the metric-card drill-downs matching their
cards exactly.

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

## Retention

Closed tickets are **never deleted**. The room-and-cause history is the entire
reason the operator dashboard is worth anything — repeat-fault detection needs a
year minimum, and the case for replacing a riser rests on three. Once the
reporter link is gone, "the drain in C-204 blocked twice" isn't personal data.

So the record and the person are separated, and only the person expires:

| | Kept |
| --- | --- |
| Ticket: room, fixture, symptom, cause, dates | Indefinitely |
| Reporter link (`tenant_id`, email, token) | 365 days after closure, or after the tenancy ends |
| Capability tokens | Revoked the moment the ticket closes |
| Login attempts | 30 days |
| Expired sessions, unclaimed old offers | Purged |

A Cron Trigger runs `runRetention` daily at 03:00; the same function is exposed
at `POST /api/dev/retention` for the operator so it can be tested rather than
taken on faith. It anonymises rather than deletes — the ticket keeps its reporter
*count*, loses the identities. There's a test asserting the ticket total is
unchanged after a run, and another that the planted drain pattern still shows on
the dashboard afterwards, because the failure mode here is housekeeping quietly
eating the thing the product is for.

Tokens are revoked by overwriting the value rather than by an expiry column: the
column is already `UNIQUE NOT NULL`, so `'revoked-' || id` invalidates the link
without a migration, and principal resolution refuses anything matching that
shape.

Residents see finished reports for 90 days, then they collapse behind *Show
older* — hidden, not gone.

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
