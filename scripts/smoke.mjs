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
ok("illegal transition refused",
  (await req("/api/tickets/L2/accept", { method: "POST", cookie: staff })).status === 409);

const flow = async (label, path, cookie, body) => {
  const r = await req(`/api/tickets/L1${path}`, { method: "POST", cookie, body });
  ok(label, r.status === 200, JSON.stringify(r.json));
  return r;
};
const slots = async (cookie) => (await req("/api/tickets/L1", { cookie })).json.slots;

await flow("part marked arrived → back to slot offering", "/part-arrived", staff);
let sl = await slots(tenant);
ok("three slots offered", sl.length === 3, `got ${sl.length}`);

const soon = sl[0];      // tomorrow morning — inside the 24h cutoff


await flow("tenant books an imminent slot", "/book", tenant, { slotId: soon.id });
const tooLate = await req("/api/tickets/L1/reschedule", { method: "POST", cookie: tenant });
ok("24h cutoff blocks self-reschedule", tooLate.status === 409, JSON.stringify(tooLate.json));
ok("staff can still move it inside the cutoff",
  (await req("/api/tickets/L1/reschedule", { method: "POST", cookie: staff })).status === 200);

sl = await slots(tenant);
const first = sl.find((x) => x.starts_at - Date.now() > 864e5)?.id ?? sl[sl.length - 1].id;
await flow("tenant books a slot outside the cutoff", "/book", tenant, { slotId: first });
let st = (await req("/api/tickets/L1", { cookie: tenant })).json;
ok("state is scheduled", st.ticket.state === "scheduled");
ok("one booked appointment", st.appointments.filter((a) => a.status === "booked").length === 1);

const reuse = await req("/api/tickets/L1/book", { method: "POST", cookie: tenant, body: { slotId: first } });
ok("claimed slot cannot be reused", reuse.status === 409, JSON.stringify(reuse.json));

await flow("tenant reschedules", "/reschedule", tenant);
st = (await req("/api/tickets/L1", { cookie: tenant })).json;
ok("previous appointment cancelled, not overwritten",
  st.appointments.some((a) => a.status === "cancelled_by_tenant"),
  JSON.stringify(st.appointments.map((a) => a.status)));

sl = await slots(tenant);
await flow("tenant rebooks", "/book", tenant, { slotId: sl[0].id });
await flow("staff records nobody home", "/no-access", staff);
st = (await req("/api/tickets/L1", { cookie: staff })).json;
ok("no-access returns to slot offering", st.ticket.state === "slots_offered");
ok("no_access recorded on the appointment",
  st.appointments.some((a) => a.status === "no_access"));

sl = await slots(tenant);
await flow("tenant books again", "/book", tenant, { slotId: sl[0].id });
await flow("staff closes with a cause", "/done", staff, { cause: "SEAL" });
st = (await req("/api/tickets/L1", { cookie: staff })).json;
ok("ticket is done", st.ticket.state === "done");
ok("cause recorded", st.ticket.cause === "SEAL");
ok("closed_at set", !!st.ticket.closed_at);
ok("full audit trail preserved", st.events.length >= 9, `${st.events.length} events`);

section("reporting on a closed object works again");
const again = await req("/api/tickets", { method: "POST", cookie: tenant, body: { objectId: "u-B-312-KU-SINK", symptom: "BLOCKED" } });
ok("new ticket opens once the old one closed", again.status === 200 && again.json.merged === false, JSON.stringify(again.json));

section("dashboard");
const dash = (await req("/api/dashboard", { cookie: operator })).json;
ok("metrics present", typeof dash.metrics.open === "number" && dash.metrics.failedPct >= 0, JSON.stringify(dash.metrics));
const drain = dash.repeats.find((r) => r.building_code === "C" && r.object_type === "DRAIN");
ok("planted drain pattern is detected", !!drain, JSON.stringify(dash.repeats.slice(0, 2)));
if (drain) {
  ok("11 tickets on the riser", drain.ticket_count === 11, `got ${drain.ticket_count}`);
  ok("across 7 rooms", drain.rooms_affected === 7, `got ${drain.rooms_affected}`);
  ok("majority logged as systemic", drain.systemic >= 8, `got ${drain.systemic}`);
  ok("drain pattern ranks first", dash.repeats[0].object_type === "DRAIN");
}
ok("failed-visit rate is non-zero", dash.metrics.failedPct > 0, `${dash.metrics.failedPct}%`);

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
