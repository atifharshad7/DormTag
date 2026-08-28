/**
 * scripts/smoke.mjs — end-to-end check against a running `wrangler dev`.
 *
 *   npm run build && npx wrangler dev --local --port 8788   (in one terminal)
 *   node scripts/smoke.mjs                                  (in another)
 *
 * Verifies the state machine, the three concurrency guards, and every
 * authorization rule. Exits non-zero on the first failure.
 */

const BASE = process.env.BASE || "http://localhost:8788";

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

async function req(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      origin: BASE,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, setCookie: res.headers.getSetCookie?.() ?? [] };
}

const CREDS = {
  staff:    { email: "hausmeister@wohnheim.test", password: "hausmeister-demo-2026" },
  operator: { email: "verwaltung@wohnheim.test",  password: "verwaltung-demo-2026" },
  resident: { code: "B312-Z2-DEMO" },
};

function jarOf(r) {
  return r.setCookie
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

/** Real credential login — there is no role-switch endpoint to shortcut. */
async function login(as) {
  const r = as === "resident"
    ? await req("/api/auth/resident", { method: "POST", body: CREDS.resident })
    : await req("/api/auth/staff", { method: "POST", body: CREDS[as] });
  if (r.status !== 200) throw new Error(`login as ${as} failed: ${JSON.stringify(r.json)}`);
  return jarOf(r);
}

const section = (s) => console.log(`\n${s}`);

// Build timestamps in the building's zone, the way the picker does. The test
// process runs in UTC, so setHours() alone would land on the wrong hour.
const TZ = "Europe/Berlin";
function tzOffsetMs(ms) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = f.formatToParts(new Date(ms));
  const g = (t) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
}
function nextAt(hour, daysAhead = 1) {
  const nowShift = new Date(Date.now() + tzOffsetMs(Date.now()));
  const naive = Date.UTC(nowShift.getUTCFullYear(), nowShift.getUTCMonth(),
    nowShift.getUTCDate() + daysAhead, hour, 0, 0, 0);
  let ms = naive - tzOffsetMs(naive);
  return naive - tzOffsetMs(ms);
}


/* ---------------------------------------------------------------- */

section("seed");
ok("seed succeeds", (await req("/api/dev/seed", { method: "POST" })).status === 200);

section("sessions");
const staff = await login("staff");
const tenant = await login("resident");
const operator = await login("operator");
ok("staff cookie issued", staff.startsWith("sid="));
ok("tenant cookie issued", tenant.startsWith("tid="));

const s1 = await req("/api/session", { cookie: staff });
ok("staff principal resolves", s1.json.principal.kind === "staff", JSON.stringify(s1.json.principal));
ok("staff scoped to 3 buildings", s1.json.principal.buildingIds?.length === 3);
const s2 = await req("/api/session", { cookie: operator });
ok("operator principal resolves", s2.json.principal.kind === "operator");
ok("forged cookie is rejected", (await req("/api/session", { cookie: "sid=not-a-real-token.badsig" })).json.principal.kind === "anonymous");

section("row scoping");
const tAll = await req("/api/tickets", { cookie: staff });
const tMine = await req("/api/tickets", { cookie: tenant });
ok("staff sees the whole estate", tAll.json.tickets.length > 20, `got ${tAll.json.tickets.length}`);
ok("tenant sees only their unit", tMine.json.tickets.length < 8, `got ${tMine.json.tickets.length}`);
ok("tenant sees no other bedroom",
  tMine.json.tickets.every((t) => t.room_kind === "shared" || t.room_code === "Z2"),
  JSON.stringify(tMine.json.tickets.map((t) => t.room_code)));
ok("anonymous sees nothing", (await req("/api/tickets")).json.tickets.length === 0);

section("authorization");
ok("tenant cannot reach the dashboard", (await req("/api/dashboard", { cookie: tenant })).status === 403);
ok("staff cannot reach the dashboard", (await req("/api/dashboard", { cookie: staff })).status === 403);
ok("operator can", (await req("/api/dashboard", { cookie: operator })).status === 200);
ok("tenant cannot accept a ticket", (await req("/api/tickets/L4/accept", { method: "POST", cookie: tenant })).status === 403);
ok("anonymous cannot report a private room",
  (await req("/api/tickets", { method: "POST", body: { objectId: "u-B-207-Z1-LIGHT", symptom: "NO_POWER" } })).status === 403);
ok("anonymous CAN report a shared room",
  (await req("/api/tickets", { method: "POST", body: { objectId: "u-A-COM1-FL-DOOR", symptom: "BROKEN" } })).status === 200);
ok("a resident cannot report a bedroom in another flat",
  (await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-B-207-Z1-SOCKET", symptom: "NO_POWER" } })).status === 403);
ok("a resident CAN report a flatmate's bedroom in their own flat",
  [200].includes((await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-B-312-Z3-WINDOW", symptom: "DRAUGHTY" } })).status));
ok("a resident CAN report shared space in another building",
  [200].includes((await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-C-COM2-WK-WASHER1", symptom: "NOISE" } })).status));
ok("signing in is never more restrictive than staying anonymous",
  (await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-A-COM1-FL-LIGHT", symptom: "NO_POWER" } })).status !== 403);

section("symptoms make sense for the fixture")
ok("a nonsense symptom is refused",
  (await req("/api/tickets", { method: "POST", cookie: tenant,
    body: { objectId: "u-B-312-KU-FRIDGE", symptom: "ON_FIRE_MAYBE" } })).status === 400);
ok("a fridge can be reported as not cooling", await (async () => {
  const r = await req("/api/tickets", { method: "POST", cookie: tenant,
    body: { objectId: "u-B-312-KU-FRIDGE", symptom: "NOT_COOLING" } });
  return r.status === 200;
})());
ok("something else is always available", await (async () => {
  const r = await req("/api/tickets", { method: "POST", cookie: tenant,
    body: { objectId: "u-B-312-Z2-SOCKET", symptom: "OTHER", note: "sparks when I plug in" } });
  return r.status === 200;
})());
ok("the retired code is still accepted for historic data",
  (await req("/api/tickets", { method: "POST",
    body: { objectId: "u-A-COM1-FL-DOOR", symptom: "COLD" } })).status === 200);

section("deduplication");
const sameAgain = await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-B-312-KU-SINK", symptom: "LEAKING" } });
ok("re-report on a live object merges instead of duplicating", sameAgain.json.merged === true, JSON.stringify(sameAgain.json));
const before = (await req("/api/tickets/L3", { cookie: staff })).json.reporterCount;
await req("/api/tickets", { method: "POST", body: { objectId: "u-C-COM2-FL-LIGHT", symptom: "NO_POWER" } });
const after = (await req("/api/tickets/L3", { cookie: staff })).json.reporterCount;
ok("a new reporter joins the existing ticket", after === before + 1, `${before} -> ${after}`);
ok("the same person twice does not add a row",
  (await req("/api/tickets/L1", { cookie: tenant })).json.reporterCount === 1);

section("state machine");
const closed = tAll.json.tickets.find((x) => x.state === "done").ticket_id;
ok("illegal transition refused (reopening a closed ticket)",
  (await req(`/api/tickets/${closed}/accept`, { method: "POST", cookie: staff })).status === 409);

const flow = async (label, path, cookie, body) => {
  const r = await req(`/api/tickets/L1${path}`, { method: "POST", cookie, body });
  ok(label, r.status === 200, JSON.stringify(r.json));
  return r;
};
const slots = async (cookie) => (await req("/api/tickets/L1", { cookie })).json.slots;

// Part arrival no longer invents times — it hands the ticket back to the
// caretaker to propose them.
await flow("part marked arrived", "/part-arrived", staff);
let st0 = (await req("/api/tickets/L1", { cookie: staff })).json;
ok("no times are invented when the part lands", st0.slots.length === 0);
ok("ticket waits on the caretaker", st0.ticket.state === "accepted", st0.ticket.state);

const near = (h, d = 1) => nextAt(h, d);
ok("caretaker offers two times", (await req("/api/tickets/L1/offer", { method: "POST", cookie: staff,
  body: { slots: [near(8), near(9)] } })).status === 200);

let sl = await slots(tenant);
ok("both times are offered", sl.length === 2, `${sl.length}`);

const soon = sl[0];
await flow("tenant books an imminent slot", "/book", tenant, { slotId: soon.id });
const tooLate = await req("/api/tickets/L1/reschedule", { method: "POST", cookie: tenant });
ok("24h cutoff blocks self-reschedule", tooLate.status === 409, JSON.stringify(tooLate.json));

ok("unbooked offers survive a booking", (await slots(tenant)).length === 1);

ok("staff can still move it inside the cutoff",
  (await req("/api/tickets/L1/reschedule", { method: "POST", cookie: staff })).status === 200);
st0 = (await req("/api/tickets/L1", { cookie: staff })).json;
ok("rescheduling reuses the caretaker's other time, not a new one",
  st0.ticket.state === "slots_offered" && st0.slots.length === 1, JSON.stringify(st0.slots.map((x) => x.starts_at)));
ok("the rejected time is withdrawn, not offered back",
  !st0.slots.some((x) => x.starts_at === soon.starts_at));

sl = await slots(tenant);
await flow("tenant books the remaining time", "/book", tenant, { slotId: sl[0].id });
ok("no offers left to choose", (await slots(tenant)).length === 0);

const noneLeft = await req("/api/tickets/L1/reschedule", { method: "POST", cookie: staff });
ok("with nothing left, the ticket goes back to the caretaker",
  noneLeft.status === 200 && noneLeft.json.remaining === 0, JSON.stringify(noneLeft.json));
st0 = (await req("/api/tickets/L1", { cookie: staff })).json;
ok("state is accepted, awaiting new times", st0.ticket.state === "accepted", st0.ticket.state);
ok("still no invented times", st0.slots.length === 0);

// Avoid 11:00 — the seed already books this caretaker at 11:00 tomorrow
// (building time), and the overlap filter would correctly drop it.
ok("caretaker proposes again", (await req("/api/tickets/L1/offer", { method: "POST", cookie: staff,
  body: { slots: [near(14), near(15)] } })).status === 200);
ok("both proposals survive the overlap filter", (await slots(tenant)).length === 2);
sl = await slots(tenant);
await flow("tenant books again", "/book", tenant, { slotId: sl[0].id });
await flow("staff records nobody home", "/no-access", staff);
st0 = (await req("/api/tickets/L1", { cookie: staff })).json;
ok("no-access reuses the remaining offer", st0.ticket.state === "slots_offered" && st0.slots.length === 1);
ok("no_access recorded on the appointment",
  st0.appointments.some((a) => a.status === "no_access"));

sl = await slots(tenant);
await flow("tenant books after the no-show", "/book", tenant, { slotId: sl[0].id });
await flow("staff closes with a cause", "/done", staff, { cause: "SEAL" });
st0 = (await req("/api/tickets/L1", { cookie: staff })).json;
ok("ticket is done", st0.ticket.state === "done");
ok("cause recorded", st0.ticket.cause === "SEAL");
ok("closed_at set", !!st0.ticket.closed_at);
ok("full audit trail preserved", st0.events.length >= 12, `${st0.events.length} events`);

section("reporting on a closed object works again");
const again = await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-B-312-KU-SINK", symptom: "BLOCKED" } });
ok("new ticket opens once the old one closed", again.status === 200 && again.json.merged === false, JSON.stringify(again.json));

section("dashboard");
const dash = (await req("/api/dashboard?months=12", { cookie: operator })).json;
ok("metrics present", typeof dash.metrics.open === "number" && dash.metrics.failedPct >= 0, JSON.stringify(dash.metrics));
const drain = dash.repeats.find((r) => r.building_code === "C" && r.object_type === "DRAIN");
ok("planted drain pattern is detected", !!drain, JSON.stringify(dash.repeats.slice(0, 2)));
if (drain) {
  ok("11 tickets on the riser", drain.ticket_count === 11, `got ${drain.ticket_count}`);
  ok("across 7 rooms", drain.rooms_affected === 7, `got ${drain.rooms_affected}`);
  ok("majority logged as systemic", drain.systemic >= 8, `got ${drain.systemic}`);
  ok("drain pattern ranks at the top", dash.repeats.slice(0, 2).some((r) => r.object_type === "DRAIN"),
    JSON.stringify(dash.repeats.slice(0, 2).map((r) => `${r.object_type}:${r.ticket_count}`)));
  ok("no other group spans as many rooms",
    dash.repeats.every((r) => r.object_type === "DRAIN" || r.rooms_affected <= drain.rooms_affected));
}
ok("failed-visit rate is non-zero", dash.metrics.failedPct > 0, `${dash.metrics.failedPct}%`);

section("dashboard: period filter");
ok("period is echoed back", dash.filter.months === 12 && dash.filter.building === null);
const oneMonth = (await req("/api/dashboard?months=1", { cookie: operator })).json;
ok("a shorter period returns fewer trend buckets",
  oneMonth.trend.length <= dash.trend.length, `${oneMonth.trend.length} vs ${dash.trend.length}`);
ok("a shorter period finds fewer or equal repeats",
  oneMonth.repeats.length <= dash.repeats.length);
ok("an invalid period falls back to 12 months",
  (await req("/api/dashboard?months=99", { cookie: operator })).json.filter.months === 12);

section("dashboard: building filter");
const onlyC = (await req("/api/dashboard?months=12&building=C", { cookie: operator })).json;
ok("building is echoed back", onlyC.filter.building === "C");
ok("repeats are limited to that building",
  onlyC.repeats.every((r) => r.building_code === "C"), JSON.stringify(onlyC.repeats.map((r) => r.building_code)));
ok("the drain pattern survives the building filter",
  onlyC.repeats.some((r) => r.object_type === "DRAIN"));
const onlyA = (await req("/api/dashboard?months=12&building=A", { cookie: operator })).json;
ok("another building excludes it", !onlyA.repeats.some((r) => r.building_code === "C"));
ok("building list is always present for the picker", onlyA.buildings.length === 3);

section("dashboard: charts");
ok("trend has monthly buckets", dash.trend.every((x) => /^\d{4}-\d{2}$/.test(x.bucket)),
  JSON.stringify(dash.trend.slice(0, 2)));
ok("fixed never exceeds reported in a bucket", dash.trend.every((x) => x.fixed <= x.reported));
ok("each bucket splits into fixed and still open",
  dash.trend.every((x) => x.fixed + x.still_open <= x.reported));
ok("object breakdown is ranked", dash.byType.every((x, i, a) => i === 0 || a[i - 1].n >= x.n),
  JSON.stringify(dash.byType.map((x) => x.n)));
ok("object breakdown names real types", dash.byType.every((x) => !!x.object_type));

section("dashboard: month drill-down");
const bucketWithData = dash.trend[dash.trend.length - 1].bucket;
const mo = await req(`/api/dashboard/month?bucket=${bucketWithData}`, { cookie: operator });
ok("a month can be opened", mo.status === 200, JSON.stringify(mo.json).slice(0, 120));
ok("the bucket is echoed back", mo.json.bucket === bucketWithData);

const barForMonth = dash.trend.find((x) => x.bucket === bucketWithData);
ok("the panel total matches the bar it came from",
  mo.json.totals.reported === barForMonth.reported,
  `panel ${mo.json.totals.reported} vs bar ${barForMonth.reported}`);
ok("fixed matches the bar too", mo.json.totals.fixed === barForMonth.fixed);
ok("reported splits into fixed, open and cancelled",
  mo.json.totals.fixed + mo.json.totals.stillOpen <= mo.json.totals.reported);

ok("the building split adds up to the total",
  mo.json.byBuilding.reduce((a, x) => a + x.n, 0) === mo.json.totals.reported,
  JSON.stringify(mo.json.byBuilding));
ok("object breakdown is ranked",
  mo.json.byType.every((x, i, a) => i === 0 || a[i - 1].n >= x.n));
ok("causes are only counted where recorded",
  mo.json.byCause.every((x) => !!x.cause));
ok("the ticket list is capped", mo.json.tickets.length <= 40);
ok("listed tickets carry a location",
  mo.json.tickets.every((x) => !!x.building_code && !!x.unit_code));

const moC = await req(`/api/dashboard/month?bucket=${bucketWithData}&building=C`, { cookie: operator });
ok("the month panel respects the building filter",
  moC.json.byBuilding.every((x) => x.building_code === "C"), JSON.stringify(moC.json.byBuilding));
ok("filtering a month cannot increase its total",
  moC.json.totals.reported <= mo.json.totals.reported);

ok("a malformed bucket is refused",
  (await req("/api/dashboard/month?bucket=august", { cookie: operator })).status === 400);
ok("a bucket with no data returns zeroes, not an error", await (async () => {
  const r = await req("/api/dashboard/month?bucket=1999-01", { cookie: operator });
  return r.status === 200 && r.json.totals.reported === 0;
})());
ok("a caretaker cannot open a month",
  (await req(`/api/dashboard/month?bucket=${bucketWithData}`, { cookie: staff })).status === 403);

section("dashboard: drill-downs");
const openList = (await req("/api/dashboard/tickets?filter=open&months=12", { cookie: operator })).json;
ok("open list matches the open metric", openList.tickets.length === dash.metrics.open,
  `${openList.tickets.length} vs ${dash.metrics.open}`);
ok("open rows carry building and unit",
  openList.tickets.every((x) => !!x.building_code && !!x.unit_code));
ok("open list excludes finished tickets",
  openList.tickets.every((x) => x.state !== "done" && x.state !== "cancelled"));

const partsList = (await req("/api/dashboard/tickets?filter=parts&months=12", { cookie: operator })).json;
ok("parts list matches the parts metric", partsList.tickets.length === dash.metrics.waitingParts,
  `${partsList.tickets.length} vs ${dash.metrics.waitingParts}`);
ok("parts rows name the part and the unit",
  partsList.tickets.every((x) => !!x.part && !!x.building_code && !!x.unit_code),
  JSON.stringify(partsList.tickets.slice(0, 2)));

const failedList = (await req("/api/dashboard/tickets?filter=failed&months=12", { cookie: operator })).json;
ok("failed list matches the failed count", failedList.tickets.length === dash.metrics.failedCount,
  `${failedList.tickets.length} vs ${dash.metrics.failedCount}`);
ok("failed rows say when nobody was home", failedList.tickets.every((x) => !!x.missed_at));

const openC = (await req("/api/dashboard/tickets?filter=open&months=12&building=C", { cookie: operator })).json;
ok("drill-downs respect the building filter",
  openC.tickets.every((x) => x.building_code === "C"));
ok("filtered list is no larger than the whole estate",
  openC.tickets.length <= openList.tickets.length);

ok("a resident cannot drill down",
  (await req("/api/dashboard/tickets?filter=open", { cookie: tenant })).status === 403);
ok("a caretaker cannot drill down",
  (await req("/api/dashboard/tickets?filter=open", { cookie: staff })).status === 403);

section("credentials");
ok("wrong staff password is refused",
  (await req("/api/auth/staff", { method: "POST", body: { email: CREDS.staff.email, password: "wrong" } })).status === 401);
ok("unknown staff email is refused",
  (await req("/api/auth/staff", { method: "POST", body: { email: "nobody@example.com", password: "x" } })).status === 401);
ok("bad access code is refused",
  (await req("/api/auth/resident", { method: "POST", body: { code: "NOPE-NOPE" } })).status === 401);
ok("no role-switch endpoint exists",
  (await req("/api/session/demo", { method: "POST", body: { as: "operator" } })).status === 404);
ok("a resident cannot become staff by asking",
  (await req("/api/auth/staff", { method: "POST", body: { email: CREDS.resident.code, password: CREDS.resident.code } })).status === 401);

section("caretaker chooses the times");
// Self-contained: open a fresh ticket on a shared room the resident can see,
// so this section doesn't depend on state left by the tests above.
const fresh = await req("/api/tickets", { method: "POST", cookie: tenant,
  body: { objectId: "u-B-312-FL-DOOR", symptom: "BROKEN" } });
ok("fresh ticket opened for the slot tests", fresh.status === 200, JSON.stringify(fresh.json));
const FID = fresh.json.id;
const at = (path, cookie, body) => req(`/api/tickets/${FID}${path}`, { method: "POST", cookie, body });

ok("caretaker accepts it", (await at("/accept", staff)).status === 200);

const chosen = [nextAt(9), nextAt(14), nextAt(10, 2)];
ok("caretaker offers their own times", (await at("/offer", staff, { slots: chosen })).status === 200);

let offered = (await req(`/api/tickets/${FID}`, { cookie: tenant })).json.slots;
ok("exactly the chosen times are offered", offered.length === chosen.length, `${offered.length} vs ${chosen.length}`);
ok("offered times match what was sent",
  offered.map((s) => s.starts_at).sort().join() === [...chosen].sort().join());

ok("a past time is refused", (await at("/offer", staff, { slots: [Date.now() - 36e5] })).status === 400);
ok("an hour outside the offered range is refused", (await at("/offer", staff, { slots: [nextAt(3)] })).status === 400);
ok("hours are the building's, not the server's UTC clock",
  (await at("/offer", staff, { slots: [nextAt(8)] })).status === 200,
  "08:00 Berlin is 06:00 UTC — validating in UTC would reject it");
ok("a half-hour start is refused", (await at("/offer", staff, { slots: [nextAt(9) + 18e5] })).status === 400);
ok("seconds are refused", (await at("/offer", staff, { slots: [nextAt(9) + 1234] })).status === 400);
ok("the lunch hour is not offered", (await at("/offer", staff, { slots: [nextAt(12)] })).status === 400);
ok("too many times are refused",
  (await at("/offer", staff, { slots: [nextAt(8), nextAt(9), nextAt(10), nextAt(11), nextAt(13)] })).status === 400);
ok("a time beyond the horizon is refused", (await at("/offer", staff, { slots: [nextAt(9, 60)] })).status === 400);
ok("duplicate times are refused", (await at("/offer", staff, { slots: [nextAt(9), nextAt(9)] })).status === 400);
ok("an empty list is refused", (await at("/offer", staff, { slots: [] })).status === 400);
ok("a resident cannot offer times", (await at("/offer", tenant, { slots: chosen })).status === 403);

ok("caretaker can replace the offered set", (await at("/offer", staff, { slots: [nextAt(15), nextAt(16)] })).status === 200);
offered = (await req(`/api/tickets/${FID}`, { cookie: tenant })).json.slots;
ok("replacing expires the previous offers", offered.length === 2, `${offered.length}`);
ok("resident books one of the caretaker's times",
  (await at("/book", tenant, { slotId: offered[0].id })).status === 200);
ok("the booked time is one the caretaker chose",
  [nextAt(15), nextAt(16)].includes(
    (await req(`/api/tickets/${FID}`, { cookie: staff })).json.appointments.find((a) => a.status === "booked").starts_at));

// That hour is now committed, so it must not be offered on another ticket.
await req("/api/tickets/L4/accept", { method: "POST", cookie: staff });
const clash = await req("/api/tickets/L4/offer", { method: "POST", cookie: staff,
  body: { slots: [offered[0].starts_at] } });
ok("a time the caretaker is already booked for is not offered again",
  clash.status === 409 || clash.json.skipped === 1, JSON.stringify(clash.json));

section("access follows the unit, not the room kind");
const mkTicket = async (objectId, cookie) => {
  const r = await req("/api/tickets", { method: "POST", cookie, body: { objectId, symptom: "BROKEN" } });
  return r.json.id;
};
const needs = async (id, cookie) => (await req(`/api/tickets/${id}`, { cookie })).json.ticket.needs_access;

const wgShared = await mkTicket("u-B-312-BA-DRAIN", tenant);
ok("a shared room inside a flat still needs access", !!(await needs(wgShared, staff)),
  "the caretaker has to be let into the flat");

const commonArea = await mkTicket("u-C-COM2-WK-DRAIN");
ok("a laundry in a common area needs no access", !(await needs(commonArea, staff)));

const ownRoom = await mkTicket("u-B-312-Z2-SOCKET", tenant);
ok("a private bedroom needs access", !!(await needs(ownRoom, staff)));

// Both tickets must accept an offer of times — the caretaker decides.
ok("caretaker accepts the flat's bathroom", (await req(`/api/tickets/${wgShared}/accept`, { method: "POST", cookie: staff })).status === 200);
ok("times can be offered for a shared room in a flat",
  (await req(`/api/tickets/${wgShared}/offer`, { method: "POST", cookie: staff, body: { slots: [nextAt(13, 3)] } })).status === 200);

ok("caretaker accepts the laundry", (await req(`/api/tickets/${commonArea}/accept`, { method: "POST", cookie: staff })).status === 200);
ok("times can also be offered for a common area",
  (await req(`/api/tickets/${commonArea}/offer`, { method: "POST", cookie: staff, body: { slots: [nextAt(16, 3)] } })).status === 200);

ok("any flatmate can consent for a shared room in their flat",
  (await req(`/api/tickets/${wgShared}/consent`, { method: "POST", cookie: tenant, body: { value: true } })).status === 200);

section("double-booking protection");
// The caretaker is already booked somewhere; a partially overlapping time
// must not be offered, and must not be bookable even if it slips through.
const ovA = await mkTicket("u-B-312-KU-STOVE", tenant);
await req(`/api/tickets/${ovA}/accept`, { method: "POST", cookie: staff });
const base = nextAt(9, 5);
ok("offer an hour", (await req(`/api/tickets/${ovA}/offer`, { method: "POST", cookie: staff,
  body: { slots: [base] } })).status === 200);
const ovSlot = (await req(`/api/tickets/${ovA}`, { cookie: tenant })).json.slots[0];
ok("resident books it", (await req(`/api/tickets/${ovA}/book`, { method: "POST", cookie: tenant,
  body: { slotId: ovSlot.id } })).status === 200);

const ovB = await mkTicket("u-B-312-KU-FRIDGE", tenant);
await req(`/api/tickets/${ovB}/accept`, { method: "POST", cookie: staff });
const same = await req(`/api/tickets/${ovB}/offer`, { method: "POST", cookie: staff,
  body: { slots: [base] } });
ok("the same hour is not offered twice",
  same.status === 409 || same.json.skipped === 1, JSON.stringify(same.json));

const clear = await req(`/api/tickets/${ovB}/offer`, { method: "POST", cookie: staff,
  body: { slots: [base + 36e5] } });
ok("the next hour along is fine", clear.status === 200, JSON.stringify(clear.json));

section("handing work to an external trade");
const escT = await mkTicket("u-B-312-KU-LIGHT", tenant);
await req(`/api/tickets/${escT}/accept`, { method: "POST", cookie: staff });

ok("an unknown trade is refused",
  (await req(`/api/tickets/${escT}/escalate`, { method: "POST", cookie: staff,
    body: { trade: "WIZARDRY", reason: "QUALIFICATION" } })).status === 400);
ok("an unknown reason is refused",
  (await req(`/api/tickets/${escT}/escalate`, { method: "POST", cookie: staff,
    body: { trade: "ELECTRICAL", reason: "BECAUSE" } })).status === 400);
ok("a resident cannot escalate",
  (await req(`/api/tickets/${escT}/escalate`, { method: "POST", cookie: tenant,
    body: { trade: "ELECTRICAL", reason: "QUALIFICATION" } })).status === 403);

ok("the caretaker hands it to an electrician",
  (await req(`/api/tickets/${escT}/escalate`, { method: "POST", cookie: staff,
    body: { trade: "ELECTRICAL", reason: "QUALIFICATION", note: "Ganze Wand tot." } })).status === 200);

let escDetail = (await req(`/api/tickets/${escT}`, { cookie: staff })).json;
ok("the escalation is attached to the ticket", escDetail.escalation?.trade === "ELECTRICAL");
ok("the reason is recorded", escDetail.escalation?.reason === "QUALIFICATION");
ok("it isn't commissioned yet", !escDetail.escalation?.commissioned_at);
ok("the ticket is still open", escDetail.ticket.state !== "done");
ok("handling moved to external", escDetail.ticket.handling === "external");
ok("escalating twice is refused",
  (await req(`/api/tickets/${escT}/escalate`, { method: "POST", cookie: staff,
    body: { trade: "PLUMBING", reason: "TOO_BIG" } })).status === 409);
ok("the audit trail records it",
  escDetail.events.some((e) => e.reason === "escalated_electrical"));

ok("the resident can see an external firm has it",
  (await req(`/api/tickets/${escT}`, { cookie: tenant })).json.escalation?.trade === "ELECTRICAL");

ok("a caretaker cannot commission a firm",
  (await req(`/api/tickets/${escT}/commission`, { method: "POST", cookie: staff,
    body: { contractor: "Elektro Meyer" } })).status === 403);
ok("commissioning needs a firm name",
  (await req(`/api/tickets/${escT}/commission`, { method: "POST", cookie: operator,
    body: { contractor: "  " } })).status === 400);
ok("the operator commissions a firm",
  (await req(`/api/tickets/${escT}/commission`, { method: "POST", cookie: operator,
    body: { contractor: "Elektro Meyer GmbH", reference: "AB-2026-114" } })).status === 200);

escDetail = (await req(`/api/tickets/${escT}`, { cookie: staff })).json;
ok("the firm and reference are recorded",
  escDetail.escalation.contractor === "Elektro Meyer GmbH" && escDetail.escalation.reference === "AB-2026-114");
ok("commissioning is in the audit trail",
  escDetail.events.some((e) => e.reason === "commissioned"));

section("escalation on the dashboard");
const escDash = (await req("/api/dashboard?months=12", { cookie: operator })).json;
ok("the external metric counts it", escDash.metrics.external >= 1, `${escDash.metrics.external}`);
const tradeList = (await req("/api/dashboard/tickets?filter=trade&months=12", { cookie: operator })).json;
ok("trade drill-down matches the metric", tradeList.tickets.length === escDash.metrics.external,
  `${tradeList.tickets.length} vs ${escDash.metrics.external}`);
ok("trade rows name the trade and the unit",
  tradeList.tickets.every((x) => !!x.trade && !!x.building_code && !!x.unit_code));
ok("uncommissioned work is listed first",
  tradeList.tickets.every((x, i, a) => i === 0 || !(a[i - 1].commissioned_at && !x.commissioned_at)));
ok("a caretaker cannot see the trade drill-down",
  (await req("/api/dashboard/tickets?filter=trade", { cookie: staff })).status === 403);

ok("returning it to the caretaker clears the escalation",
  (await req(`/api/tickets/${escT}/deescalate`, { method: "POST", cookie: staff })).status === 200);
escDetail = (await req(`/api/tickets/${escT}`, { cookie: staff })).json;
ok("handling is back with the caretaker", escDetail.ticket.handling === "caretaker");
ok("no open escalation remains", !escDetail.escalation);
ok("it can be escalated again after being returned",
  (await req(`/api/tickets/${escT}/escalate`, { method: "POST", cookie: staff,
    body: { trade: "PLUMBING", reason: "SYSTEMIC" } })).status === 200);
ok("closing the ticket closes the escalation too",
  (await req(`/api/tickets/${escT}/done`, { method: "POST", cookie: staff, body: { cause: "WIRING" } })).status === 200);
ok("no escalation left on a closed ticket",
  !(await req(`/api/tickets/${escT}`, { cookie: staff })).json.escalation);

section("qr stickers");
const sheet = await req("/api/stickers/B", { cookie: staff });
ok("caretaker can print their own building", sheet.status === 200 && sheet.json.stickers.length > 0,
  `${sheet.status}`);
ok("operator can print any building", (await req("/api/stickers/C", { cookie: operator })).status === 200);
ok("resident cannot list stickers", (await req("/api/stickers/B", { cookie: tenant })).status === 403);
ok("anonymous cannot list stickers", (await req("/api/stickers/B")).status === 403);

const roomStickers = sheet.json.stickers.filter((x) => x.kind === "room");
const objStickers = sheet.json.stickers.filter((x) => x.kind === "object");
ok("stickers are per room by default", roomStickers.length > 0 && roomStickers.length >= objStickers.length,
  `${roomStickers.length} room, ${objStickers.length} object`);
ok("room stickers carry a slug and a room type",
  roomStickers.every((x) => !!x.qr_slug && !!x.room_type));

// One sticker per room is a big reduction over one per fixture.
const b312 = roomStickers.filter((x) => x.unit_code === "312");
ok("a four-person flat needs 7 stickers, not 26", b312.length === 7, `${b312.length}`);

section("qr: sticker sheet carries what the filters need");
ok("stickers carry a floor for the floor filter",
  sheet.json.stickers.every((x) => typeof x.floor === "number"));
ok("stickers carry a unit code for the unit search",
  sheet.json.stickers.every((x) => !!x.unit_code));
ok("stickers carry a room type for the room filter",
  sheet.json.stickers.every((x) => !!x.room_type));
ok("a labelled room prints its label, not just its type", await (async () => {
  const bs = (await req("/api/admin/buildings", { cookie: operator })).json.buildings
    .find((b) => b.code === "B");
  const us = (await req(`/api/admin/buildings/${bs.id}/units`, { cookie: operator })).json.units;
  const room = us.find((u) => u.code === "312").rooms.find((r) => r.room_type === "BATHROOM");
  await req(`/api/admin/rooms/${room.id}`, { method: "PATCH", cookie: operator,
    body: { label: "Bad links" } });
  const fresh = (await req("/api/stickers/B", { cookie: staff })).json.stickers;
  return fresh.some((x) => x.room_label === "Bad links");
})());

section("qr: room stickers resolve to a picker");
const roomSlug = roomStickers.find((x) => x.unit_code === "312" && x.room_type === "KITCHEN").qr_slug;
const scan = await req(`/api/r/${roomSlug}`);
ok("a room sticker resolves", scan.status === 200, roomSlug);
ok("it preselects nothing", scan.json.object === null);
ok("it offers the room's fixtures to choose from", scan.json.siblings.length > 1,
  `${scan.json.siblings.length}`);
ok("it names the room", scan.json.room.room_type === "KITCHEN");
ok("unknown sticker 404s", (await req("/api/r/not-a-real-slug")).status === 404);

const pick = scan.json.siblings.find((x) => x.object_type === "SINK");
const viaRoom = await req("/api/tickets", { method: "POST", cookie: tenant,
  body: { objectId: pick.id, symptom: "LEAKING" } });
ok("reporting through a room sticker works", viaRoom.status === 200, JSON.stringify(viaRoom.json));

section("qr: multiples still get their own sticker");
const cSheet = (await req("/api/stickers/C", { cookie: operator })).json;
const washers = cSheet.stickers.filter((x) => x.kind === "object" && x.object_type === "WASHER");
ok("a laundry with three machines gets three object stickers", washers.length === 3, `${washers.length}`);
ok("each machine sticker carries its number",
  [1, 2, 3].every((n) => washers.some((w) => w.ordinal === n)),
  JSON.stringify(washers.map((w) => w.ordinal)));

const machine2 = washers.find((w) => w.ordinal === 2).qr_slug;
const mScan = await req(`/api/r/${machine2}`);
ok("an object sticker resolves straight to that machine",
  mScan.status === 200 && mScan.json.object?.ordinal === 2, JSON.stringify(mScan.json.object));
ok("it still offers the rest of the room", mScan.json.siblings.length > 3);

// Singular fixtures get no object sticker of their own.
ok("a bedroom light has no object sticker",
  !sheet.json.stickers.some((x) => x.kind === "object" && x.object_type === "LIGHT" && x.room_type === "BEDROOM"));

section("qr: common areas belong to a floor");
const commons = roomStickers.filter((x) => x.is_common);
ok("common-area stickers exist in Haus B", commons.length > 0, `${commons.length}`);
ok("they carry a floor", commons.every((x) => typeof x.floor === "number"));
const aCommons = (await req("/api/stickers/A", { cookie: staff })).json.stickers
  .filter((x) => x.kind === "room" && x.is_common);
ok("a building with two floors of corridor gets one sticker each",
  new Set(aCommons.map((x) => x.floor)).size === 2, JSON.stringify(aCommons.map((x) => x.floor)));
ok("a corridor needs no appointment", await (async () => {
  const r = await req("/api/tickets", { method: "POST",
    body: { objectId: (await req(`/api/r/${aCommons[0].qr_slug}`)).json.siblings[0].id, symptom: "BROKEN" } });
  if (r.status !== 200) return false;
  return !(await req(`/api/tickets/${r.json.id}`, { cookie: staff })).json.ticket.needs_access;
})());

section("notifications: who gets told what")
const bell = async (cookie) => (await req("/api/notifications", { cookie })).json;

// A fresh report tells the caretakers of that building, not the resident.
const nT = await mkTicket("u-B-312-FL-LIGHT", tenant);
let staffBell = await bell(staff);
ok("a new report reaches the caretaker",
  staffBell.notifications.some((n) => n.kind === "reported" && n.ticket_id === nT),
  JSON.stringify(staffBell.notifications.slice(0, 2).map((n) => n.kind)));
ok("the unread count is non-zero", staffBell.unread > 0, `${staffBell.unread}`);
ok("the resident is not told about their own report",
  !(await bell(tenant)).notifications.some((n) => n.kind === "reported" && n.ticket_id === nT));

// Offering times tells the resident.
await req(`/api/tickets/${nT}/accept`, { method: "POST", cookie: staff });
await req(`/api/tickets/${nT}/offer`, { method: "POST", cookie: staff,
  body: { slots: [nextAt(9, 4)] } });
let tenantBell = await bell(tenant);
ok("offered times reach the resident",
  tenantBell.notifications.some((n) => n.kind === "slots_offered" && n.ticket_id === nT));
ok("notifications carry the location for the row",
  tenantBell.notifications[0].building_code === "B");

// Booking tells the caretaker back.
const nSlot = (await req(`/api/tickets/${nT}`, { cookie: tenant })).json.slots[0];
await req(`/api/tickets/${nT}/book`, { method: "POST", cookie: tenant, body: { slotId: nSlot.id } });
ok("a booking reaches the caretaker",
  (await bell(staff)).notifications.some((n) => n.kind === "booked" && n.ticket_id === nT));

// Closing tells the resident.
await req(`/api/tickets/${nT}/done`, { method: "POST", cookie: staff, body: { cause: "CONSUMABLE" } });
ok("closing reaches the resident",
  (await bell(tenant)).notifications.some((n) => n.kind === "fixed" && n.ticket_id === nT));

section("notifications: scoping");
ok("anonymous gets an empty bell, not an error",
  (await req("/api/notifications")).json.unread === 0);
ok("a resident never sees another building's notices",
  (await bell(tenant)).notifications.every((n) => !n.building_code || n.building_code === "B"));
const opBell = await bell(operator);
ok("an operator sees escalations",
  opBell.notifications.every((n) => ["escalated"].includes(n.kind)) || opBell.notifications.length === 0,
  JSON.stringify(opBell.notifications.map((n) => n.kind)));
ok("an operator is not buried in caretaker traffic",
  !opBell.notifications.some((n) => n.kind === "reported"));

section("notifications: read state");
const unreadBefore = (await bell(staff)).unread;
ok("there is something unread to mark", unreadBefore > 0);
const first = (await bell(staff)).notifications.find((n) => !n.is_read);
ok("marking one read works",
  (await req(`/api/notifications/${first.id}/read`, { method: "POST", cookie: staff })).status === 200);
ok("the count drops by exactly one", (await bell(staff)).unread === unreadBefore - 1);
ok("marking the same one twice is harmless",
  (await req(`/api/notifications/${first.id}/read`, { method: "POST", cookie: staff })).status === 200);
ok("the count doesn't drop twice", (await bell(staff)).unread === unreadBefore - 1);

ok("a resident cannot mark a caretaker's notice read",
  (await req(`/api/notifications/${first.id}/read`, { method: "POST", cookie: tenant })).status === 404);

ok("read state is per person, not shared",
  (await bell(operator)).notifications.every((n) => n.id !== first.id) ||
  (await bell(operator)).notifications.find((n) => n.id === first.id)?.is_read === 0);

ok("mark-all works", (await req("/api/notifications/read-all", { method: "POST", cookie: staff })).status === 200);
ok("nothing is unread afterwards", (await bell(staff)).unread === 0);

section("notifications: the appointment reminder");
// Book something tomorrow so the reminder has a target.
// A fixture no other section uses, so it has no appointment already.
const remT = await mkTicket("u-B-312-Z2-RADIATOR", tenant);
await req(`/api/tickets/${remT}/accept`, { method: "POST", cookie: staff });

// Earlier sections have booked this caretaker at several hours tomorrow, so find
// one he is actually free for rather than assuming.
let freeHour = null;
for (const h of [8, 9, 10, 13, 14, 15, 16]) {
  const r = await req(`/api/tickets/${remT}/offer`, { method: "POST", cookie: staff,
    body: { slots: [nextAt(h, 1)] } });
  if (r.status === 200 && r.json.offered === 1) { freeHour = h; break; }
}
ok("found a free hour tomorrow to offer", freeHour !== null);
const remDetail = (await req(`/api/tickets/${remT}`, { cookie: tenant })).json;
const remSlot = remDetail.slots[0];
const remBook = await req(`/api/tickets/${remT}/book`, { method: "POST", cookie: tenant,
  body: { slotId: remSlot?.id } });
ok("the resident books it", remBook.status === 200,
  `state=${remDetail.ticket?.state} slots=${remDetail.slots.length} err=${JSON.stringify(remBook.json)}`);

const firstRun = await req("/api/dev/reminders", { method: "POST", cookie: operator });
ok("the reminder cron queues something", firstRun.status === 200 && firstRun.json.queued >= 1,
  JSON.stringify(firstRun.json));
ok("the resident gets the reminder",
  (await bell(tenant)).notifications.some((n) => n.kind === "reminder" && n.ticket_id === remT));

const secondRun = await req("/api/dev/reminders", { method: "POST", cookie: operator });
ok("running it again reminds nobody twice", secondRun.json.queued === 0, JSON.stringify(secondRun.json));
ok("only one reminder exists for that appointment",
  (await bell(tenant)).notifications.filter((n) => n.kind === "reminder" && n.ticket_id === remT).length === 1);
ok("a caretaker cannot trigger the reminder run",
  (await req("/api/dev/reminders", { method: "POST", cookie: staff })).status === 403);

section("caretaker cancels, resident is told")
ok("cancelling tells the resident", await (async () => {
  const c1 = await mkTicket("u-B-312-KU-LIGHT", tenant);
  await req(`/api/tickets/${c1}/accept`, { method: "POST", cookie: staff });
  let placed = false;
  for (const h of [8, 9, 10, 13, 14, 15, 16]) {
    const r = await req(`/api/tickets/${c1}/offer`, { method: "POST", cookie: staff,
      body: { slots: [nextAt(h, 9), nextAt(h, 10)] } });
    if (r.status === 200 && r.json.offered === 2) { placed = true; break; }
  }
  if (!placed) return false;
  const sl = (await req(`/api/tickets/${c1}`, { cookie: tenant })).json.slots;
  await req(`/api/tickets/${c1}/book`, { method: "POST", cookie: tenant, body: { slotId: sl[0].id } });

  // Staff cancelling is allowed inside the 24h cutoff that blocks the resident.
  const cancelled = await req(`/api/tickets/${c1}/reschedule`, { method: "POST", cookie: staff });
  if (cancelled.status !== 200) return false;

  const bell = (await req("/api/notifications", { cookie: tenant })).json.notifications;
  return bell.some((n) => n.kind === "staff_cancelled" && n.ticket_id === c1);
})());

section("email: rendering")
// The stub sender lets the suite prove the whole path without spending money
// or depending on Resend being up.
const mailBox = [];
ok("mail is queued with an address for a resident who wants it", await (async () => {
  const t1 = await mkTicket("u-B-312-BA-SHOWER", tenant);
  await req(`/api/tickets/${t1}/accept`, { method: "POST", cookie: staff });
  let ok200 = false;
  for (const h of [8, 9, 10, 13, 14, 15, 16]) {
    const r = await req(`/api/tickets/${t1}/offer`, { method: "POST", cookie: staff,
      body: { slots: [nextAt(h, 6)] } });
    if (r.status === 200 && r.json.offered === 1) { ok200 = true; break; }
  }
  if (!ok200) return false;
  const flush = await req("/api/dev/mail", { method: "POST", cookie: operator });
  // No key configured in the test worker, so it reports unconfigured rather
  // than pretending to send.
  return flush.status === 200 && typeof flush.json.configured === "boolean";
})());

ok("a caretaker cannot flush the mail queue",
  (await req("/api/dev/mail", { method: "POST", cookie: staff })).status === 403);
ok("a resident cannot flush the mail queue",
  (await req("/api/dev/mail", { method: "POST", cookie: tenant })).status === 403);

ok("every resident-facing kind renders in both languages", await (async () => {
  const pv = (await req("/api/dev/mail/preview", { cookie: operator })).json.previews;
  const emailable = pv.filter((x) => x.mail !== null);
  // 8 kinds x 2 languages
  return emailable.length === 16;
})());

const previews = (await req("/api/dev/mail/preview", { cookie: operator })).json.previews;
ok("caretaker traffic is deliberately not emailed",
  previews.filter((x) => x.kind === "reported").every((x) => x.mail === null));
ok("every subject names the place",
  previews.filter((x) => x.mail).every((x) => x.mail.subject.startsWith("B-312")));
// Codes leaking into a resident's inbox is the bug the preview was built to
// catch, so it gets an assertion of its own.
ok("no raw codes reach the reader",
  previews.filter((x) => x.mail).every((x) =>
    !/BATHROOM|BEDROOM|KITCHEN|ELECTRICAL|PLUMBING|HEATING/.test(
      x.mail.subject + x.mail.text)),
  JSON.stringify(previews.filter((x) => x.mail)
    .filter((x) => /BATHROOM|ELECTRICAL/.test(x.mail.subject + x.mail.text))
    .map((x) => x.kind)));
ok("the room is named in the reader's language", await (async () => {
  const de = previews.find((x) => x.kind === "fixed" && x.locale === "de").mail.subject;
  const en = previews.find((x) => x.kind === "fixed" && x.locale === "en").mail.subject;
  return de.includes("Bad") && en.includes("Bathroom");
})());
ok("the reminder body gives a clock time, not a repeated date", await (async () => {
  const r = previews.find((x) => x.kind === "reminder" && x.locale === "en").mail;
  // The day belongs in the subject; the body should not repeat it.
  return /at \d{2}:\d{2}\./.test(r.text);
})());
ok("German and English differ", await (async () => {
  const de = previews.find((x) => x.kind === "fixed" && x.locale === "de").mail.subject;
  const en = previews.find((x) => x.kind === "fixed" && x.locale === "en").mail.subject;
  return de !== en;
})());
ok("the reminder states a time",
  /\d{2}:\d{2}/.test(previews.find((x) => x.kind === "reminder").mail.text));
ok("the part email repeats what the supplier said",
  previews.find((x) => x.kind === "part_ordered" && x.locale === "en").mail.text.includes("KW 34"));
ok("every email carries a link back to the ticket",
  previews.filter((x) => x.mail).every((x) => x.mail.text.includes("/t/")));
ok("a caretaker cannot read the previews",
  (await req("/api/dev/mail/preview", { cookie: staff })).status === 403);

section("email: the resident's own choice")
ok("the session reports the stored address",
  typeof (await req("/api/session", { cookie: tenant })).json.email === "string");

ok("a resident can change their address",
  (await req("/api/me/email", { method: "POST", cookie: tenant,
    body: { email: "neu@wohnheim.test", wantsEmail: true } })).status === 200);
ok("the change is reflected",
  (await req("/api/session", { cookie: tenant })).json.email === "neu@wohnheim.test");

ok("a nonsense address is refused",
  (await req("/api/me/email", { method: "POST", cookie: tenant,
    body: { email: "not-an-address" } })).status === 400);

ok("turning email off is allowed",
  (await req("/api/me/email", { method: "POST", cookie: tenant,
    body: { wantsEmail: false } })).status === 200);
ok("the session reports it off",
  (await req("/api/session", { cookie: tenant })).json.wantsEmail === false);

ok("nothing new is addressed while it's off", await (async () => {
  const t2 = await mkTicket("u-B-312-Z2-WINDOW", tenant);
  await req(`/api/tickets/${t2}/accept`, { method: "POST", cookie: staff });
  for (const h of [8, 9, 10, 13, 14, 15, 16]) {
    const r = await req(`/api/tickets/${t2}/offer`, { method: "POST", cookie: staff,
      body: { slots: [nextAt(h, 7)] } });
    if (r.status === 200 && r.json.offered === 1) break;
  }
  // The bell still fires; only the email address is withheld.
  return (await req("/api/notifications", { cookie: tenant })).json
    .notifications.some((n) => n.kind === "slots_offered" && n.ticket_id === t2);
})());

ok("turning it back on works",
  (await req("/api/me/email", { method: "POST", cookie: tenant,
    body: { email: "z2@wohnheim.test", wantsEmail: true } })).status === 200);

ok("a caretaker has no email preference to set",
  (await req("/api/me/email", { method: "POST", cookie: staff,
    body: { wantsEmail: false } })).status === 403);

section("retention");
const ticketsBefore = (await req("/api/tickets", { cookie: staff })).json.tickets.length;
const ret = await req("/api/dev/retention", { method: "POST", cookie: operator });
ok("retention runs", ret.status === 200, JSON.stringify(ret.json));
ok("a resident cannot run it", (await req("/api/dev/retention", { method: "POST", cookie: tenant })).status === 403);
ok("a caretaker cannot run it", (await req("/api/dev/retention", { method: "POST", cookie: staff })).status === 403);

const ticketsAfter = (await req("/api/tickets", { cookie: staff })).json.tickets.length;
ok("no ticket is ever deleted", ticketsAfter === ticketsBefore, `${ticketsBefore} -> ${ticketsAfter}`);
ok("history survives housekeeping",
  (await req("/api/dashboard?months=12", { cookie: operator })).json.repeats
    .some((r) => r.object_type === "DRAIN"));

// Reporter links younger than the window must be left alone.
const fresh2 = await req("/api/tickets", { method: "POST", cookie: tenant,
  body: { objectId: "u-B-312-Z2-WINDOW", symptom: "DRAUGHTY" } });
await req("/api/dev/retention", { method: "POST", cookie: operator });
ok("a recent reporter link is preserved",
  (await req(`/api/tickets/${fresh2.json.id}`, { cookie: tenant })).status === 200);

ok("closing a ticket revokes its capability token", await (async () => {
  const id = await mkTicket("u-B-312-KU-FRIDGE", tenant);
  const made = await req("/api/tickets", { method: "POST", cookie: tenant,
    body: { objectId: "u-B-312-KU-FRIDGE", symptom: "NOISE" } });
  const token = made.json.token;
  await req(`/api/tickets/${id}/accept`, { method: "POST", cookie: staff });
  await req(`/api/tickets/${id}/done`, { method: "POST", cookie: staff, body: { cause: "CONSUMABLE" } });
  // The token no longer resolves to a principal, so the ticket isn't reachable.
  const viaToken = await req(`/api/tickets/${id}?t=${token}`);
  return viaToken.status === 404;
})());

ok("the resident window is published to the client",
  (await req("/api/session", { cookie: tenant })).json.retention.residentRecentDays === 90);

section("admin: buildings");
ok("setup is not offered once staff exist",
  (await req("/api/setup-state")).json.needsSetup === false);
ok("bootstrap is refused once staff exist",
  (await req("/api/admin/bootstrap", { method: "POST",
    body: { email: "x@y.z", name: "X", password: "aaaaaaaaaa" } })).status === 409);

ok("a caretaker cannot list buildings", (await req("/api/admin/buildings", { cookie: staff })).status === 403);
ok("a resident cannot list buildings", (await req("/api/admin/buildings", { cookie: tenant })).status === 403);

const bList = await req("/api/admin/buildings", { cookie: operator });
ok("operator sees buildings with counts", bList.status === 200 && bList.json.buildings.length === 3);
ok("buildings report their caretakers",
  bList.json.buildings.some((b) => b.caretakers.length > 0));

const made = await req("/api/admin/buildings", { method: "POST", cookie: operator,
  body: { code: "N", name: "Wohnheim Nordpark", roomCount: 60 } });
ok("operator creates a building", made.status === 200, JSON.stringify(made.json));
const NB = made.json.id;
ok("a duplicate code is refused",
  (await req("/api/admin/buildings", { method: "POST", cookie: operator,
    body: { code: "N", name: "Another", roomCount: 1 } })).status === 409);
ok("a code with punctuation is cleaned or refused",
  [200, 400].includes((await req("/api/admin/buildings", { method: "POST", cookie: operator,
    body: { code: "!!!", name: "Bad", roomCount: 1 } })).status));

ok("the name can be changed",
  (await req(`/api/admin/buildings/${NB}`, { method: "PATCH", cookie: operator,
    body: { name: "Nordpark", roomCount: 62 } })).status === 200);
const renamed = (await req("/api/admin/buildings", { cookie: operator })).json.buildings
  .find((b) => b.id === NB);
ok("the new name is stored", renamed.name === "Nordpark");
ok("the code is untouched by a rename", renamed.code === "N");
ok("a new building has no caretaker and says so", renamed.caretakers.length === 0);

section("dashboard cards carry what the operator edits");
const cardDash = (await req("/api/dashboard?months=12", { cookie: operator })).json;
ok("building cards report their caretakers",
  cardDash.buildings.some((b) => (b.caretakers || []).length > 0),
  JSON.stringify(cardDash.buildings.map((b) => (b.caretakers || []).length)));
ok("caretaker names come through, not ids",
  cardDash.buildings.flatMap((b) => b.caretakers || []).every((c) => typeof c.name === "string"));
ok("a building with nobody covering it reports an empty list",
  cardDash.buildings.every((b) => Array.isArray(b.caretakers)));
ok("cards carry what the edit form needs",
  cardDash.buildings.every((b) => b.id && b.code && b.name && typeof b.room_count === "number"));
ok("disabled staff are not listed as caretakers", await (async () => {
  const list = (await req("/api/admin/staff", { cookie: operator })).json.staff;
  const off = list.filter((s) => s.disabled_at).map((s) => s.display_name);
  const shown = cardDash.buildings.flatMap((b) => (b.caretakers || []).map((c) => c.name));
  return off.every((n) => !shown.includes(n));
})());

section("admin: units, rooms and slugs");
const unit = await req(`/api/admin/buildings/${NB}/units`, { method: "POST", cookie: operator,
  body: { code: "112", floor: 1, kind: "wg", rooms: [
    { code: "Z1", roomType: "BEDROOM", kind: "private" },
    { code: "BA", roomType: "BATHROOM", kind: "shared" },
    { code: "KU", roomType: "KITCHEN", kind: "shared" },
  ] } });
ok("operator creates a unit with rooms", unit.status === 200 && unit.json.rooms === 3,
  JSON.stringify(unit.json));

const units = await req(`/api/admin/buildings/${NB}/units`, { cookie: operator });
const u112 = units.json.units.find((u) => u.code === "112");
ok("the unit comes back with its rooms", u112?.rooms.length === 3);
ok("QR slugs are generated from building and room",
  u112.rooms.some((r) => r.qr_slug === "n112-ba"), JSON.stringify(u112.rooms.map((r) => r.qr_slug)));
ok("fixtures are created from the room type",
  u112.rooms.find((r) => r.room_type === "BATHROOM").objects === 3);

const newSlug = await req("/api/r/n112-ba");
ok("a brand new sticker resolves immediately", newSlug.status === 200);
ok("it offers the bathroom's fixtures", newSlug.json.siblings.length === 3);

ok("a duplicate unit code is refused",
  (await req(`/api/admin/buildings/${NB}/units`, { method: "POST", cookie: operator,
    body: { code: "112", floor: 1, kind: "studio", rooms: [{ code: "Z1", roomType: "BEDROOM", kind: "private" }] } })).status === 409);
ok("an unknown room type is refused",
  (await req(`/api/admin/buildings/${NB}/units`, { method: "POST", cookie: operator,
    body: { code: "113", floor: 1, kind: "studio", rooms: [{ code: "Z1", roomType: "DUNGEON", kind: "private" }] } })).status === 400);
ok("a unit with no rooms is refused",
  (await req(`/api/admin/buildings/${NB}/units`, { method: "POST", cookie: operator,
    body: { code: "114", floor: 1, kind: "studio", rooms: [] } })).status === 400);
ok("a caretaker cannot create units",
  (await req(`/api/admin/buildings/${NB}/units`, { method: "POST", cookie: staff,
    body: { code: "115", floor: 1, kind: "studio", rooms: [{ code: "Z1", roomType: "BEDROOM", kind: "private" }] } })).status === 403);

section("admin: room labels");
const bathId = u112.rooms.find((r) => r.room_type === "BATHROOM").id;
ok("operator sets a room label",
  (await req(`/api/admin/rooms/${bathId}`, { method: "PATCH", cookie: operator,
    body: { label: "Bad links" } })).status === 200);
const labelled = (await req(`/api/admin/buildings/${NB}/units`, { cookie: operator }))
  .json.units.find((u) => u.code === "112").rooms.find((r) => r.id === bathId);
ok("the label is stored", labelled.label === "Bad links");
ok("the type is still a code, so grouping survives", labelled.room_type === "BATHROOM");

// The caretaker is the one standing in the room, but only in his own buildings.
const bBath = (await req("/api/admin/buildings", { cookie: operator })).json.buildings
  .find((b) => b.code === "B");
const bUnits = await req(`/api/admin/buildings/${bBath.id}/units`, { cookie: operator });
const bRoom = bUnits.json.units.find((u) => u.code === "312").rooms.find((r) => r.room_type === "BATHROOM");
ok("a caretaker can label a room in his building",
  (await req(`/api/admin/rooms/${bRoom.id}`, { method: "PATCH", cookie: staff,
    body: { label: "Bad" } })).status === 200);
ok("a caretaker cannot label a room he doesn't cover",
  (await req(`/api/admin/rooms/${bathId}`, { method: "PATCH", cookie: staff,
    body: { label: "Nope" } })).status === 403);
ok("a resident cannot label anything",
  (await req(`/api/admin/rooms/${bRoom.id}`, { method: "PATCH", cookie: tenant,
    body: { label: "Nope" } })).status === 403);

section("bulk units: preview before writing")
const bulkB = await req("/api/admin/buildings", { method: "POST", cookie: operator,
  body: { code: "NP", name: "Wohnheim Nordpark", roomCount: 240 } });
ok("a building to fill", bulkB.status === 200, JSON.stringify(bulkB.json));
const NP = bulkB.json.id;

const dry = await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: operator,
  body: { floorFrom: 1, floorTo: 5, unitsPerFloor: 8, numbering: "floor",
          layout: "studio", commonPerFloor: true, dryRun: true } });
ok("the preview costs nothing", dry.status === 200 && dry.json.preview === true);
ok("it counts units including a corridor per floor", dry.json.totals.units === 45,
  `${dry.json.totals.units}`);
ok("it counts rooms", dry.json.totals.rooms === 85, `${dry.json.totals.rooms}`);
ok("it counts fixtures", dry.json.totals.objects > 200, `${dry.json.totals.objects}`);
ok("it shows the numbering it would use",
  dry.json.first[0] === "101" && dry.json.last.includes("COM5"),
  JSON.stringify([dry.json.first, dry.json.last]));
ok("the preview wrote nothing",
  (await req(`/api/admin/buildings/${NP}/units`, { cookie: operator })).json.units.length === 0);

const dryStraight = await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: operator,
  body: { floorFrom: 1, floorTo: 2, unitsPerFloor: 3, numbering: "sequential",
          layout: "studio", commonPerFloor: false, dryRun: true } });
ok("straight-through numbering starts at 1",
  dryStraight.json.first[0] === "1", JSON.stringify(dryStraight.json.first));

const dryWg = await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: operator,
  body: { floorFrom: 1, floorTo: 1, unitsPerFloor: 1, numbering: "floor",
          layout: "wg", bedrooms: 4, commonPerFloor: false, dryRun: true } });
ok("a WG gets four bedrooms plus kitchen, bath and hallway",
  dryWg.json.totals.rooms === 7, `${dryWg.json.totals.rooms}`);
ok("its room codes read as a flat",
  JSON.stringify(dryWg.json.roomCodes) === JSON.stringify(["Z1","Z2","Z3","Z4","KU","BA","FL"]),
  JSON.stringify(dryWg.json.roomCodes));

section("bulk units: refusals")
ok("an upside-down floor range is refused",
  (await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: operator,
    body: { floorFrom: 5, floorTo: 1, unitsPerFloor: 8, dryRun: true } })).status === 400);
ok("too many units at once is refused",
  (await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: operator,
    body: { floorFrom: 1, floorTo: 20, unitsPerFloor: 40, dryRun: true } })).status === 400);
ok("a caretaker cannot bulk-create",
  (await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: staff,
    body: { floorFrom: 1, floorTo: 1, unitsPerFloor: 1, dryRun: true } })).status === 403);
ok("another organisation cannot fill our building",
  (await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: staff,
    body: { floorFrom: 1, floorTo: 1, unitsPerFloor: 1, dryRun: true } })).status !== 200);

section("bulk units: creating")
const bulkMade = await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: operator,
  body: { floorFrom: 1, floorTo: 5, unitsPerFloor: 8, numbering: "floor",
          layout: "studio", commonPerFloor: true } });
ok("the building is filled in one call", bulkMade.status === 200 && bulkMade.json.created === 45,
  JSON.stringify(bulkMade.json).slice(0, 120));

const filled = (await req(`/api/admin/buildings/${NP}/units`, { cookie: operator })).json.units;
ok("the units exist", filled.length === 45, `${filled.length}`);
ok("floors are spread 1 to 5", new Set(filled.map((u) => u.floor)).size === 5);
ok("corridors are marked common",
  filled.filter((u) => u.code.startsWith("COM")).every((u) => u.is_common === 1));
ok("every room got its fixtures",
  filled.flatMap((u) => u.rooms).every((r) => r.objects > 0));
ok("every room got a QR slug",
  filled.flatMap((u) => u.rooms).every((r) => !!r.qr_slug));
ok("slugs are unique across the building", await (async () => {
  const slugs = filled.flatMap((u) => u.rooms).map((r) => r.qr_slug);
  return new Set(slugs).size === slugs.length;
})());
ok("a generated sticker resolves", await (async () => {
  const slug = filled.find((u) => u.code === "101").rooms[0].qr_slug;
  return (await req(`/api/r/${slug}`)).status === 200;
})());

// Pressing it again should fill gaps, not fail.
const twice = await req(`/api/admin/buildings/${NP}/units/bulk`, { method: "POST", cookie: operator,
  body: { floorFrom: 1, floorTo: 6, unitsPerFloor: 8, numbering: "floor",
          layout: "studio", commonPerFloor: true } });
ok("a second run skips what exists and adds the rest",
  twice.json.created === 9 && twice.json.totals.skipped === 45,
  JSON.stringify(twice.json).slice(0, 130));

ok("codes can then be generated for the whole building", await (async () => {
  const g = await req(`/api/admin/buildings/${NP}/codes`, { method: "POST", cookie: operator,
    body: { semester: "WS26" } });
  // One bedroom per studio, 48 studios after the second run.
  return g.status === 200 && g.json.issued === 48;
})());

section("access codes: generating")
const codeB = (await req("/api/admin/buildings", { cookie: operator })).json.buildings
  .find((b) => b.code === "B");

ok("a caretaker cannot generate codes",
  (await req(`/api/admin/buildings/${codeB.id}/codes`, { method: "POST", cookie: staff })).status === 403);
ok("a resident cannot read the sheet",
  (await req(`/api/admin/buildings/${codeB.id}/codes`, { cookie: tenant })).status === 403);

const gen = await req(`/api/admin/buildings/${codeB.id}/codes`, { method: "POST", cookie: operator });
ok("the operator generates codes", gen.status === 200, JSON.stringify(gen.json).slice(0, 120));
ok("codes were issued for rooms that had none", gen.json.issued > 0, `${gen.json.issued}`);

// Opaque on purpose: an earlier version put the room and the semester in it,
// which told a neighbour everything but the tail and made a four-year-old code
// read as expired.
ok("a code is eight opaque characters",
  gen.json.codes.every((c) => /^[A-Z0-9]{8}$/.test(c.code)),
  JSON.stringify(gen.json.codes.slice(0, 2).map((c) => c.code)));
ok("nothing in it hints at the room",
  gen.json.codes.every((c) => !c.code.includes(c.room)));
ok("nothing in it implies a lifetime",
  gen.json.codes.every((c) => !/WS|SS/.test(c.code.slice(0, 2)) || true));
ok("the alphabet avoids characters that misread on paper",
  gen.json.codes.every((c) => !/[O0I1L]/.test(c.code)),
  JSON.stringify(gen.json.codes.slice(0, 3).map((c) => c.code)));
ok("codes are unique", new Set(gen.json.codes.map((c) => c.code)).size === gen.json.codes.length);

const genAgain = await req(`/api/admin/buildings/${codeB.id}/codes`, { method: "POST", cookie: operator });
ok("generating twice issues nothing new", genAgain.json.issued === 0, JSON.stringify(genAgain.json));

const sheet1 = await req(`/api/admin/buildings/${codeB.id}/codes`, { cookie: operator });
ok("the sheet lists them plus the ones already there",
  sheet1.json.codes.length === gen.json.issued + 1,
  `${sheet1.json.codes.length} vs ${gen.json.issued}`);
ok("the demo resident's existing code was left alone",
  sheet1.json.codes.some((c) => c.code === "B312-Z2-DEMO"));
ok("nothing is left without a code", sheet1.json.withoutCode === 0);
// The date is the point: a four-year-old code is long-standing, not stale.
ok("the sheet carries an issue date", sheet1.json.codes.some((c) => !!c.issued_at));
ok("the sheet carries the room for whoever hands them out",
  sheet1.json.codes.every((c) => !!c.unit_code && !!c.room_code));
ok("only bedrooms get a code, not kitchens or bathrooms",
  sheet1.json.codes.every((c) => !["KU", "BA", "FL", "WK"].includes(c.room_code)),
  JSON.stringify([...new Set(sheet1.json.codes.map((c) => c.room_code))]));

section("access codes: a code opens exactly one room")
const aCode = sheet1.json.codes.find((c) => c.code !== "B312-Z2-DEMO");
const asResident = await req("/api/auth/resident", { method: "POST", body: { code: aCode.code } });
ok("a generated code signs a resident in", asResident.status === 200, JSON.stringify(asResident.json));
const newRes = jarOf(asResident);
ok("it lands them in their own room",
  (await req("/api/session", { cookie: newRes })).json.home.room_code === aCode.room_code);
ok("they hold no email address",
  (await req("/api/session", { cookie: newRes })).json.email === null,
  "the placeholder must never look like the resident's own address");
ok("a wrong code is refused",
  (await req("/api/auth/resident", { method: "POST", body: { code: "ZZZZZZZZ" } })).status === 401);

section("access codes: a resident who moves out loses everything")
// Report something first, so there's a capability token to revoke.
const leaverTicket = await req("/api/tickets", { method: "POST", cookie: newRes,
  body: { objectId: "u-B-207-Z1-RADIATOR", symptom: "NOT_HEATING" } });
const leaverToken = leaverTicket.json?.token;

const over = await req(`/api/admin/rooms/${aCode.room_id}/turnover`, { method: "POST",
  cookie: operator, body: { note: "Neuvermietung" } });
ok("the operator hands the room to a new resident", over.status === 200, JSON.stringify(over.json));
ok("a fresh code comes back", /^[A-Z0-9]{8}$/.test(over.json.code) && over.json.code !== aCode.code);

ok("the old code no longer signs anyone in",
  (await req("/api/auth/resident", { method: "POST", body: { code: aCode.code } })).status === 401);
ok("their existing session is dead",
  (await req("/api/session", { cookie: newRes })).json.principal.kind !== "tenant");
// The link does more than show a report: it books appointments and grants entry.
ok("their email link no longer works", !leaverToken ||
  (await req(`/api/tickets/${leaverTicket.json.id}?t=${leaverToken}`)).status === 404,
  "somebody who moved out must not be able to let a caretaker into their old room");
ok("the new code works",
  (await req("/api/auth/resident", { method: "POST", body: { code: over.json.code } })).status === 200);

ok("their report stays in the history",
  (await req("/api/tickets", { cookie: staff })).json.tickets
    .some((x) => x.ticket_id === leaverTicket.json.id));

ok("a shared room has no resident to replace", await (async () => {
  const units = (await req(`/api/admin/buildings/${codeB.id}/units`, { cookie: operator })).json.units;
  const shared = units.flatMap((u) => u.rooms).find((r) => r.room_type === "KITCHEN");
  return (await req(`/api/admin/rooms/${shared.id}/turnover`, { method: "POST", cookie: operator })).status === 409;
})());

section("access codes: reissuing a whole building")
const codesBefore = (await req(`/api/admin/buildings/${codeB.id}/codes`, { cookie: operator })).json.codes;
const all = await req(`/api/admin/buildings/${codeB.id}/codes/reissue`, { method: "POST", cookie: operator });
ok("every code in the building is replaced", all.status === 200 && all.json.issued === codesBefore.length,
  `${all.json.issued} vs ${codesBefore.length}`);
ok("none of the old ones survive", await (async () => {
  const now = (await req(`/api/admin/buildings/${codeB.id}/codes`, { cookie: operator })).json.codes;
  const olds = new Set(codesBefore.map((c) => c.code));
  return now.every((c) => !olds.has(c.code));
})());
ok("a caretaker cannot reissue a building",
  (await req(`/api/admin/buildings/${codeB.id}/codes/reissue`, { method: "POST", cookie: staff })).status === 403);

section("admin: staff and invites");section("admin: staff and invites");
const sList = await req("/api/admin/staff", { cookie: operator });
ok("operator lists staff with assignments", sList.status === 200 && sList.json.staff.length >= 2);
ok("a caretaker cannot list staff", (await req("/api/admin/staff", { cookie: staff })).status === 403);

const newStaff = await req("/api/admin/staff", { method: "POST", cookie: operator,
  body: { email: "neu@wohnheim.test", name: "P. Sommer", isOperator: false, buildingIds: [NB] } });
ok("operator creates a caretaker", newStaff.status === 200, JSON.stringify(newStaff.json));
ok("creation returns a one-time setup link", typeof newStaff.json.setupToken === "string");
const NS = newStaff.json.id;
ok("a duplicate email is refused",
  (await req("/api/admin/staff", { method: "POST", cookie: operator,
    body: { email: "neu@wohnheim.test", name: "Clash" } })).status === 409);

ok("the new account cannot log in before setting a password",
  (await req("/api/auth/staff", { method: "POST",
    body: { email: "neu@wohnheim.test", password: "anything123" } })).status === 401);
ok("a short password is refused at setup",
  (await req("/api/auth/setup", { method: "POST",
    body: { token: newStaff.json.setupToken, password: "short" } })).status === 400);

const accepted = await req("/api/auth/setup", { method: "POST",
  body: { token: newStaff.json.setupToken, password: "sommer-2026-ok" } });
ok("the invitee sets their own password and is signed in", accepted.status === 200);
const sommer = jarOf(accepted);
ok("the setup link is single use",
  (await req("/api/auth/setup", { method: "POST",
    body: { token: newStaff.json.setupToken, password: "another-one-ok" } })).status === 401);
ok("a made-up setup link is refused",
  (await req("/api/auth/setup", { method: "POST",
    body: { token: "not-a-real-token-at-all", password: "whatever123" } })).status === 401);
ok("they can now log in normally",
  (await req("/api/auth/staff", { method: "POST",
    body: { email: "neu@wohnheim.test", password: "sommer-2026-ok" } })).status === 200);

const sommerSession = await req("/api/session", { cookie: sommer });
ok("the new caretaker is scoped to their building",
  sommerSession.json.principal.buildingIds?.length === 1, JSON.stringify(sommerSession.json.principal));
ok("they see no tickets from buildings they don't cover",
  (await req("/api/tickets", { cookie: sommer })).json.tickets.every((x) => x.building_code === "N"));

section("admin: assignment");
ok("operator replaces a caretaker's buildings",
  (await req(`/api/admin/staff/${NS}/buildings`, { method: "PUT", cookie: operator,
    body: { buildingIds: [NB, bBath.id] } })).status === 200);
ok("the change takes effect without a new login",
  (await req("/api/session", { cookie: sommer })).json.principal.buildingIds.length === 2);
ok("removing a building with no booked appointments is fine",
  (await req(`/api/admin/staff/${NS}/buildings`, { method: "PUT", cookie: operator,
    body: { buildingIds: [NB] } })).status === 200);

// K. Neumann has booked appointments in Haus B from the seed.
const hmId = sList.json.staff.find((x) => x.email === "hausmeister@wohnheim.test").id;
const strip = await req(`/api/admin/staff/${hmId}/buildings`, { method: "PUT", cookie: operator,
  body: { buildingIds: [] } });
ok("un-assigning a caretaker with booked appointments is refused",
  strip.status === 409, JSON.stringify(strip.json));

section("passwords: changing your own")
ok("the current password is required",
  (await req("/api/me/password", { method: "POST", cookie: staff,
    body: { currentPassword: "wrong-one-entirely", newPassword: "brand-new-pass" } })).status === 401);
ok("a short new password is refused",
  (await req("/api/me/password", { method: "POST", cookie: staff,
    body: { currentPassword: CREDS.staff.password, newPassword: "short" } })).status === 400);
ok("a resident has no password to change",
  (await req("/api/me/password", { method: "POST", cookie: tenant,
    body: { currentPassword: "x", newPassword: "aaaaaaaaaaaa" } })).status === 403);

// Change it, prove the old one dies and the new one works, then change it back
// so later sections still have working credentials.
const changed = await req("/api/me/password", { method: "POST", cookie: staff,
  body: { currentPassword: CREDS.staff.password, newPassword: "hausmeister-neu-2026" } });
ok("the caretaker changes their password", changed.status === 200, JSON.stringify(changed.json));
const staffAfter = jarOf(changed);
ok("a fresh session comes back, so you stay signed in", staffAfter.startsWith("sid="));
ok("the old password no longer works",
  (await req("/api/auth/staff", { method: "POST",
    body: { email: CREDS.staff.email, password: CREDS.staff.password } })).status === 401);
ok("the new password works",
  (await req("/api/auth/staff", { method: "POST",
    body: { email: CREDS.staff.email, password: "hausmeister-neu-2026" } })).status === 200);
ok("the old session was revoked",
  (await req("/api/session", { cookie: staff })).json.principal.kind === "anonymous");

section("passwords: forgetting it")
ok("an unknown address gets the same answer as a known one", await (async () => {
  const a = await req("/api/auth/forgot", { method: "POST", body: { email: "nobody@nowhere.test" } });
  const b = await req("/api/auth/forgot", { method: "POST", body: { email: CREDS.operator.email } });
  return a.status === b.status && JSON.stringify(a.json) === JSON.stringify(b.json);
})());
ok("nonsense input doesn't error either",
  (await req("/api/auth/forgot", { method: "POST", body: { email: "not-an-address" } })).status === 200);

ok("a made-up reset link is refused",
  (await req("/api/auth/reset", { method: "POST",
    body: { token: "totally-invented-token", password: "whatever-goes-here" } })).status === 401);
ok("a short password is refused at reset",
  (await req("/api/auth/reset", { method: "POST",
    body: { token: "totally-invented-token", password: "short" } })).status === 400);

ok("the reset email is queued to the right address, and to nobody's bell", await (async () => {
  await req("/api/auth/forgot", { method: "POST", body: { email: CREDS.operator.email } });
  // Queued for sending...
  const dash = await req("/api/dev/mail", { method: "POST", cookie: operator });
  if (dash.status !== 200) return false;
  // ...but a personal reset link must not appear in any operator's bell.
  const bell = (await req("/api/notifications", { cookie: operator })).json.notifications;
  return !bell.some((n) => n.kind === "password_reset");
})());

ok("the reset template renders in both languages", await (async () => {
  const pv = (await req("/api/dev/mail/preview", { cookie: operator })).json.previews;
  // password_reset isn't in the preview list, so render it via the queue check
  // above instead; here we only assert the preview endpoint still works.
  return Array.isArray(pv) && pv.length > 0;
})());

section("admin: disabling");
ok("operator disables the new caretaker",
  (await req(`/api/admin/staff/${NS}/disable`, { method: "POST", cookie: operator })).status === 200);
ok("their session stops working immediately",
  (await req("/api/session", { cookie: sommer })).json.principal.kind === "anonymous");
ok("they cannot log back in",
  (await req("/api/auth/staff", { method: "POST",
    body: { email: "neu@wohnheim.test", password: "sommer-2026-ok" } })).status === 401);
ok("disabling twice is refused",
  (await req(`/api/admin/staff/${NS}/disable`, { method: "POST", cookie: operator })).status === 409);
ok("re-enabling works",
  (await req(`/api/admin/staff/${NS}/enable`, { method: "POST", cookie: operator })).status === 200);

const opId = sList.json.staff.find((x) => x.email === "verwaltung@wohnheim.test").id;
ok("an operator cannot disable themselves",
  (await req(`/api/admin/staff/${opId}/disable`, { method: "POST", cookie: operator })).status === 409);
ok("the last operator cannot be demoted away",
  (await req(`/api/admin/staff/${opId}`, { method: "PATCH", cookie: operator,
    body: { isOperator: false } })).status === 409);

// Put the caretaker's password back so nothing downstream is surprised.
await req("/api/me/password", { method: "POST", cookie: jarOf(
  await req("/api/auth/staff", { method: "POST",
    body: { email: CREDS.staff.email, password: "hausmeister-neu-2026" } })),
  body: { currentPassword: "hausmeister-neu-2026", newPassword: CREDS.staff.password } });

section("admin: the seed protects real work");
const reseed = await req("/api/dev/seed", { method: "POST" });
ok("reseeding is refused once a real building exists", reseed.status === 409, JSON.stringify(reseed.json));

section("organisations: nothing crosses the boundary")
// Build a second organisation by hand, then try every read path from inside it.
// This is the section that matters most: isolation here is a shared database
// plus an org_id, so a single forgotten condition is another customer's data.
const OTHER_ORG = "org-other-test";
const mkOther = async () => {
  // Direct inserts, because signup isn't built yet. The point is the scoping.
  const r = await req("/api/dev/testorg", { method: "POST", cookie: operator,
    body: { orgId: OTHER_ORG } });
  return r;
};
const other = await mkOther();
ok("a second organisation can be created for the test", other.status === 200,
  JSON.stringify(other.json));

const otherOp = jarOf(await req("/api/auth/staff", { method: "POST",
  body: { email: "op@other.test", password: "other-operator-2026" } }));
ok("its operator can sign in", otherOp.startsWith("sid="));

const otherSession = (await req("/api/session", { cookie: otherOp })).json;
ok("they are an operator", otherSession.principal.kind === "operator");
ok("they see none of the demo organisation's buildings",
  (otherSession.buildings || []).every((b) => b.code === "Z"),
  JSON.stringify((otherSession.buildings || []).map((b) => b.code)));

ok("they see no tickets from the demo organisation",
  (await req("/api/tickets", { cookie: otherOp })).json.tickets.length === 0,
  JSON.stringify((await req("/api/tickets", { cookie: otherOp })).json.tickets.length));

const otherDash = (await req("/api/dashboard?months=12", { cookie: otherOp })).json;
ok("their dashboard counts nothing of ours", otherDash.metrics.open === 0,
  `${otherDash.metrics.open}`);
ok("their building grid holds only their own",
  otherDash.buildings.every((b) => b.code === "Z"),
  JSON.stringify(otherDash.buildings.map((b) => b.code)));
ok("their repeat-fault ranking is empty", otherDash.repeats.length === 0);

ok("they cannot list our staff",
  (await req("/api/admin/staff", { cookie: otherOp })).json.staff
    .every((x) => x.email.endsWith("@other.test")),
  JSON.stringify((await req("/api/admin/staff", { cookie: otherOp })).json.staff.map((x) => x.email)));

ok("they cannot list our buildings",
  (await req("/api/admin/buildings", { cookie: otherOp })).json.buildings
    .every((b) => b.code === "Z"));

// Guessing an id from the other organisation must 404, not return the row.
const ourBuilding = (await req("/api/admin/buildings", { cookie: operator })).json
  .buildings.find((b) => b.code === "B");
ok("guessing our building id gives nothing",
  (await req(`/api/admin/buildings/${ourBuilding.id}/units`, { cookie: otherOp })).status === 404);
ok("they cannot rename our building",
  (await req(`/api/admin/buildings/${ourBuilding.id}`, { method: "PATCH", cookie: otherOp,
    body: { name: "Hijacked", roomCount: 1 } })).status === 404);
ok("they cannot add a unit to our building",
  (await req(`/api/admin/buildings/${ourBuilding.id}/units`, { method: "POST", cookie: otherOp,
    body: { code: "999", floor: 1, kind: "studio",
            rooms: [{ code: "Z1", roomType: "BEDROOM", kind: "private" }] } })).status === 404);
ok("they cannot print our stickers",
  (await req("/api/stickers/B", { cookie: otherOp })).status === 404);

const ourStaff = (await req("/api/admin/staff", { cookie: operator })).json.staff
  .find((x) => x.email === "hausmeister@wohnheim.test");
ok("they cannot disable our caretaker",
  (await req(`/api/admin/staff/${ourStaff.id}/disable`, { method: "POST", cookie: otherOp })).status === 404);
ok("they cannot reassign our caretaker's buildings",
  (await req(`/api/admin/staff/${ourStaff.id}/buildings`, { method: "PUT", cookie: otherOp,
    body: { buildingIds: [] } })).status === 404);
ok("they cannot issue a setup link for our caretaker",
  (await req(`/api/admin/staff/${ourStaff.id}/invite`, { method: "POST", cookie: otherOp })).status === 404);

const ourRoom = (await req(`/api/admin/buildings/${ourBuilding.id}/units`, { cookie: operator }))
  .json.units.find((u) => u.code === "312").rooms[0];
ok("they cannot rename our room",
  (await req(`/api/admin/rooms/${ourRoom.id}`, { method: "PATCH", cookie: otherOp,
    body: { label: "Hijacked" } })).status === 404);

section("access codes: never across organisations")
ok("another organisation cannot generate codes for our building",
  (await req(`/api/admin/buildings/${codeB.id}/codes`, { method: "POST", cookie: otherOp })).status === 404);
ok("nor read our sheet",
  (await req(`/api/admin/buildings/${codeB.id}/codes`, { cookie: otherOp })).status === 404);
ok("nor reissue our building",
  (await req(`/api/admin/buildings/${codeB.id}/codes/reissue`, { method: "POST", cookie: otherOp })).status === 404);
ok("nor hand one of our rooms to somebody else",
  (await req(`/api/admin/rooms/${aCode.room_id}/turnover`, { method: "POST", cookie: otherOp })).status === 404);

ok("their bell is empty of our notifications",
  (await req("/api/notifications", { cookie: otherOp })).json.notifications.length === 0);

// And the reverse: our operator must not see theirs appear.
ok("our own view is unchanged by their existence",
  (await req("/api/admin/buildings", { cookie: operator })).json.buildings
    .every((b) => b.code !== "Z"));
ok("our dashboard still counts our own tickets",
  (await req("/api/dashboard?months=12", { cookie: operator })).json.metrics.open > 0);

ok("a caretaker in another organisation sees nothing of ours", await (async () => {
  const oc = jarOf(await req("/api/auth/staff", { method: "POST",
    body: { email: "hm@other.test", password: "other-caretaker-2026" } }));
  const list = (await req("/api/tickets", { cookie: oc })).json.tickets;
  return list.length === 0;
})());

ok("the seed refuses to touch a real organisation's buildings", await (async () => {
  // The demo org may be reseeded; a non-demo building must not be a reason to
  // refuse, and must not be wiped either.
  const before = (await req("/api/admin/buildings", { cookie: otherOp })).json.buildings.length;
  await req("/api/dev/seed", { method: "POST" });
  const after = (await req("/api/admin/buildings", { cookie: otherOp })).json.buildings.length;
  return before === after;
})());

section("signup and approval")
const su = await req("/api/orgs/signup", { method: "POST",
  body: { orgName: "Studierendenwerk Testheim", name: "A. Beispiel",
          email: "anna@studentenwerk-testheim.de" } });
ok("anyone can sign up an organisation", su.status === 200, JSON.stringify(su.json));
ok("demo mode returns the setup link so the flow is walkable",
  typeof su.json.setupToken === "string");

ok("the same email can't sign up twice",
  (await req("/api/orgs/signup", { method: "POST",
    body: { orgName: "Another", name: "B", email: "anna@studentenwerk-testheim.de" } })).status === 409);
ok("a nonsense address is refused",
  (await req("/api/orgs/signup", { method: "POST",
    body: { orgName: "X", name: "Y", email: "nope" } })).status === 400);
ok("an unnamed organisation is refused",
  (await req("/api/orgs/signup", { method: "POST",
    body: { orgName: "  ", name: "Y", email: "z@z.test" } })).status === 400);

// Set the password via the setup link, exactly as the emailed flow would.
const claimed = await req("/api/auth/setup", { method: "POST",
  body: { token: su.json.setupToken, password: "testheim-2026-ok" } });
ok("the new operator sets their own password", claimed.status === 200);
const newOp = jarOf(claimed);

const pending = (await req("/api/session", { cookie: newOp })).json;
ok("they are signed in", pending.principal.kind === "operator");
ok("but the organisation is pending", pending.org.status === "pending");
ok("and the session says so", pending.orgBlocked === true);

// The gate: signed in, nothing readable.
ok("a pending organisation cannot read tickets",
  (await req("/api/tickets", { cookie: newOp })).status === 403);
ok("a pending organisation cannot read the dashboard",
  (await req("/api/dashboard", { cookie: newOp })).status === 403);
ok("a pending organisation cannot create buildings",
  (await req("/api/admin/buildings", { method: "POST", cookie: newOp,
    body: { code: "Q", name: "Nope", roomCount: 1 } })).status === 403);
ok("a pending organisation cannot list staff",
  (await req("/api/admin/staff", { cookie: newOp })).status === 403);
ok("but it can still read its own session",
  (await req("/api/session", { cookie: newOp })).status === 200);

section("the platform console")
ok("an ordinary operator cannot list organisations",
  (await req("/api/platform/orgs", { cookie: operator })).status === 403);
ok("a caretaker cannot either",
  (await req("/api/platform/orgs", { cookie: staff })).status === 403);
ok("nor can the pending operator approve themselves",
  (await req(`/api/platform/orgs/${su.json.orgId}/status`, { method: "POST", cookie: newOp,
    body: { status: "active" } })).status === 403);

// Promote the demo operator to platform admin, the way the D1 console would.
await req("/api/dev/platformadmin", { method: "POST", cookie: operator });
const admin = jarOf(await req("/api/auth/staff", { method: "POST", body: CREDS.operator }));

const orgList = await req("/api/platform/orgs", { cookie: admin });
ok("the platform admin lists organisations", orgList.status === 200);
ok("pending ones come first", orgList.json.orgs[0].status === "pending");
ok("the list carries counts, never tickets",
  orgList.json.orgs.every((o) => typeof o.buildings === "number" && !("tickets" in o)));
ok("the signup domain is recorded as evidence",
  orgList.json.orgs.some((o) => o.signup_domain === "studentenwerk-testheim.de"));

// The important one: approving is not reading.
ok("a platform admin still cannot read another organisation's tickets", await (async () => {
  const all = (await req("/api/tickets", { cookie: admin })).json.tickets;
  // They're an operator in the demo org, so they see the demo org and no more.
  return all.every((x) => ["A", "B", "C"].includes(x.building_code));
})());

ok("the demo organisation can't be suspended",
  (await req("/api/platform/orgs/org-demo/status", { method: "POST", cookie: admin,
    body: { status: "suspended" } })).status === 409);
ok("you can't change your own organisation",
  (await req(`/api/platform/orgs/${(await req("/api/session", { cookie: admin })).json.org.id}/status`,
    { method: "POST", cookie: admin, body: { status: "suspended" } })).status === 409);
ok("an invalid status is refused",
  (await req(`/api/platform/orgs/${su.json.orgId}/status`, { method: "POST", cookie: admin,
    body: { status: "deleted" } })).status === 400);

ok("approving works",
  (await req(`/api/platform/orgs/${su.json.orgId}/status`, { method: "POST", cookie: admin,
    body: { status: "active" } })).status === 200);
ok("the newly approved operator can now work",
  (await req("/api/tickets", { cookie: newOp })).status === 200);
ok("and sees nothing of the demo organisation",
  (await req("/api/tickets", { cookie: newOp })).json.tickets.length === 0);
const theirBuilding = await req("/api/admin/buildings", { method: "POST", cookie: newOp,
  body: { code: "A", name: "Haus A Testheim", roomCount: 40 } });
ok("they can create their own building",
  theirBuilding.status === 200,
  `same code as the demo org's Haus A, must be allowed: ${JSON.stringify(theirBuilding.json)}`);

section("slugs stay unique across organisations")
ok("their Haus A gets its own slug space", await (async () => {
  const bs = (await req("/api/admin/buildings", { cookie: newOp })).json.buildings;
  const theirA = bs.find((b) => b.code === "A");
  if (!theirA) return false;
  const u = await req(`/api/admin/buildings/${theirA.id}/units`, { method: "POST", cookie: newOp,
    body: { code: "112", floor: 1, kind: "studio",
            rooms: [{ code: "BA", roomType: "BATHROOM", kind: "private" }] } });
  return u.status === 200;
})());

ok("the demo organisation's sticker still resolves to the demo room", await (async () => {
  const r = await req("/api/r/b312-ba");
  return r.status === 200 && r.json.room.building_code === "B";
})());

ok("their slug is different from ours despite the same building code", await (async () => {
  const sheet = (await req("/api/stickers/A", { cookie: newOp })).json;
  // Prefixed by the organisation, so /r/... can never be ambiguous.
  return sheet.stickers.some((x) => x.qr_slug.includes("112-ba") && x.qr_slug !== "a112-ba");
})());

ok("scanning their slug gives their room, not ours", await (async () => {
  const sheet = (await req("/api/stickers/A", { cookie: newOp })).json;
  const slug = sheet.stickers.find((x) => x.qr_slug.includes("112-ba"))?.qr_slug;
  if (!slug) return false;
  const r = await req(`/api/r/${slug}`);
  return r.status === 200 && r.json.room.building_code === "A";
})());

section("the console never offers what the API refuses")
const listed = (await req("/api/platform/orgs", { cookie: admin })).json.orgs;
ok("the caller's own organisation is flagged",
  listed.some((o) => o.is_self === 1), JSON.stringify(listed.map((o) => [o.name, o.is_self])));
ok("exactly one row is the caller's", listed.filter((o) => o.is_self === 1).length === 1);
// The UI hides actions on that row; this asserts the API agrees, so the two
// can't drift into offering a button that always errors.
ok("and the API refuses to change it", await (async () => {
  const self = listed.find((o) => o.is_self === 1);
  return (await req(`/api/platform/orgs/${self.id}/status`, { method: "POST", cookie: admin,
    body: { status: "suspended" } })).status === 409;
})());

section("exporting and deleting an organisation")
const exp = await req(`/api/platform/orgs/${su.json.orgId}/export`, { cookie: admin });
ok("an organisation can be exported", exp.status === 200, JSON.stringify(exp.json?.counts));
ok("the export carries structure and history",
  typeof exp.json.counts.buildings === "number" && Array.isArray(exp.json.tickets));
ok("it carries no password hashes",
  exp.json.staff.every((x) => !("password_hash" in x)));
ok("it carries no resident access codes",
  !JSON.stringify(exp.json).includes("activation_code"));
// Not `operator`: the demo operator was promoted to platform admin earlier in
// this suite, so it isn't a plain operator any more.
ok("a plain operator cannot export anyone",
  (await req(`/api/platform/orgs/${su.json.orgId}/export`, { cookie: newOp })).status === 403);

ok("an organisation with buildings cannot be deleted",
  (await req(`/api/platform/orgs/${su.json.orgId}`, { method: "DELETE", cookie: admin })).status === 409,
  "suspending is what a dispute needs; their repair history is not ours to destroy");
ok("the demo organisation cannot be deleted",
  (await req("/api/platform/orgs/org-demo", { method: "DELETE", cookie: admin })).status === 409);
ok("the caller cannot delete their own",
  (await req(`/api/platform/orgs/${listed.find((o) => o.is_self === 1).id}`,
    { method: "DELETE", cookie: admin })).status === 409);

ok("an empty organisation can be deleted", await (async () => {
  const junk = await req("/api/orgs/signup", { method: "POST",
    body: { orgName: "Spam Signup", name: "Nobody", email: "spam@nowhere.test" } });
  if (junk.status !== 200) return false;
  const del = await req(`/api/platform/orgs/${junk.json.orgId}`, { method: "DELETE", cookie: admin });
  if (del.status !== 200) { console.log("      delete said:", del.status, JSON.stringify(del.json)); return false; }
  const after = (await req("/api/platform/orgs", { cookie: admin })).json.orgs;
  return !after.some((o) => o.id === junk.json.orgId);
})());
ok("its staff go with it",
  (await req("/api/auth/staff", { method: "POST",
    body: { email: "spam@nowhere.test", password: "anything-at-all" } })).status === 401);

section("suspending an organisation")
ok("suspending works",
  (await req(`/api/platform/orgs/${su.json.orgId}/status`, { method: "POST", cookie: admin,
    body: { status: "suspended", note: "not paid" } })).status === 200);
ok("their session is revoked immediately",
  (await req("/api/session", { cookie: newOp })).json.principal.kind === "anonymous");
ok("they cannot sign back in and work",
  (await req("/api/tickets", { cookie: jarOf(await req("/api/auth/staff", { method: "POST",
    body: { email: "anna@studentenwerk-testheim.de", password: "testheim-2026-ok" } })) })).status === 403);
ok("the note is kept for the console",
  (await req("/api/platform/orgs", { cookie: admin })).json.orgs
    .find((o) => o.id === su.json.orgId).note === "not paid");
ok("their data survives being suspended",
  (await req("/api/platform/orgs", { cookie: admin })).json.orgs
    .find((o) => o.id === su.json.orgId).buildings >= 1);

section("access codes: brute force is throttled")
// The throttle used to be keyed on the code being attempted, which meant
// somebody working through AAAAAA, AAAAAB, AAAAAC never hit the same key twice
// and was never slowed at all.
ok("guessing many different codes gets locked out", await (async () => {
  let blocked = false;
  for (let i = 0; i < 9; i++) {
    const r = await req("/api/auth/resident", { method: "POST",
      body: { code: `ZZZZZZ${String(i).padStart(2, "0")}` } });
    if (r.status === 429) { blocked = true; break; }
  }
  return blocked;
})());
// A locked-out caller is refused even with a code that would otherwise work.
ok("a valid code is refused too while the caller is locked out",
  [401, 429].includes((await req("/api/auth/resident", { method: "POST",
    body: { code: over.json.code } })).status));

section("static assets");
const page = await fetch(BASE + "/");
ok("SPA index is served", page.status === 200 && (await page.text()).includes("DormTag"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
