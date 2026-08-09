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
  (await req("/api/tickets", { method: "POST", body: { objectId: "u-A-COM-FL-DOOR", symptom: "BROKEN" } })).status === 200);
ok("a resident cannot report a bedroom in another flat",
  (await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-B-207-Z1-SOCKET", symptom: "NO_POWER" } })).status === 403);
ok("a resident CAN report a flatmate's bedroom in their own flat",
  [200].includes((await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-B-312-Z3-WINDOW", symptom: "COLD" } })).status));
ok("a resident CAN report shared space in another building",
  [200].includes((await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-C-COM-WK-WASHER", symptom: "NOISE" } })).status));
ok("signing in is never more restrictive than staying anonymous",
  (await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-A-COM-FL-LIGHT", symptom: "NO_POWER" } })).status !== 403);

section("deduplication");
const sameAgain = await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-B-312-KU-SINK", symptom: "LEAKING" } });
ok("re-report on a live object merges instead of duplicating", sameAgain.json.merged === true, JSON.stringify(sameAgain.json));
const before = (await req("/api/tickets/L3", { cookie: staff })).json.reporterCount;
await req("/api/tickets", { method: "POST", body: { objectId: "u-C-COM-FL-LIGHT", symptom: "NO_POWER" } });
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
ok("object breakdown is ranked", dash.byType.every((x, i, a) => i === 0 || a[i - 1].n >= x.n),
  JSON.stringify(dash.byType.map((x) => x.n)));
ok("object breakdown names real types", dash.byType.every((x) => !!x.object_type));

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

const commonArea = await mkTicket("u-C-COM-WK-DRAIN");
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
ok("stickers carry a slug and a room", !!sheet.json.stickers?.[0]?.qr_slug && !!sheet.json.stickers?.[0]?.room_code);
ok("operator can print any building", (await req("/api/stickers/C", { cookie: operator })).status === 200);
ok("resident cannot list stickers", (await req("/api/stickers/B", { cookie: tenant })).status === 403);
ok("anonymous cannot list stickers", (await req("/api/stickers/B")).status === 403);

const slug = sheet.json.stickers.find((x) => x.room_kind === "shared")?.qr_slug;
const scan = await req(`/api/r/${slug}`);
ok("anonymous can resolve a scanned sticker", scan.status === 200 && !!scan.json.object, `${slug}`);
ok("scan returns the rest of the room for the picker", scan.json.siblings.length > 1);
ok("unknown sticker 404s", (await req("/api/r/not-a-real-slug")).status === 404);

const anonReport = await req("/api/tickets", { method: "POST", body: { objectId: scan.json.object.id, symptom: "BROKEN" } });
ok("scanning a shared fixture lets anyone report it", anonReport.status === 200, JSON.stringify(anonReport.json));
ok("report hands back a capability token", typeof anonReport.json.token === "string" && anonReport.json.token.length > 20);

section("static assets");
const page = await fetch(BASE + "/");
ok("SPA index is served", page.status === 200 && (await page.text()).includes("DormTag"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
