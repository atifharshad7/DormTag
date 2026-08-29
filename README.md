# DormTag

**Scan it. Book it. Done.**

DormTag is repair reporting for student halls. Something breaks in your room, you scan the QR sticker on the door, tap what it is, and pick a time the caretaker comes. No email, no waiting for a reply that never arrives.

Every repair is logged to the exact room and fixture, so after a year the operator doesn't see eleven complaints, they see the one pipe causing them.

**Status:** working demo, seeded with a year of example data. German and English. Built as a product engineering exercise.

## What it does

### For residents

* Scan the sticker in the room, tap the fixture, tap what's wrong. Twenty seconds, no typing, no account needed for shared spaces.
* Pick the appointment yourself from times the caretaker actually offered, so nobody rings the bell during a lecture.
* See exactly where it stands, including when a part is on order and what the supplier said.
* Reports are grouped by what needs your attention: pick a time, booked, waiting on a part, reported, done.
* Grant "enter without me" so simple jobs don't need you there at all.
* A bell for what changed, and a reminder the evening before an appointment.

### For caretakers

* One queue instead of a mailbox, split into booked, no appointment, waiting for parts, and with an external firm.
* Offer appointment times on a day strip and hour grid. Hours you're already committed to are greyed out before you submit.
* Close a job with a cause code in four taps and no typing. "Nobody home" is a first-class button, not buried in a menu.
* Hand work you can't legally do to a trade: electrical, plumbing, heating, locksmith, glazing, pest, lift.
* Print QR sticker sheets per building, scoped to the buildings assigned to you, with filters by floor, room type and unit so reprinting one damaged sticker doesn't mean printing 240.
* Scan a fixture in the corridor to pull up its history on the spot.
* Rename a room, because you're the one who notices there are two bathrooms.

### For operators

* A **left panel** rather than a header: Dashboard, Buildings, Staff, QR stickers,
  Access codes, and Organisations for a platform admin. On a phone the same
  component becomes a bottom tab bar — Dashboard, Buildings, Staff, More — because
  a strip that scrolled sideways hid destinations with no sign they were there. Building it as a panel is
  what let the building cards shed four buttons each — the actions became
  destinations, so a card is a summary again and tapping it filters.
* Metrics you can click into. **Open reports** and **oldest open** are always
  there; the rest are chosen. Oldest-open isn't optional on purpose: it's the one
  number that surfaces the ticket everybody stopped seeing.
* **Customise** picks which numbers appear and how each panel is drawn, stored per
  organisation rather than per person, because two operators discussing different
  figures is a bad outcome.
* An escalated ticket no longer shows the resident an empty time picker.
  Escalating cancels the caretaker's appointment and withdraws its slot, so the
  panel rendered with nothing in it. It now says whether the wait is on the
  operator commissioning a firm or on the firm confirming a time — different
  news, and the data is already there.
* Reported-versus-fixed by month, as bars or lines. Tap a bar for that month's
  counts, median fix time, and splits by building, fixture and cause.
* **By trade** — electrical, plumbing, heating, openings, appliances. Grouping by
  trade asks a better question than grouping by fixture: it tells you which
  framework contract to negotiate rather than only what breaks.
* Most reported items, narrowable to bedrooms, kitchens, bathrooms or common
  areas. A corridor light is a caretaker problem; a bedroom light is usually the
  resident's own bulb.
* **Repeat faults by riser, and tappable.** Behind a row: which rooms, which
  causes were recorded, when they happened, and the tickets themselves — with the
  window adjustable, so you can check whether a pattern is forming rather than
  only seeing established ones.
* Filter everything by period and building; commission external firms; generate
  access codes; fill a whole building from its pattern.
* Per-room **code history**: when each code was issued, when it ended, and the
  handover note. Dates and notes only, never the old code strings — a revoked
  code has no legitimate use, and a page listing every code a building ever had
  is worse to leave open on a screen than the current sheet.

## Design notes

* **Sticker granularity follows ambiguity.** One sticker per room, so a four-person flat needs 7 instead of 26. An extra sticker per fixture only where a room holds several of the same type, like a laundry with three washing machines, because "machine 3" has to reach machine 3.
* **Nothing invents a time.** When an appointment falls through the ticket reuses the caretaker's remaining offers and withdraws the rejected one. If none are left it waits for him to propose new ones.
* **Access follows the unit, not the room.** A shared kitchen inside a locked flat still needs somebody to let the caretaker in. Only genuine common areas need nobody present.
* **A chart picker offers only what suits the data.** A trend reads honestly as
  bars or lines; four trades are parts of a whole so a donut works. The
  eight-fixture ranking is bars only, because three fixtures are tied at 4 and
  angles hide what bar lengths make obvious. The app has an opinion where the
  evidence is clear.
* **The median time to fix was removed.** Accurate, and there was nothing an
  operator could do with it that the oldest-open list doesn't do better. It's
  still available as an optional metric.
* **Room types stay codes.** Free-text room names would give you "Bad", "Badezimmer", "bathroom" and "WC" as four different things and the dashboard's grouping would quietly stop working. An optional label sits on top for what a code can't express.
* **A building's code is immutable**, because it's baked into every printed QR slug. The name is freely editable, and the sticker prints the name, so renaming never kills a sticker.
* **Analytics are per object, never per person.** The dashboard groups by building, riser and fixture, never by caretaker response time. A system that scores individual employees triggers works-council co-determination in a German public body.
* **Closed tickets are never deleted**, but reporter identities are anonymised a year after closure. The maintenance history is the asset; the link to the person is not.
* German institutional signage as the visual direction: slate enamel plates with mono room codes, traffic yellow reserved for the two things it means (the sticker, and waiting).
* Mobile first. The resident is on a phone, the caretaker is on a phone in a stairwell, and only the operator dashboard wants the width.

## Notifications

A bell in the header with an unread count. Tapping a notification opens the ticket it's about and marks that one read; opening the panel to glance does not clear anything you haven't dealt with.

Notifications are queued **in the same batch as the state change that caused them**, so a ticket can never move without the notification existing. The same table is the email outbox for later: `emailed_at` is the only column that feature needs.

Staff notifications address a **building**, not a person. Assignments change, and a caretaker who takes over a house should see what happened in it last week. One row instead of one per caretaker, resolved against `staff_buildings` at read time, with read state kept per person.

The one on a timer is the **appointment reminder**, the evening before. Failed visits are the biggest measured cost in the system, and the only thing between a booked slot and an empty room is whether the resident remembered. The appointment id is the idempotency key, so a second cron run in the same day cannot remind twice.

**What this doesn't do:** reach anyone who isn't looking at the app. That's email, and it needs a domain.

## Running it without touching code

An operator sets the estate up themselves. On an empty database the app offers **Set up DormTag** instead of a login, and whoever fills that in becomes the first operator; the endpoint refuses forever after.

Buildings are edited where they're already on screen: each card on the dashboard renames, adds units and assigns caretakers behind a pencil, so a mis-tap while reading the numbers can't rename anything. The same forms are reused in **Manage**, which is also where colleagues are added.

New staff get a **one-time setup link** rather than a password chosen for them: the operator never learns anyone's credentials, nothing plaintext ends up in a chat log, and the person owns their own login.

Four rules the code enforces, each because the alternative is unrecoverable:

* Un-assigning a caretaker from a building where he has **booked appointments** is refused. Silently orphaning an appointment a resident is expecting is worse than an error message.
* You cannot disable yourself or the **last remaining operator**. Locking yourself out needs database access to fix.
* Staff are **disabled, never deleted**, because their name is on closed tickets. Disabling revokes their sessions immediately.
* The demo seed refuses to run once a building exists that it didn't create, so nobody wipes a real estate by clicking **Load demo data** out of curiosity.

## Several organisations, one app

Each organisation has its own sealed estate. Buildings, staff and residents all
carry an `org_id`, and every query that could reach another organisation's rows
goes through one of three places: `ticketScope`, `notificationScope`, or
`scopeClause` for the dashboard aggregates. One place to get right per query
type, rather than a condition hand-written a dozen times.

A shared database with an `org_id` rather than a database each. The schema is
identical either way, so moving to per-organisation databases later means
exporting rows and dropping a column — the work would be the routing layer and a
migration runner, not the data model. What the shared approach costs is that
isolation depends on the condition being present, which is why there are 23
tests that deliberately try to cross the boundary: sign in as another
organisation and attempt to read tickets, rename a building, print stickers,
disable a caretaker, reassign coverage. All must fail, and guessing an id from
elsewhere returns 404 rather than the row.

**Signing up.** Anyone can register an organisation: name it, give your name and
an email address. No password is chosen there — a setup link goes to the address,
which proves the person controls that inbox and lets them pick their own password.
The domain is recorded as evidence: not proof of authority, but you can't get an
address on someone else's domain.

**Building codes repeat, slugs don't.** Every Studierendenwerk has a Haus A, but
`/r/a112-ba` is a URL and can't be ambiguous between two customers. So each
organisation gets a short `slug_prefix` which goes into the stored building code
and therefore into the slug, while `display_code` stays whatever the operator
typed and is what every screen shows. The demo organisation has an empty prefix,
so stickers printed before this change still resolve.

New organisations start `pending` and can't be used until approved. A pending or suspended organisation still resolves to a real
principal, so they can reach `/api/session` and be told why rather than being
silently signed out; every other route is refused by a single gate with a short
allowlist, so a route added later is closed by default. Suspending revokes their
sessions immediately and keeps their data. A platform admin (`staff.is_platform_admin`, set in the D1
console) approves them and deliberately gets **no** access to their tickets:
approving an organisation and reading a few hundred students' repair histories
are different powers.

The console shows names, statuses, signup domains and counts, never contents. It
can approve, suspend, reject, **export** and **delete when empty**.

There is deliberately no way to delete an organisation that has data. Suspending
already achieves everything a dispute needs — they can't get in, and nothing is
lost — and a Studierendenwerk's repair history is not a platform admin's to
destroy. Export exists so "can we have our data" has an answer, and it carries no
password hashes and no resident access codes: it's for their records, not a way to
walk off with live credentials. Deleting is limited to organisations with no
buildings and no residents, which covers a spam signup or your own test
organisations.

Rows the API would refuse are not offered: the list marks the caller's own
organisation, and a test asserts the API refuses to change it, so the button and
the guard can't drift apart.

Email addresses stay unique platform-wide rather than per organisation, because
`staff.email` is an inline `UNIQUE` constraint and SQLite can't drop the implicit
index without rebuilding the table. That means one person can't hold accounts at
two Studierendenwerke — a real limitation, and also the simpler design, since
sign-in resolves an account from the address alone and never has to ask which
organisation you meant.

The demo lives in its own organisation with status `demo`, and the seed only ever
touches that one, so nobody can wipe a real estate by finding the endpoint.

## Filling a building in one go

German student halls are usually built to a repeating plan, so the operator
describes the pattern once rather than filling in a form 120 times: floors 1 to
5, 8 units per floor, numbering as floor-plus-sequence or straight through,
layout studio or WG with *n* bedrooms, and optionally a corridor per floor.

**The preview runs first and writes nothing.** It reports the totals and the
first and last unit codes, because getting the numbering wrong and creating forty
wrong units is much worse than one wrong unit.

Existing unit codes are **skipped and reported** rather than failing the run, so a
second press fills gaps instead of erroring — the same property the code
generator has, and for the same reason: an operator will press it again whenever
they're unsure.

Writes are **chunked into batches of 80** statements. A 400-unit building is a few
thousand inserts, and a single oversized batch is the kind of thing that fails in
production rather than in a test.

## Resident access codes

An operator generates a code per bedroom, prints the sheet, and the
Studierendenwerk hands them out with the keys. A code is eight opaque
characters:

```
7KM2QX9F
```

Nothing in it says which room it opens or when it was issued. Two earlier
versions got this wrong and both are worth recording:

`B312-Z2-WS26-K7M2` told a next-door neighbour everything except four
characters. Four characters is 31⁴ ≈ 920 thousand combinations, which a script
works through in hours. Eight is 31⁸ ≈ 850 billion.

Then `WS26-7KM2QX` still carried the semester, on the theory that a stale sheet
should be obvious at a glance. But students stay in the same room for two to four
years, so a code issued in 2026 would have read as expired while working
perfectly — and reissuing 240 codes every semester, mostly to people who hadn't
moved, is churn. The **issue date belongs on the sheet**, where a 2026 date reads
as long-standing rather than expired.

The alphabet excludes `O`, `0`, `I`, `1` and `L`, because somebody reads this off
paper and types it on a phone.

**Sign-in is throttled on the caller, not on the code.** An earlier version keyed
the limit on the code being attempted, which meant somebody working through
`AAAAAA`, `AAAAAB`, `AAAAAC` never hit the same key twice and was never slowed at
all. A test brute-forces the endpoint and asserts it gets locked out; it runs last
in the suite, because a working throttle locks out the test client.

**Turnover is per room**, which is how it actually happens: somebody hands back
their keys, tells the operator, and one new code is issued and one slip printed.
DormTag doesn't try to detect turnover — the operator learns about it through
their own move-out process.

Ending a tenancy cuts off everything it granted: sign-in stops because the lookup
requires a live tenancy, existing sessions die for the same reason, and
**capability tokens are revoked explicitly**. That last part matters — those links
hang off the ticket rather than the tenancy, and they don't merely show a report,
they book appointments and grant entry to the flat. Somebody who moved out must
not be able to let a caretaker into their old room. Their past reports stay in the
history, attached to the room.

**Reissuing a whole building** is kept as a secondary action for the cases where
it's genuinely right: a house emptied for renovation, or a sheet you think leaked.

**Generate is safe to press repeatedly**, deliberately, because an operator will
press it whenever they're unsure. It covers bedrooms with no live tenancy, so
after adding rooms it issues codes for exactly the new ones. **Bedrooms only** —
"private" would have been the obvious filter and is wrong, because a studio's own
bathroom is private to that flat and still has no resident. A test caught that.

Two decisions worth naming. Codes are stored in **plain text**, so a sheet can be
reprinted — the same reasoning as a hotel key card, where recoverable beats
unrecoverable-if-stolen and revoking is one click. The cost is that a database
dump exposes live codes. And the sheet is **re-viewable** behind a deliberate
click with a warning, because the alternative pushes people to screenshot it.

**No names, no email addresses at creation.** The account is a room, so nothing
personal is held until a resident volunteers an address themselves.
`tenants.email` is `NOT NULL UNIQUE` and can't be relaxed without rebuilding a
live table, so generated rooms carry a placeholder on the reserved `.invalid`
domain, which the mail sender and the UI both treat as "no address".

## Passwords

Every password field has a **show/hide toggle**. Masked inputs cause more
lockouts than they prevent, especially on a phone where you can't see what
autocorrect did — and the toggle is a real button whose label changes between
"show" and "hide", so it's reachable by keyboard and announced properly rather
than being an eye-shaped mystery.

Setting a password asks for it **twice**, which is slightly redundant once you can
read what you typed and kept anyway: not everyone presses the toggle, and a
password manager filling both costs nothing. The mismatch shows as you type but
only disables the button; a red error after the first character of the second
field would be nagging.

Both live in one component used by all four places a password is set — first-run
setup, accepting an invite, resetting, and changing — so they can't drift apart.
Sign-in gets the toggle but no second field, since you're not setting anything
there.

## Every page has a URL

The app used to live at `/`, with four link paths and everything else in React
state. So the browser's back button either did nothing or left the app, and a
refresh dropped you back at the start. People reach for back without thinking; an
app that ignores it feels broken in a way that's hard to name.

Now `/dashboard/open`, `/buildings/B`, `/buildings/B/codes`,
`/dashboard/repeat/C-S2/DRAIN`, `/ticket/:id`, `/stickers/B` and the rest are real
paths, including the resident's report wizard: `/report`, `/report/:room`,
`/report/:room/:object`. That last one matters most — someone mid-report pressing
back used to leave the app entirely, taking the note they had typed with them.
The note itself stays in component state, so stepping back and forward keeps what
was written. Back and forward work, a refresh keeps
your place, and a view can be linked to. Filters ride in the query string —
`/dashboard?months=3&building=B` — because they shape a view rather than identify
one, and defaults are omitted so a plain dashboard link stays clean.

No routing library: about fifteen screens parse in a hundred lines, which is
cheaper than a dependency and easier to read than a config tree. `parse` and
`href` are inverses, and a test asserts every path round-trips — including a
riser code containing a slash.

Signing in **replaces** rather than pushes, so back doesn't return you to the
form you just used, and an operator's `/` replaces to `/dashboard` so the URL
always names where you are.

There is deliberately no `/buildings/:code/units/:unit`: the units are listed on
the building page, and a route that parses but renders nothing looks supported
and isn't. Unknown paths fall back to home rather than an error page,
and `not_found_handling` is already `single-page-application`, so a deep link
survives a hard refresh.

## Retention

Closed tickets are **never deleted**. The room-and-cause history is the entire reason the operator dashboard is worth anything, and once the reporter link is gone, "the drain in C-204 blocked twice" isn't personal data.

| | Kept |
| --- | --- |
| Ticket: room, fixture, symptom, cause, dates | Indefinitely |
| Reporter link (`tenant_id`, email, token) | 365 days after closure, or after the tenancy ends |
| Capability tokens | Revoked the moment the ticket closes |
| Login attempts | 30 days |
| Read notifications | 90 days |

A Cron Trigger runs retention and the appointment reminders daily at 03:00. The same functions are exposed to the operator so they can be tested rather than taken on faith. Retention anonymises rather than deletes: the ticket keeps its reporter *count*, loses the identities. Tests assert the ticket total is unchanged after a run and that the planted drain pattern still shows on the dashboard, because the failure mode here is housekeeping quietly eating the thing the product is for.

Residents see finished reports for 90 days, then they collapse behind *Show older*: hidden, not gone.

## Tech stack

* **Frontend:** React and TypeScript, built with Vite. No framework, no component library.
* **Backend:** a single [Cloudflare Worker](https://workers.cloudflare.com/) with a hand-rolled router, serving both the API and the static assets.
* **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite).
* **Auth:** own sessions. Staff use email and password (PBKDF2-SHA256, per-user salt, 100k iterations); residents use an access code. Session tokens are stored hashed, so a database dump doesn't hand over live sessions.
* **QR:** [`qrcode`](https://github.com/soldair/node-qrcode) to generate the sticker sheets, native `BarcodeDetector` with [`jsQR`](https://github.com/cozmo/jsQR) as a fallback for in-app scanning.
* **Housekeeping:** a Cron Trigger runs retention and appointment reminders daily.
* **Tests:** 532 end-to-end assertions in a plain Node script, no test framework.
* **Hosting:** Cloudflare Workers, auto-deploying from `main`.

## Project structure

```
worker/
  index.ts           # routes, row scoping, state machine, seed, retention
  core.ts            # env, crypto, sessions, principal, shared helpers
  admin.ts           # buildings, units, rooms, staff, invites, assignment
src/
  App.tsx            # app shell, resident and caretaker views
  Operator.tsx       # dashboard: metrics, charts, drill-downs
  Auth.tsx           # sign in, about page, scan landing, sticker sheet
  Admin.tsx          # first-run setup, invites, the buildings and staff pages
  BuildingEdit.tsx   # building card and forms, shared by dashboard and Manage
  Account.tsx        # language, sign out, Manage, About
  Notifications.tsx  # the bell and its panel
  Landing.tsx        # front door, demo picker, signup, waiting-for-approval
  Platform.tsx       # the platform console: which organisations exist
  Codes.tsx          # resident access codes and the printable sheet
  PasswordField.tsx  # password input with a show/hide toggle, and a typed-twice pair
  Sidebar.tsx        # the operator's left panel
  SlotPicker.tsx     # appointment time picker
  Scanner.tsx        # in-app QR scanner
  Logo.tsx           # the house-and-QR mark
  lib.ts             # i18n catalogue, label resolution, API client
  styles.css         # design tokens and layout
  main.tsx           # Vite entry
migrations/
  0*.sql             # schema, applied in order
  0*.console.sql     # same statements without comments, for the D1 dashboard
scripts/
  smoke.mjs          # end-to-end tests against a running worker
reference/
  schema.sql         # the Postgres design this started from
  schema-access.sql  # sessions and row-level security policies
  access.ts          # principal resolution for a Node/Postgres runtime
public/
  favicon.svg
index.html
wrangler.jsonc
```

The `reference/` folder is the Postgres version of the schema, kept because D1 forced two compromises worth documenting: no `EXCLUDE USING gist` for overlapping appointments, and no row-level security, so scoping lives only in `ticketScope()` in the worker.

Shared helpers live in `worker/core.ts` rather than `index.ts` because the Workers runtime treats every named export of the entry module as a handler and rejects the module when one of them is a number.

## Getting started (local development)

Requires Node.js 20+.

```
npm install
npm run build
npm run db:local
npm run dev
```

Then open the printed localhost URL, click **Load demo data** once, and sign in.

Run the tests in a second terminal while `npm run dev` is running:

```
npm run smoke
```

If `wrangler dev` fails with `Address already in use`, a stale `workerd` is holding the port: `pkill -f workerd` and retry.

## Backend setup (Cloudflare D1)

```
npx wrangler login
npx wrangler d1 create dormtag
```

Paste the printed `database_id` into `wrangler.jsonc`, then apply the schema and deploy:

```
npm run db:remote
npm run deploy
```

If you'd rather not use the terminal, create the database in the Cloudflare dashboard and paste each `migrations/0*.console.sql` file into the D1 console in order. Those versions have the comments stripped, because a clipboard that drops line breaks turns a leading `--` into a comment that swallows the whole script.

Finally, open the site and click **Load demo data** once. That writes three buildings, the sticker slugs, the demo accounts, and a year of history with a deliberately planted drain problem on one riser so the repeat-fault view has something to show.

**Demo credentials**, also displayed on the login screen:

| Role | Sign in with |
| --- | --- |
| Resident | code `B312-Z2-DEMO` |
| Caretaker | `hausmeister@wohnheim.test` / `hausmeister-demo-2026` |
| Operator | `verwaltung@wohnheim.test` / `verwaltung-demo-2026` |

Set `DEMO_MODE` to `"false"` in `wrangler.jsonc` before putting the URL anywhere public. It disables the seed endpoint, which wipes the database, and stops the login screen displaying credentials. Note that it does **not** yet disable the demo accounts themselves, which are in this repo with known passwords: delete them, or create your own operator and disable them, before the URL goes anywhere real.

## Deployment (Cloudflare Workers)

The site auto-builds on every push to `main` once you've connected the repo under Workers and Pages:

* Build command: `npm run build`
* Deploy command: `npx wrangler deploy`
* No environment variables needed. The D1 binding and the cron schedule live in `wrangler.jsonc`.

`wrangler.jsonc` also sets `not_found_handling: "single-page-application"` so client-side routes like `/r/b312-ku` don't 404 on refresh, and a daily cron at 03:00 for retention and reminders.

## What's deliberately missing

* **Email.** A slot offer nobody sees is worthless, and the outbox is already built for it, but sending needs a verified domain.
* **Web push.** Would cover the caretaker; won't cover residents, since on iOS it only works for an installed PWA and a student reporting twice a year won't install anything.
* **Photo upload.** Needs R2 and a `photo_key` column.
* **Rate limiting** on the public report endpoint. An open endpoint is an open spam endpoint.
* **Password reset and access-code recovery.** Both need an email sender.
* **Impressum and Datenschutzerklärung.** Legally required for a German online
  service and currently absent.
* **Archiving a building.** There is currently no way to remove one.
* **A contractor portal.** Commissioning is recorded, but the firm has no login.
* **Scheduling with an external firm.** `slot_offers.staff_id` points at staff, so the caretaker still offers the times. In practice he often attends to let them in, so it half works, but it's a modelling gap rather than a decision.

## Screenshots
<img width="590" height="1278" alt="IMG_7749" src="https://github.com/user-attachments/assets/d472aaa2-38c3-40f6-895e-3d7c2dbacff9" />
<img width="590" height="1278" alt="IMG_7746" src="https://github.com/user-attachments/assets/81b378b0-f0c4-44d0-866b-d883d60d422e" />
<img width="590" height="1278" alt="IMG_7752" src="https://github.com/user-attachments/assets/ac9175a5-1f6f-4d6e-a542-f869844b9195" />
<img width="1179" height="2379" alt="IMG_7748" src="https://github.com/user-attachments/assets/7fdb860a-5126-44f9-bd62-c566ffdd311d" />

<img width="590" height="1278" alt="IMG_7750" src="https://github.com/user-attachments/assets/3eec3556-3ec3-4f15-910c-fc2fde34a1ab" />

<img width="1512" height="864" alt="Screenshot 2026-08-09 at 11 26 00 PM" src="https://github.com/user-attachments/assets/615d00e3-6a49-4b90-8913-23c28875cd8d" />
<img width="1512" height="864" alt="Screenshot 2026-08-09 at 11 26 15 PM" src="https://github.com/user-attachments/assets/605543a8-10b8-49c1-9a4a-3b9533abfeeb" />
<img width="1512" height="864" alt="Screenshot 2026-08-09 at 11 28 22 PM" src="https://github.com/user-attachments/assets/23f49d47-1fe6-4af1-ac80-30c0f00c3165" />
<img width="1512" height="982" alt="Screenshot 2026-08-09 at 7 49 23 PM" src="https://github.com/user-attachments/assets/d954a269-efdd-49ce-a659-37fe953bd9a0" />
<img width="1512" height="982" alt="Screenshot 2026-08-09 at 9 15 47 PM" src="https://github.com/user-attachments/assets/8d2fcd75-1905-402f-8204-f037a89e2e97" />
<img width="1512" height="982" alt="Screenshot 2026-08-09 at 5 52 36 PM" src="https://github.com/user-attachments/assets/58042f24-e02f-4c7e-ae95-fa2c8fabf020" />
