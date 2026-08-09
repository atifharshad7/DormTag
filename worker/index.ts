/**
 * DormTag — Cloudflare Worker API
 *
 * Sections:
 *   1  env + tiny helpers
 *   2  crypto (hashing, signed cookies)
 *   3  principal resolution + row scoping
 *   4  state machine
 *   5  routes
 *   6  seed generator
 */

export interface Env {
  DB: D1Database;
  DEMO_MODE: string;
  ASSETS: Fetcher;
}

/* ================================================================ */
/* 1. helpers                                                       */
/* ================================================================ */

const now = () => Date.now();
const uid = () => crypto.randomUUID();
const DAY = 864e5;

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });

const bad = (msg: string, status = 400) => json({ error: msg }, { status });

/* ================================================================ */
/* 2. crypto                                                        */
/* ================================================================ */

const enc = new TextEncoder();

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Session cookies carry the raw token — no signature.
 *
 * The token is 32 bytes of crypto-random data and is only accepted if its
 * SHA-256 hash matches a live row in staff_sessions / tenant_sessions. An
 * HMAC on top would add no security (an unguessable token cannot be forged);
 * it would only save one database lookup on garbage input, in exchange for a
 * deployment-time secret that can silently be missing.
 */
function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") || "";
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(name + "="));
  if (!hit) return null;
  const value = decodeURIComponent(hit.slice(name.length + 1)).trim();
  // Reject anything that isn't a plausible token before touching the database.
  return /^[A-Za-z0-9_-]{20,}$/.test(value) ? value : null;
}

function setCookie(name: string, value: string, maxAgeSec: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
const clearCookie = (name: string) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/* ================================================================ */
/* 3. principal + scoping                                           */
/* ================================================================ */

type Principal =
  | { kind: "anonymous" }
  | { kind: "token"; ticketId: string; reporterId: string; isPrimary: boolean; locale: string }
  | { kind: "tenant"; tenantId: string; roomId: string; unitId: string; locale: string }
  | { kind: "staff"; staffId: string; name: string; buildingIds: string[]; locale: string }
  | { kind: "operator"; staffId: string; name: string; locale: string };

async function resolvePrincipal(req: Request, env: Env): Promise<Principal> {
  const sid = readCookie(req, "sid");
  if (sid) {
    const row = await env.DB.prepare(
      `SELECT s.id, s.display_name, s.is_operator, s.locale
         FROM staff_sessions ss JOIN staff s ON s.id = ss.staff_id
        WHERE ss.token_hash = ?1 AND ss.revoked_at IS NULL AND ss.expires_at > ?2`
    ).bind(await sha256(sid), now()).first<any>();
    if (row) {
      if (row.is_operator) return { kind: "operator", staffId: row.id, name: row.display_name, locale: row.locale };
      const bs = await env.DB.prepare(`SELECT building_id FROM staff_buildings WHERE staff_id = ?1`)
        .bind(row.id).all<any>();
      return {
        kind: "staff", staffId: row.id, name: row.display_name, locale: row.locale,
        buildingIds: bs.results.map((b) => b.building_id),
      };
    }
  }

  const tid = readCookie(req, "tid");
  if (tid) {
    const row = await env.DB.prepare(
      `SELECT t.id AS tenant_id, t.locale, r.id AS room_id, r.unit_id
         FROM tenant_sessions ts
         JOIN tenants t ON t.id = ts.tenant_id
         JOIN tenancies tn ON tn.tenant_id = t.id AND tn.ends_on IS NULL
         JOIN rooms r ON r.id = tn.room_id
        WHERE ts.token_hash = ?1 AND ts.revoked_at IS NULL AND ts.expires_at > ?2`
    ).bind(await sha256(tid), now()).first<any>();
    if (row) return { kind: "tenant", tenantId: row.tenant_id, roomId: row.room_id, unitId: row.unit_id, locale: row.locale };
  }

  const url = new URL(req.url);
  const tok = url.searchParams.get("t");
  if (tok) {
    const row = await env.DB.prepare(
      `SELECT id, ticket_id, is_primary, locale FROM ticket_reporters WHERE token = ?1`
    ).bind(tok).first<any>();
    if (row) return { kind: "token", ticketId: row.ticket_id, reporterId: row.id, isPrimary: !!row.is_primary, locale: row.locale };
  }

  return { kind: "anonymous" };
}

/**
 * The single source of truth for "which tickets may this principal see".
 * Returns a SQL fragment plus bindings — never string-interpolated values.
 */
function ticketScope(p: Principal): { where: string; binds: unknown[] } {
  switch (p.kind) {
    case "operator":
      return { where: "1=1", binds: [] };
    case "staff": {
      if (p.buildingIds.length === 0) return { where: "1=0", binds: [] };
      const q = p.buildingIds.map(() => "?").join(",");
      return { where: `vtl.building_id IN (${q})`, binds: [...p.buildingIds] };
    }
    case "tenant":
      // Own private room, plus every shared room in the same unit.
      return {
        where: `((vtl.room_kind = 'private' AND vtl.room_id = ?)
                 OR (vtl.room_kind = 'shared' AND vtl.unit_id = ?))`,
        binds: [p.roomId, p.unitId],
      };
    case "token":
      return { where: "vtl.ticket_id = ?", binds: [p.ticketId] };
    default:
      return { where: "1=0", binds: [] };
  }
}

const isStaff = (p: Principal) => p.kind === "staff" || p.kind === "operator";

/** Only the room's own resident consents to entry or picks the time. */
function mayBookOrConsent(p: Principal, loc: any): boolean {
  if (loc.room_kind === "shared") {
    if (p.kind === "tenant") return loc.unit_id === p.unitId;
    if (p.kind === "token") return true;
    return false;
  }
  if (p.kind === "tenant") return loc.room_id === p.roomId;
  if (p.kind === "token") return p.isPrimary;
  return false;
}

/* ================================================================ */
/* 4. state machine                                                 */
/* ================================================================ */

type State = "reported" | "accepted" | "slots_offered" | "scheduled" | "waiting_for_parts" | "done" | "cancelled";

const TRANSITIONS: Record<State, State[]> = {
  reported:          ["accepted", "cancelled"],
  accepted:          ["slots_offered", "done", "waiting_for_parts", "cancelled"],
  slots_offered:     ["scheduled", "accepted", "cancelled"],
  scheduled:         ["done", "waiting_for_parts", "slots_offered", "cancelled"],
  waiting_for_parts: ["slots_offered", "done", "cancelled"],
  done:              [],
  cancelled:         [],
};

function assertTransition(from: State, to: State) {
  if (!TRANSITIONS[from].includes(to)) {
    throw new HttpError(`illegal transition ${from} → ${to}`, 409);
  }
}

class HttpError extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

function transitionStmts(env: Env, ticket: any, to: State, reason: string, p: Principal) {
  assertTransition(ticket.state as State, to);
  const actorKind = isStaff(p) ? "staff" : p.kind === "anonymous" ? "system" : "tenant";
  const actorId = isStaff(p) ? (p as any).staffId : p.kind === "tenant" ? p.tenantId : null;
  return [
    env.DB.prepare(`UPDATE tickets SET state = ?1, closed_at = ?2 WHERE id = ?3`)
      .bind(to, to === "done" || to === "cancelled" ? now() : null, ticket.id),
    env.DB.prepare(
      `INSERT INTO ticket_events (ticket_id, from_state, to_state, actor_kind, actor_id, reason, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(ticket.id, ticket.state, to, actorKind, actorId, reason, now()),
  ];
}

/** Slots land on a fixed hourly grid so the staff_not_double_booked index bites. */
function generateSlots(base: number) {
  const out: { startsAt: number; endsAt: number }[] = [];
  const hours = [9, 14, 11];
  for (let d = 1; d <= 3; d++) {
    const s = new Date(base + d * DAY);
    s.setHours(hours[d - 1], 0, 0, 0);
    out.push({ startsAt: s.getTime(), endsAt: s.getTime() + 36e5 });
  }
  return out;
}

/* ================================================================ */
/* 5. routes                                                        */
/* ================================================================ */

type Ctx = { req: Request; env: Env; p: Principal; url: URL; params: Record<string, string> };

const routes: [string, RegExp, (c: Ctx) => Promise<Response>][] = [];
const route = (method: string, pattern: string, fn: (c: Ctx) => Promise<Response>) => {
  const names: string[] = [];
  const rx = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return "([^/]+)"; }) + "$");
  routes.push([method, rx, async (c) => fn(c)]);
  (rx as any).names = names;
};

async function loadTicket(env: Env, id: string) {
  const t = await env.DB.prepare(`SELECT * FROM tickets WHERE id = ?1`).bind(id).first<any>();
  if (!t) throw new HttpError("not found", 404);
  const loc = await env.DB.prepare(`SELECT * FROM v_ticket_location WHERE ticket_id = ?1`).bind(id).first<any>();
  return { ...t, loc };
}

async function assertVisible(env: Env, p: Principal, id: string) {
  const s = ticketScope(p);
  const row = await env.DB.prepare(
    `SELECT ticket_id FROM v_ticket_location vtl WHERE vtl.ticket_id = ? AND ${s.where}`
  ).bind(id, ...s.binds).first();
  if (!row) throw new HttpError("not found", 404);
}

/* --- session ---------------------------------------------------- */

route("GET", "/api/session", async ({ p, env }) => {
  const buildings = await env.DB.prepare(`SELECT id, code, name, room_count FROM buildings ORDER BY code`).all<any>();
  let home = null;
  if (p.kind === "tenant") {
    home = await env.DB.prepare(
      `SELECT u.id AS unit_id, u.code AS unit_code, b.code AS building_code, r.code AS room_code
         FROM rooms r JOIN units u ON u.id = r.unit_id JOIN buildings b ON b.id = u.building_id
        WHERE r.id = ?1`
    ).bind(p.roomId).first<any>();
  }
  return json({ principal: p, buildings: buildings.results, home, demo: env.DEMO_MODE === "true" });
});

/**
 * Demo login. Issues a REAL session against a real seeded account — the
 * reviewer clicks a role, the auth path underneath is the production one.
 */
route("POST", "/api/session/demo", async ({ req, env }) => {
  if (env.DEMO_MODE !== "true") return bad("demo disabled", 403);
  const { as } = (await req.json()) as { as: string };
  const emails: Record<string, string> = {
    tenant: "z2@wohnheim.test",
    staff: "hausmeister@wohnheim.test",
    operator: "verwaltung@wohnheim.test",
  };
  const email = emails[as];
  if (!email) return bad("unknown role");

  const token = randomToken();
  const hash = await sha256(token);
  const headers = new Headers({ "content-type": "application/json" });

  if (as === "tenant") {
    const t = await env.DB.prepare(`SELECT id FROM tenants WHERE email = ?1`).bind(email).first<any>();
    if (!t) return bad("seed the database first", 409);
    await env.DB.prepare(
      `INSERT INTO tenant_sessions (id, tenant_id, token_hash, issued_at, expires_at) VALUES (?1,?2,?3,?4,?5)`
    ).bind(uid(), t.id, hash, now(), now() + 7 * DAY).run();
    headers.append("set-cookie", setCookie("tid", token, 7 * 86400));
    headers.append("set-cookie", clearCookie("sid"));
  } else {
    const s = await env.DB.prepare(`SELECT id FROM staff WHERE email = ?1`).bind(email).first<any>();
    if (!s) return bad("seed the database first", 409);
    await env.DB.prepare(
      `INSERT INTO staff_sessions (id, staff_id, token_hash, issued_at, expires_at) VALUES (?1,?2,?3,?4,?5)`
    ).bind(uid(), s.id, hash, now(), now() + 7 * DAY).run();
    headers.append("set-cookie", setCookie("sid", token, 7 * 86400));
    headers.append("set-cookie", clearCookie("tid"));
  }
  return new Response(JSON.stringify({ ok: true }), { headers });
});

route("POST", "/api/session/logout", async () => {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", clearCookie("sid"));
  headers.append("set-cookie", clearCookie("tid"));
  return new Response(JSON.stringify({ ok: true }), { headers });
});

/* --- stickers + picker ------------------------------------------ */

route("GET", "/api/r/:slug", async ({ env, params }) => {
  const o = await env.DB.prepare(
    `SELECT o.id, o.object_type, o.riser, r.id AS room_id, r.room_type, r.kind AS room_kind,
            u.code AS unit_code, b.code AS building_code
       FROM objects o JOIN rooms r ON r.id = o.room_id
       JOIN units u ON u.id = r.unit_id JOIN buildings b ON b.id = u.building_id
      WHERE o.qr_slug = ?1`
  ).bind(params.slug).first<any>();
  if (!o) return bad("unknown sticker", 404);
  const siblings = await env.DB.prepare(
    `SELECT id, object_type, ordinal, qr_slug FROM objects WHERE room_id = ?1 ORDER BY object_type`
  ).bind(o.room_id).all<any>();
  return json({ object: o, siblings: siblings.results });
});

/** Rooms + objects the current tenant may report on. Drives the picker. */
route("GET", "/api/my-rooms", async ({ env, p }) => {
  if (p.kind !== "tenant") return bad("tenant session required", 403);
  const rows = await env.DB.prepare(
    `SELECT r.id AS room_id, r.code AS room_code, r.room_type, r.kind AS room_kind,
            o.id AS object_id, o.object_type, o.ordinal, o.qr_slug
       FROM rooms r JOIN objects o ON o.room_id = r.id
      WHERE r.unit_id = ?1 AND (r.kind = 'shared' OR r.id = ?2)
      ORDER BY r.kind DESC, r.code, o.object_type`
  ).bind(p.unitId, p.roomId).all<any>();
  return json({ rows: rows.results });
});

/* --- tickets ---------------------------------------------------- */

route("GET", "/api/tickets", async ({ env, p }) => {
  const s = ticketScope(p);
  const rows = await env.DB.prepare(
    `SELECT vtl.*, t.needs_access, t.access_consent, t.note, t.symptom, t.reschedule_count,
            (SELECT COUNT(*) FROM ticket_reporters tr WHERE tr.ticket_id = t.id) AS reporter_count,
            (SELECT starts_at FROM appointments a WHERE a.ticket_id = t.id AND a.status = 'booked') AS appt_at,
            (SELECT description FROM parts_orders po WHERE po.ticket_id = t.id ORDER BY ordered_at DESC LIMIT 1) AS part_what,
            (SELECT supplier_eta FROM parts_orders po WHERE po.ticket_id = t.id ORDER BY ordered_at DESC LIMIT 1) AS part_eta
       FROM v_ticket_location vtl JOIN tickets t ON t.id = vtl.ticket_id
      WHERE ${s.where}
      ORDER BY CASE WHEN t.state = 'done' THEN 1 ELSE 0 END, t.reported_at DESC
      LIMIT 200`
  ).bind(...s.binds).all<any>();
  return json({ tickets: rows.results });
});

route("GET", "/api/tickets/:id", async ({ env, p, params }) => {
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const [events, slots, appts, parts, reporters] = await Promise.all([
    env.DB.prepare(`SELECT * FROM ticket_events WHERE ticket_id = ?1 ORDER BY created_at, id`).bind(params.id).all<any>(),
    env.DB.prepare(`SELECT * FROM slot_offers WHERE ticket_id = ?1 AND expires_at > ?2 ORDER BY starts_at`).bind(params.id, now()).all<any>(),
    env.DB.prepare(`SELECT * FROM appointments WHERE ticket_id = ?1 ORDER BY created_at`).bind(params.id).all<any>(),
    env.DB.prepare(`SELECT * FROM parts_orders WHERE ticket_id = ?1 ORDER BY ordered_at DESC`).bind(params.id).all<any>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM ticket_reporters WHERE ticket_id = ?1`).bind(params.id).first<any>(),
  ]);
  return json({
    ticket: t, loc: t.loc,
    events: events.results, slots: slots.results, appointments: appts.results,
    parts: parts.results, reporterCount: reporters.n,
    canBook: mayBookOrConsent(p, t.loc),
  });
});

route("POST", "/api/tickets", async ({ env, req, p }) => {
  const body = (await req.json()) as { objectId: string; symptom: string; note?: string };
  if (!body.objectId || !body.symptom) return bad("objectId and symptom required");

  const o = await env.DB.prepare(
    `SELECT o.id, r.kind AS room_kind, r.unit_id, r.id AS room_id
       FROM objects o JOIN rooms r ON r.id = o.room_id WHERE o.id = ?1`
  ).bind(body.objectId).first<any>();
  if (!o) return bad("unknown object", 404);

  // Tenants may only report in their own unit.
  if (p.kind === "tenant" && o.unit_id !== p.unitId) return bad("not your unit", 403);
  // Anonymous reporting is allowed for shared rooms only.
  if (p.kind === "anonymous" && o.room_kind !== "shared") return bad("sign in to report your room", 403);

  const existing = await env.DB.prepare(
    `SELECT id FROM tickets WHERE object_id = ?1 AND state NOT IN ('done','cancelled')`
  ).bind(body.objectId).first<any>();

  const token = randomToken();

  if (existing) {
    // Dedupe: attach this reporter to the live ticket instead of opening a second.
    try {
      await env.DB.prepare(
        `INSERT INTO ticket_reporters (id, ticket_id, tenant_id, locale, token, is_primary, created_at)
         VALUES (?1,?2,?3,?4,?5,0,?6)`
      ).bind(uid(), existing.id, p.kind === "tenant" ? p.tenantId : null, p.kind === "anonymous" ? "de" : (p as any).locale, token, now()).run();
    } catch { /* already a reporter — the unique index did its job */ }
    return json({ id: existing.id, merged: true, token });
  }

  const id = uid();
  const isPrivate = o.room_kind === "private";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access, note, note_locale)
       VALUES (?1,?2,?3,'reported',?4,?5,?6,?7)`
    ).bind(id, body.objectId, body.symptom, now(), isPrivate ? 1 : 0, body.note || null, (p as any).locale || "de"),
    env.DB.prepare(
      `INSERT INTO ticket_reporters (id, ticket_id, tenant_id, locale, token, is_primary, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(uid(), id, p.kind === "tenant" ? p.tenantId : null, (p as any).locale || "de", token, isPrivate ? 1 : 0, now()),
    env.DB.prepare(
      `INSERT INTO ticket_events (ticket_id, to_state, actor_kind, actor_id, reason, created_at)
       VALUES (?1,'reported',?2,?3,'reported',?4)`
    ).bind(id, p.kind === "tenant" ? "tenant" : "system", p.kind === "tenant" ? p.tenantId : null, now()),
  ]);
  return json({ id, merged: false, token });
});

/* --- workflow transitions --------------------------------------- */

route("POST", "/api/tickets/:id/accept", async ({ env, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  await env.DB.batch(transitionStmts(env, t, "accepted", "accepted", p));
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/offer", async ({ env, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const staffId = (p as any).staffId;
  const stmts = [
    env.DB.prepare(`UPDATE slot_offers SET expires_at = ?1 WHERE ticket_id = ?2 AND expires_at > ?1`).bind(now(), t.id),
    ...generateSlots(now()).map((s) =>
      env.DB.prepare(
        `INSERT INTO slot_offers (id, ticket_id, staff_id, starts_at, ends_at, offered_at, expires_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`
      ).bind(uid(), t.id, staffId, s.startsAt, s.endsAt, now(), now() + 5 * DAY)
    ),
    ...transitionStmts(env, t, "slots_offered", "slots_offered", p),
  ];
  await env.DB.batch(stmts);
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/book", async ({ env, req, p, params }) => {
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  if (!mayBookOrConsent(p, t.loc)) return bad("only the room's resident can pick the time", 403);
  const { slotId } = (await req.json()) as { slotId: string };
  const slot = await env.DB.prepare(`SELECT * FROM slot_offers WHERE id = ?1 AND ticket_id = ?2`)
    .bind(slotId, t.id).first<any>();
  if (!slot) return bad("slot not available", 409);
  if (slot.expires_at < now()) return bad("that offer expired", 409);

  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE appointments SET status = 'cancelled_by_tenant', resolved_at = ?1
          WHERE ticket_id = ?2 AND status = 'booked'`
      ).bind(now(), t.id),
      env.DB.prepare(
        `INSERT INTO appointments (id, ticket_id, slot_offer_id, staff_id, starts_at, ends_at, status, booked_by, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,'booked','tenant',?7)`
      ).bind(uid(), t.id, slot.id, slot.staff_id, slot.starts_at, slot.ends_at, now()),
      env.DB.prepare(`UPDATE slot_offers SET expires_at = ?1 WHERE ticket_id = ?2 AND id != ?3 AND expires_at > ?1`)
        .bind(now(), t.id, slot.id),
      ...transitionStmts(env, t, "scheduled", t.reschedule_count > 0 ? "rebooked" : "booked", p),
    ]);
  } catch (e: any) {
    // Only a unique-index violation means "someone else got there first".
    // Anything else is a real bug and must not be disguised as a race.
    if (/UNIQUE constraint failed/i.test(e?.message || "")) {
      return bad("that time was just taken — pick another", 409);
    }
    throw e;
  }
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/reschedule", async ({ env, p, params }) => {
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  if (!mayBookOrConsent(p, t.loc) && !isStaff(p)) return bad("not allowed", 403);
  const appt = await env.DB.prepare(`SELECT * FROM appointments WHERE ticket_id = ?1 AND status='booked'`)
    .bind(t.id).first<any>();
  if (!appt) return bad("no appointment to change", 409);
  if (!isStaff(p) && appt.starts_at - now() < DAY) return bad("under 24 hours — the caretaker has to agree", 409);
  if (!isStaff(p) && t.reschedule_count >= 3) return bad("too many changes — the caretaker will contact you", 409);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE appointments SET status = ?1, resolved_at = ?2 WHERE id = ?3`
    ).bind(isStaff(p) ? "cancelled_by_staff" : "cancelled_by_tenant", now(), appt.id),
    env.DB.prepare(`UPDATE tickets SET reschedule_count = reschedule_count + 1 WHERE id = ?1`).bind(t.id),
    ...generateSlots(now()).map((s) =>
      env.DB.prepare(
        `INSERT INTO slot_offers (id, ticket_id, staff_id, starts_at, ends_at, offered_at, expires_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`
      ).bind(uid(), t.id, appt.staff_id, s.startsAt, s.endsAt, now(), now() + 5 * DAY)
    ),
    ...transitionStmts(env, t, "slots_offered", "reschedule", p),
  ]);
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/no-access", async ({ env, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const appt = await env.DB.prepare(`SELECT * FROM appointments WHERE ticket_id = ?1 AND status='booked'`)
    .bind(t.id).first<any>();
  if (!appt) return bad("no appointment", 409);
  await env.DB.batch([
    env.DB.prepare(`UPDATE appointments SET status='no_access', resolved_at=?1 WHERE id=?2`).bind(now(), appt.id),
    ...generateSlots(now()).map((s) =>
      env.DB.prepare(
        `INSERT INTO slot_offers (id, ticket_id, staff_id, starts_at, ends_at, offered_at, expires_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`
      ).bind(uid(), t.id, appt.staff_id, s.startsAt, s.endsAt, now(), now() + 5 * DAY)
    ),
    ...transitionStmts(env, t, "slots_offered", "no_access", p),
  ]);
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/part", async ({ env, req, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const { what, eta } = (await req.json()) as { what: string; eta?: string };
  if (!what) return bad("describe the part");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO parts_orders (id, ticket_id, description, ordered_at, supplier_eta) VALUES (?1,?2,?3,?4,?5)`
    ).bind(uid(), t.id, what, now(), eta || null),
    env.DB.prepare(`UPDATE appointments SET status='completed', resolved_at=?1 WHERE ticket_id=?2 AND status='booked'`)
      .bind(now(), t.id),
    ...transitionStmts(env, t, "waiting_for_parts", "part_ordered", p),
  ]);
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/part-arrived", async ({ env, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const staffId = (p as any).staffId;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE parts_orders SET arrived_at = ?1 WHERE ticket_id = ?2 AND arrived_at IS NULL`
    ).bind(now(), t.id),
    ...generateSlots(now()).map((s) =>
      env.DB.prepare(
        `INSERT INTO slot_offers (id, ticket_id, staff_id, starts_at, ends_at, offered_at, expires_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`
      ).bind(uid(), t.id, staffId, s.startsAt, s.endsAt, now(), now() + 5 * DAY)
    ),
    ...transitionStmts(env, t, "slots_offered", "part_arrived", p),
  ]);
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/done", async ({ env, req, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const { cause } = (await req.json()) as { cause: string };
  if (!cause) return bad("cause code required");
  await env.DB.batch([
    env.DB.prepare(`UPDATE tickets SET cause = ?1 WHERE id = ?2`).bind(cause, t.id),
    env.DB.prepare(`UPDATE appointments SET status='completed', resolved_at=?1 WHERE ticket_id=?2 AND status='booked'`)
      .bind(now(), t.id),
    env.DB.prepare(`UPDATE slot_offers SET expires_at = ?1 WHERE ticket_id = ?2 AND expires_at > ?1`).bind(now(), t.id),
    ...transitionStmts(env, t, "done", "fixed", p),
  ]);
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/consent", async ({ env, req, p, params }) => {
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  if (!mayBookOrConsent(p, t.loc)) return bad("only the room's resident can consent", 403);
  const { value } = (await req.json()) as { value: boolean };
  await env.DB.prepare(`UPDATE tickets SET access_consent = ?1 WHERE id = ?2`).bind(value ? 1 : 0, t.id).run();
  return json({ ok: true });
});

/* --- dashboard -------------------------------------------------- */

route("GET", "/api/dashboard", async ({ env, p }) => {
  if (p.kind !== "operator") return bad("operator only", 403);
  const yearAgo = now() - 365 * DAY;

  const [open, parts, closed, visits, repeats, buildings] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE state NOT IN ('done','cancelled')`).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE state = 'waiting_for_parts'`).first<any>(),
    env.DB.prepare(
      `SELECT (closed_at - reported_at) AS ms FROM tickets
        WHERE state='done' AND closed_at IS NOT NULL ORDER BY ms`
    ).all<any>(),
    env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM appointments
        WHERE status IN ('completed','no_access') GROUP BY status`
    ).all<any>(),
    env.DB.prepare(
      `SELECT building_code, riser, object_type,
              COUNT(*) AS ticket_count,
              COUNT(DISTINCT room_id) AS rooms_affected,
              SUM(CASE WHEN cause IN ('RISER','WIRING') THEN 1 ELSE 0 END) AS systemic
         FROM v_ticket_location
        WHERE reported_at >= ?1 AND riser IS NOT NULL
        GROUP BY building_code, riser, object_type
       HAVING COUNT(*) >= 3
        ORDER BY ticket_count DESC LIMIT 6`
    ).bind(yearAgo).all<any>(),
    env.DB.prepare(
      `SELECT b.id, b.code, b.name, b.room_count,
              (SELECT COUNT(*) FROM v_ticket_location v
                WHERE v.building_id = b.id AND v.state NOT IN ('done','cancelled')) AS open_count
         FROM buildings b ORDER BY b.code`
    ).all<any>(),
  ]);

  const ms = closed.results.map((r: any) => r.ms);
  const median = ms.length ? ms[Math.floor(ms.length / 2)] / DAY : 0;
  const vc = Object.fromEntries(visits.results.map((r: any) => [r.status, r.n]));
  const total = (vc.completed || 0) + (vc.no_access || 0);

  return json({
    metrics: {
      open: open.n,
      medianDays: median.toFixed(1),
      waitingParts: parts.n,
      failedPct: total ? Math.round((100 * (vc.no_access || 0)) / total) : 0,
    },
    repeats: repeats.results,
    buildings: buildings.results,
  });
});

/* --- dev seed --------------------------------------------------- */

route("POST", "/api/dev/seed", async ({ env }) => {
  if (env.DEMO_MODE !== "true") return bad("disabled", 403);
  await seed(env);
  return json({ ok: true });
});

/* ================================================================ */
/* 6. seed — locations, accounts, and 12 months of history with a    */
/*    deliberately planted drain pattern on Haus C riser 2.          */
/* ================================================================ */

const ROOM_SPEC: Record<string, string[]> = {
  BEDROOM: ["LIGHT", "RADIATOR", "WINDOW", "SOCKET"],
  KITCHEN: ["SINK", "STOVE", "FRIDGE", "LIGHT", "SOCKET"],
  BATHROOM: ["SHOWER", "DRAIN", "LIGHT"],
  HALLWAY: ["LIGHT", "DOOR"],
  LAUNDRY: ["WASHER", "DRAIN", "LIGHT"],
};

async function seed(env: Env) {
  const wipe = [
    "ticket_events", "appointments", "slot_offers", "parts_orders", "ticket_reporters",
    "tickets", "tenancies", "tenant_sessions", "staff_sessions", "staff_buildings",
    "tenants", "staff", "objects", "rooms", "units", "buildings",
  ].map((t) => env.DB.prepare(`DELETE FROM ${t}`));
  await env.DB.batch(wipe);

  const stmts: D1PreparedStatement[] = [];
  const objects: { id: string; type: string; riser: string; roomId: string; roomKind: string }[] = [];

  const buildings = [
    { id: "b-a", code: "A", name: "Haus A", rooms: 180 },
    { id: "b-b", code: "B", name: "Haus B", rooms: 240 },
    { id: "b-c", code: "C", name: "Haus C", rooms: 150 },
  ];
  buildings.forEach((b) =>
    stmts.push(env.DB.prepare(`INSERT INTO buildings (id, code, name, room_count) VALUES (?1,?2,?3,?4)`)
      .bind(b.id, b.code, b.name, b.rooms))
  );

  const addUnit = (bid: string, bcode: string, code: string, floor: number, kind: string,
                   rooms: [string, string, string, string][]) => {
    const uid_ = `u-${bcode}-${code}`;
    stmts.push(env.DB.prepare(`INSERT INTO units (id, building_id, code, floor, kind) VALUES (?1,?2,?3,?4,?5)`)
      .bind(uid_, bid, code, floor, kind));
    rooms.forEach(([rcode, rtype, rkind, riser]) => {
      const rid = `${uid_}-${rcode}`;
      stmts.push(env.DB.prepare(`INSERT INTO rooms (id, unit_id, code, room_type, kind) VALUES (?1,?2,?3,?4,?5)`)
        .bind(rid, uid_, rcode, rtype, rkind));
      ROOM_SPEC[rtype].forEach((otype) => {
        const oid = `${rid}-${otype}`;
        const slug = `${bcode}${code}-${rcode}-${otype}`.toLowerCase();
        stmts.push(env.DB.prepare(
          `INSERT INTO objects (id, room_id, object_type, ordinal, qr_slug, riser) VALUES (?1,?2,?3,1,?4,?5)`
        ).bind(oid, rid, otype, slug, riser));
        objects.push({ id: oid, type: otype, riser, roomId: rid, roomKind: rkind });
      });
    });
    return uid_;
  };

  // The demo resident's WG
  addUnit("b-b", "B", "312", 3, "wg", [
    ["Z1", "BEDROOM", "private", "B-S1"], ["Z2", "BEDROOM", "private", "B-S1"],
    ["Z3", "BEDROOM", "private", "B-S1"], ["Z4", "BEDROOM", "private", "B-S1"],
    ["KU", "KITCHEN", "shared", "B-S1"], ["BA", "BATHROOM", "shared", "B-S1"],
    ["FL", "HALLWAY", "shared", "B-S1"],
  ]);
  addUnit("b-b", "B", "207", 2, "studio", [["Z1", "BEDROOM", "private", "B-S2"], ["BA", "BATHROOM", "private", "B-S2"]]);
  addUnit("b-a", "A", "104", 1, "studio", [["Z1", "BEDROOM", "private", "A-S1"], ["BA", "BATHROOM", "private", "A-S1"]]);
  addUnit("b-a", "A", "COM", 1, "studio", [["FL", "HALLWAY", "shared", "A-S1"]]);
  addUnit("b-c", "C", "COM", 2, "studio", [["FL", "HALLWAY", "shared", "C-S2"], ["WK", "LAUNDRY", "shared", "C-S2"]]);
  for (let i = 1; i <= 8; i++) {
    addUnit("b-c", "C", `20${i}`, 2, "studio", [
      ["Z1", "BEDROOM", "private", "C-S2"], ["BA", "BATHROOM", "private", "C-S2"],
    ]);
  }

  // Accounts
  stmts.push(
    env.DB.prepare(`INSERT INTO tenants (id, email, locale, activated_at) VALUES ('t-z2','z2@wohnheim.test','en',?1)`).bind(now()),
    env.DB.prepare(`INSERT INTO staff (id, email, display_name, locale, is_operator) VALUES ('s-hm','hausmeister@wohnheim.test','K. Neumann','de',0)`),
    env.DB.prepare(`INSERT INTO staff (id, email, display_name, locale, is_operator) VALUES ('s-op','verwaltung@wohnheim.test','Studierendenwerk','de',1)`),
    env.DB.prepare(`INSERT INTO staff_buildings (staff_id, building_id) VALUES ('s-hm','b-a')`),
    env.DB.prepare(`INSERT INTO staff_buildings (staff_id, building_id) VALUES ('s-hm','b-b')`),
    env.DB.prepare(`INSERT INTO staff_buildings (staff_id, building_id) VALUES ('s-hm','b-c')`),
    env.DB.prepare(`INSERT INTO tenancies (id, tenant_id, room_id, starts_on) VALUES ('tn-1','t-z2','u-B-312-Z2',?1)`)
      .bind(now() - 300 * DAY),
  );

  await env.DB.batch(stmts);

  /* ---- history ------------------------------------------------- */
  const hist: D1PreparedStatement[] = [];
  let n = 0;
  const closed = (objId: string, symptom: string, cause: string, daysAgo: number, fixDays: number, failed: boolean) => {
    const id = `h-${++n}`;
    const rep = now() - daysAgo * DAY;
    const fin = rep + fixDays * DAY;
    hist.push(
      env.DB.prepare(
        `INSERT INTO tickets (id, object_id, symptom, state, reported_at, closed_at, needs_access, cause)
         VALUES (?1,?2,?3,'done',?4,?5,1,?6)`
      ).bind(id, objId, symptom, rep, fin, cause),
      env.DB.prepare(
        `INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at)
         VALUES (?1,'done','staff','fixed',?2)`
      ).bind(id, fin),
    );
    if (failed) {
      hist.push(env.DB.prepare(
        `INSERT INTO appointments (id, ticket_id, staff_id, starts_at, ends_at, status, booked_by, created_at, resolved_at)
         VALUES (?1,?2,'s-hm',?3,?4,'no_access','tenant',?5,?6)`
      ).bind(`a-${n}-x`, id, rep + DAY, rep + DAY + 36e5, rep, rep + DAY));
    }
    hist.push(env.DB.prepare(
      `INSERT INTO appointments (id, ticket_id, staff_id, starts_at, ends_at, status, booked_by, created_at, resolved_at)
       VALUES (?1,?2,'s-hm',?3,?4,'completed','tenant',?5,?6)`
    ).bind(`a-${n}`, id, fin, fin + 36e5, rep, fin));
  };

  // The planted pattern: 11 drain tickets on Haus C riser 2, 8 logged as RISER.
  const drains = objects.filter((o) => o.riser === "C-S2" && o.type === "DRAIN");
  const plan: [number, string, number][] = [
    [0, "RISER", 340], [1, "RISER", 310], [2, "BLOCKAGE", 280], [3, "RISER", 240],
    [0, "RISER", 205], [4, "RISER", 170], [5, "BLOCKAGE", 140], [6, "RISER", 96],
    [2, "RISER", 70], [1, "RISER", 44], [4, "BLOCKAGE", 21],
  ];
  plan.forEach(([i, cause, ago], k) => {
    const o = drains[i % drains.length];
    if (o) closed(o.id, "BLOCKED", cause, ago, 2 + (k % 4), k % 3 === 0);
  });

  // Background noise so the pattern has to stand out from something.
  const noise: [string, string, string, string][] = [
    ["A", "LIGHT", "NO_POWER", "CONSUMABLE"], ["A", "RADIATOR", "COLD", "RISER"],
    ["B", "LIGHT", "NO_POWER", "CONSUMABLE"], ["B", "SHOWER", "LEAKING", "SEAL"],
    ["C", "LIGHT", "NO_POWER", "CONSUMABLE"], ["C", "WASHER", "NOISE", "CONSUMABLE"],
    ["B", "WINDOW", "COLD", "SEAL"], ["C", "SOCKET", "NO_POWER", "WIRING"],
  ];
  noise.forEach(([bc, type, sym, cause], i) => {
    const pool = objects.filter((o) => o.id.startsWith(`u-${bc}-`) && o.type === type);
    for (let k = 0; k < 3; k++) {
      const o = pool[(i + k * 2) % pool.length];
      if (o) closed(o.id, sym, cause, 25 + i * 24 + k * 8, 1 + (k % 5), (i + k) % 5 === 0);
    }
  });

  // A second, milder repeat so the dashboard shows a ranking not a single row.
  const aHall = objects.find((o) => o.id === "u-A-COM-FL-LIGHT");
  if (aHall) [200, 160, 120, 84, 50, 18].forEach((ago, i) =>
    closed(aHall.id, "NO_POWER", i < 4 ? "WIRING" : "CONSUMABLE", ago, 1 + (i % 3), false));

  for (let i = 0; i < hist.length; i += 40) await env.DB.batch(hist.slice(i, i + 40));

  /* ---- live tickets -------------------------------------------- */
  const live: D1PreparedStatement[] = [];
  const tmr = (() => { const d = new Date(now() + DAY); d.setHours(10, 0, 0, 0); return d.getTime(); })();

  // Kitchen sink in the demo WG: scheduled, then a part was ordered.
  live.push(
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access, access_consent, note)
       VALUES ('L1','u-B-312-KU-SINK','LEAKING','waiting_for_parts',?1,0,1,'Tropft unter dem Schrank.')`
    ).bind(now() - 2 * DAY),
    env.DB.prepare(`INSERT INTO ticket_reporters (id, ticket_id, tenant_id, locale, token, is_primary, created_at) VALUES ('r1','L1','t-z2','en',?1,1,?2)`)
      .bind(randomToken(), now() - 2 * DAY),
    env.DB.prepare(`INSERT INTO parts_orders (id, ticket_id, description, ordered_at, supplier_eta) VALUES ('p1','L1','Siphon-Dichtung',?1,'KW 34')`)
      .bind(now() - DAY),
    ...(["reported", "accepted", "slots_offered", "scheduled", "waiting_for_parts"] as string[]).map((s, i) =>
      env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L1',?1,'staff',?2,?3)`)
        .bind(s, s, now() - 2 * DAY + i * 6e6)),
    // Bathroom light in A-104: booked for tomorrow
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access)
       VALUES ('L2','u-A-104-BA-LIGHT','NO_POWER','scheduled',?1,1)`
    ).bind(now() - 3 * DAY),
    env.DB.prepare(`INSERT INTO ticket_reporters (id, ticket_id, locale, token, is_primary, created_at) VALUES ('r2','L2','de',?1,1,?2)`)
      .bind(randomToken(), now() - 3 * DAY),
    env.DB.prepare(
      `INSERT INTO appointments (id, ticket_id, staff_id, starts_at, ends_at, status, booked_by, created_at)
       VALUES ('ap2','L2','s-hm',?1,?2,'booked','tenant',?3)`
    ).bind(tmr + 5400e3, tmr + 9000e3, now() - 2 * DAY),
    ...(["reported", "accepted", "slots_offered", "scheduled"] as string[]).map((s, i) =>
      env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L2',?1,'staff',?2,?3)`)
        .bind(s, s, now() - 3 * DAY + i * 6e6)),
    // Common-area hallway light in Haus C: three reporters, no appointment needed
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access)
       VALUES ('L3','u-C-COM-FL-LIGHT','NO_POWER','accepted',?1,0)`
    ).bind(now() - DAY),
    ...[1, 2, 3].map((i) =>
      env.DB.prepare(`INSERT INTO ticket_reporters (id, ticket_id, locale, token, is_primary, created_at) VALUES (?1,'L3','de',?2,0,?3)`)
        .bind(`r3${i}`, randomToken(), now() - DAY)),
    env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L3','reported','system','reported',?1)`).bind(now() - DAY),
    env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L3','accepted','staff','accepted',?1)`).bind(now() - DAY + 36e5),
    // Fresh and untouched
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access, note)
       VALUES ('L4','u-B-207-Z1-RADIATOR','COLD','reported',?1,1,'Wird seit Freitag nicht warm.')`
    ).bind(now() - 6e6),
    env.DB.prepare(`INSERT INTO ticket_reporters (id, ticket_id, locale, token, is_primary, created_at) VALUES ('r4','L4','de',?1,1,?2)`)
      .bind(randomToken(), now() - 6e6),
    env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L4','reported','tenant','reported',?1)`).bind(now() - 6e6),
  );
  for (let i = 0; i < live.length; i += 30) await env.DB.batch(live.slice(i, i + 30));
}

/* ================================================================ */
/* dispatch                                                         */
/* ================================================================ */

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(req);
    }

    // Cookie-based auth means state-changing requests need an origin check.
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== url.host) {
        return bad("cross-origin request rejected", 403);
      }
    }

    try {
      const p = await resolvePrincipal(req, env);
      for (const [method, rx, handler] of routes) {
        if (method !== req.method) continue;
        const m = url.pathname.match(rx);
        if (!m) continue;
        const names: string[] = (rx as any).names || [];
        const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        return await handler({ req, env, p, url, params });
      }
      return bad("no such endpoint", 404);
    } catch (e: any) {
      if (e instanceof HttpError) return bad(e.message, e.status);
      return bad(e?.message || "server error", 500);
    }
  },
};
