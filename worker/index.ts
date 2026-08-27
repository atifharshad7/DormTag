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

import * as admin from "./admin";
import { flushMail, renderMail } from "./mail";
import {
  type Env, type Principal, type RouteCtx,
  now, uid, DAY, json, bad, sha256, randomToken,
  hashNewPassword, derivePassword, sameSecret, readCookie,
  tooManyAttempts, recordAttempt,
  isStaff, HttpError, issueStaffSession, issueTenantSession, sessionResponse, clearCookie,
  queueNotification, readerKey, notificationScope, tenantEmail,
} from "./core";

export type { Env };

/* ================================================================ */
/* 1. helpers                                                       */
/* ================================================================ */

/* ================================================================ */
/* 2. crypto                                                        */
/* ================================================================ */

/* ================================================================ */
/* 3. principal + scoping                                           */
/* ================================================================ */

async function resolvePrincipal(req: Request, env: Env): Promise<Principal> {
  const sid = readCookie(req, "sid");
  if (sid) {
    const row = await env.DB.prepare(
      `SELECT s.id, s.display_name, s.is_operator, s.locale
         FROM staff_sessions ss JOIN staff s ON s.id = ss.staff_id
        WHERE ss.token_hash = ?1 AND ss.revoked_at IS NULL AND ss.expires_at > ?2
          AND s.disabled_at IS NULL`
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
      `SELECT id, ticket_id, is_primary, locale FROM ticket_reporters
        WHERE token = ?1 AND token NOT LIKE 'revoked-%' AND token NOT LIKE 'expired-%'`
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
  scheduled:         ["done", "waiting_for_parts", "slots_offered", "accepted", "cancelled"],
  waiting_for_parts: ["slots_offered", "accepted", "done", "cancelled"],
  done:              [],
  cancelled:         [],
};

function assertTransition(from: State, to: State) {
  if (!TRANSITIONS[from].includes(to)) {
    throw new HttpError(`illegal transition ${from} → ${to}`, 409);
  }
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
/** The hours a caretaker works. Offers must land on this grid. */
/**
 * Appointments sit on whole hours, one hour long.
 *
 * That's a deliberate simplification, not a database workaround: a caretaker
 * offering times on a phone wants to tap "10:00", not fill in a start time and
 * a duration. It also means two visits can never partially overlap, so the
 * booking guard has less to do.
 */
const SLOT_HOURS = [8, 9, 10, 11, 13, 14, 15, 16];

/**
 * Appointment hours are local to the building, not to the server.
 *
 * A Worker runs in UTC, so `new Date(ms).getHours()` on 09:00 Berlin returns 7
 * and every morning slot was rejected as "not offered". Validation therefore
 * converts to the building's zone explicitly.
 */
const BUILDING_TZ = "Europe/Berlin";

const tzParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUILDING_TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit",
});

/** The instant at which it is `hour:00` in the building's zone, `days` from now. */
function buildingHourFromNow(days: number, hour: number): number {
  const off = tzOffsetForInstant(now());
  const shifted = new Date(now() + off);
  const naive = Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + days, hour, 0, 0, 0
  );
  let ms = naive - tzOffsetForInstant(naive);
  return naive - tzOffsetForInstant(ms);
}

function tzOffsetForInstant(ms: number): number {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUILDING_TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = f.formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
}

function localHourMinute(ms: number) {
  const parts = tzParts.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((x) => x.type === type)?.value ?? NaN);
  return { hour: get("hour"), minute: get("minute") };
}
const SLOT_MINUTES = 60;
/**
 * Trades a caretaker hands work to. ELECTRICAL / GAS / HEATING are not a
 * judgement call in Germany — that work requires a qualified firm.
 */
const TRADES = ["ELECTRICAL", "PLUMBING", "HEATING", "LOCKSMITH", "GLAZING", "PEST", "LIFT", "OTHER"];
const ESCALATION_REASONS = ["QUALIFICATION", "TOO_BIG", "SYSTEMIC", "SAFETY", "WARRANTY"];

/**
 * Retention.
 *
 * Closed tickets are never deleted: the room-and-cause history is the whole
 * reason the operator dashboard is worth anything, and once the reporter link is
 * gone it isn't personal data. What does expire is the link to the person —
 * storage limitation applies to that, not to "the drain in C-204 blocked twice".
 */
const RETAIN_REPORTER_DAYS = 365;   // then the reporter link is anonymised
const RETAIN_ATTEMPTS_DAYS = 30;    // login throttling records
const RESIDENT_RECENT_DAYS = 90;    // how long "done" stays in a resident's list

const MAX_OFFERS = 4;
const OFFER_HORIZON_DAYS = 14;

/**
 * Validate caretaker-chosen times. Rejects anything in the past, off-grid, too
 * far out, or duplicated — the client shouldn't be trusted to have done this.
 */
function validateSlots(raw: unknown): { startsAt: number; endsAt: number }[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError("choose at least one time");
  }
  if (raw.length > MAX_OFFERS) {
    throw new HttpError(`at most ${MAX_OFFERS} times`);
  }

  const seen = new Set<number>();
  const out: { startsAt: number; endsAt: number }[] = [];
  for (const v of raw) {
    const ms = Number(typeof v === "object" && v !== null ? (v as any).startsAt : v);
    if (!Number.isFinite(ms)) throw new HttpError("bad time value");

    const { hour, minute } = localHourMinute(ms);
    if (minute !== 0 || ms % 60000 !== 0) {
      throw new HttpError("appointments start on the hour");
    }
    if (!SLOT_HOURS.includes(hour)) {
      throw new HttpError(`${String(hour).padStart(2, "0")}:00 isn't one of the offered hours`);
    }
    if (ms < now()) throw new HttpError("that time is in the past");
    if (ms > now() + OFFER_HORIZON_DAYS * DAY) throw new HttpError("that time is too far ahead");
    if (seen.has(ms)) throw new HttpError("duplicate time");

    seen.add(ms);
    out.push({ startsAt: ms, endsAt: ms + SLOT_MINUTES * 60e3 });
  }
  return out.sort((a, b) => a.startsAt - b.startsAt);
}

/* ================================================================ */
/* demo credentials — shown on the login page only when DEMO_MODE is on.  */
/* They are real credentials against real accounts: the reviewer signs in */
/* through the production login path, not a role switch.                 */
/* ================================================================ */

const DEMO_STAFF_PASSWORD = "hausmeister-demo-2026";
const DEMO_OPERATOR_PASSWORD = "verwaltung-demo-2026";
const DEMO_RESIDENT_CODE = "B312-Z2-DEMO";

const DEMO_HINTS = {
  resident: { code: DEMO_RESIDENT_CODE },
  staff: { email: "hausmeister@wohnheim.test", password: DEMO_STAFF_PASSWORD },
  operator: { email: "verwaltung@wohnheim.test", password: DEMO_OPERATOR_PASSWORD },
};

/* ================================================================ */
/* 5. routes                                                        */
/* ================================================================ */

type Ctx = RouteCtx;

const routes: [string, RegExp, (c: Ctx) => Promise<Response>][] = [];
const route = (method: string, pattern: string, fn: (c: Ctx) => Promise<Response>) => {
  const names: string[] = [];
  const rx = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return "([^/]+)"; }) + "$");
  routes.push([method, rx, async (c) => fn(c)]);
  (rx as any).names = names;
};

/** Staff and operators: email + password. Role comes from the account, never the request. */
route("POST", "/api/auth/staff", async ({ req, env }) => {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !password) return bad("email and password required");

  if (await tooManyAttempts(env, email)) {
    return bad("too many attempts — wait 15 minutes", 429);
  }

  const row = await env.DB.prepare(
    `SELECT id, password_hash, password_salt FROM staff
      WHERE email = ?1 AND disabled_at IS NULL`
  ).bind(email.trim().toLowerCase()).first<any>();

  // Always do the derivation, even for an unknown email, so response time
  // doesn't reveal whether the account exists.
  const salt = row?.password_salt ?? "00000000000000000000000000000000";
  const attempt = await derivePassword(password, salt);

  if (!row || !row.password_hash || !sameSecret(attempt, row.password_hash)) {
    await recordAttempt(env, email, false);
    return bad("wrong email or password", 401);
  }

  await recordAttempt(env, email, true);
  return sessionResponse("sid", await issueStaffSession(env, row.id));
});

/**
 * Residents: an activation code, the way a welcome letter or move-in pack would
 * carry it. No password for someone who signs in twice a year.
 */
route("POST", "/api/auth/resident", async ({ req, env }) => {
  const { code } = (await req.json()) as { code?: string };
  if (!code) return bad("activation code required");
  const clean = code.trim().toUpperCase();

  if (await tooManyAttempts(env, "code:" + clean)) {
    return bad("too many attempts — wait 15 minutes", 429);
  }

  const row = await env.DB.prepare(
    `SELECT t.id FROM tenants t
       JOIN tenancies tn ON tn.tenant_id = t.id AND tn.ends_on IS NULL
      WHERE t.activation_code = ?1`
  ).bind(clean).first<any>();

  if (!row) {
    await recordAttempt(env, "code:" + clean, false);
    return bad("that code isn't valid", 401);
  }

  await recordAttempt(env, "code:" + clean, true);
  await env.DB.prepare(`UPDATE tenants SET activated_at = COALESCE(activated_at, ?1) WHERE id = ?2`)
    .bind(now(), row.id).run();
  return sessionResponse("tid", await issueTenantSession(env, row.id));
});

route("POST", "/api/session/logout", async () => {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", clearCookie("sid"));
  headers.append("set-cookie", clearCookie("tid"));
  return new Response(JSON.stringify({ ok: true }), { headers });
});

/* --- stickers + picker ------------------------------------------ */

route("GET", "/api/r/:slug", async ({ env, params }) => {
  const slug = params.slug.toLowerCase();

  // Room sticker: the normal case. Object sticker: only printed where a room
  // holds several of the same type, so the resident can say which one.
  const room = await env.DB.prepare(
    `SELECT r.id AS room_id, r.room_type, r.kind AS room_kind, r.code AS room_code,
            u.code AS unit_code, u.is_common, b.code AS building_code
       FROM rooms r JOIN units u ON u.id = r.unit_id JOIN buildings b ON b.id = u.building_id
      WHERE r.qr_slug = ?1`
  ).bind(slug).first<any>();

  let target: any = null;
  let scope = room;

  if (!room) {
    const obj = await env.DB.prepare(
      `SELECT o.id, o.object_type, o.ordinal, o.riser,
              r.id AS room_id, r.room_type, r.kind AS room_kind, r.code AS room_code,
              u.code AS unit_code, u.is_common, b.code AS building_code
         FROM objects o JOIN rooms r ON r.id = o.room_id
         JOIN units u ON u.id = r.unit_id JOIN buildings b ON b.id = u.building_id
        WHERE o.qr_slug = ?1`
    ).bind(slug).first<any>();
    if (!obj) return bad("unknown sticker", 404);
    target = obj;
    scope = obj;
  }

  const siblings = await env.DB.prepare(
    `SELECT id, object_type, ordinal, qr_slug FROM objects
      WHERE room_id = ?1 ORDER BY object_type, ordinal`
  ).bind(scope.room_id).all<any>();

  return json({
    // `object` is null for a room sticker: the resident picks from `siblings`.
    object: target,
    room: {
      id: scope.room_id, room_type: scope.room_type, room_kind: scope.room_kind,
      room_code: scope.room_code, unit_code: scope.unit_code,
      building_code: scope.building_code, is_common: scope.is_common,
    },
    siblings: siblings.results,
  });
});

/**
 * Printable sticker sheet for one building. Staff-only, because the slug set
 * is effectively a map of every fixture in the estate.
 *
 * A caretaker gets their own buildings; an operator gets any.
 */
route("GET", "/api/stickers/:buildingCode", async ({ env, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);

  const b = await env.DB.prepare(`SELECT id, code, name FROM buildings WHERE code = ?1`)
    .bind(params.buildingCode.toUpperCase()).first<any>();
  if (!b) return bad("unknown building", 404);
  if (p.kind === "staff" && !p.buildingIds.includes(b.id)) {
    return bad("not one of your buildings", 403);
  }

  // One sticker per room.
  const rooms = await env.DB.prepare(
    `SELECT r.qr_slug, r.room_type, r.code AS room_code, r.kind AS room_kind,
            r.label AS room_label,
            u.code AS unit_code, u.floor, u.is_common
       FROM rooms r JOIN units u ON u.id = r.unit_id
      WHERE u.building_id = ?1 AND r.qr_slug IS NOT NULL
      ORDER BY u.floor, u.code, r.code`
  ).bind(b.id).all<any>();

  // Plus one per object, but only where a room holds several of the same type.
  const extras = await env.DB.prepare(
    `SELECT o.qr_slug, o.object_type, o.ordinal, r.room_type, r.code AS room_code,
            r.label AS room_label,
            u.code AS unit_code, u.floor, u.is_common
       FROM objects o
       JOIN rooms r ON r.id = o.room_id
       JOIN units u ON u.id = r.unit_id
      WHERE u.building_id = ?1
        AND (SELECT COUNT(*) FROM objects o2
              WHERE o2.room_id = o.room_id AND o2.object_type = o.object_type) > 1
      ORDER BY u.floor, u.code, r.code, o.object_type, o.ordinal`
  ).bind(b.id).all<any>();

  return json({
    building: b,
    stickers: [
      ...rooms.results.map((r: any) => ({ ...r, kind: "room" })),
      ...extras.results.map((o: any) => ({ ...o, kind: "object" })),
    ],
  });
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
    `SELECT vtl.*, t.needs_access, t.access_consent, t.note, t.symptom, t.reschedule_count, t.handling,
            (SELECT trade FROM escalations e
              WHERE e.ticket_id = t.id AND e.closed_at IS NULL) AS trade,
            (SELECT commissioned_at FROM escalations e
              WHERE e.ticket_id = t.id AND e.closed_at IS NULL) AS commissioned_at,
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
  const [events, slots, appts, parts, reporters, escalation] = await Promise.all([
    env.DB.prepare(`SELECT * FROM ticket_events WHERE ticket_id = ?1 ORDER BY created_at, id`).bind(params.id).all<any>(),
    env.DB.prepare(
      `SELECT so.* FROM slot_offers so
        WHERE so.ticket_id = ?1 AND so.expires_at > ?2 AND so.starts_at > ?2
          AND NOT EXISTS (SELECT 1 FROM appointments a
                           WHERE a.slot_offer_id = so.id AND a.status = 'booked')
        ORDER BY so.starts_at`
    ).bind(params.id, now()).all<any>(),
    env.DB.prepare(`SELECT * FROM appointments WHERE ticket_id = ?1 ORDER BY created_at`).bind(params.id).all<any>(),
    env.DB.prepare(`SELECT * FROM parts_orders WHERE ticket_id = ?1 ORDER BY ordered_at DESC`).bind(params.id).all<any>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM ticket_reporters WHERE ticket_id = ?1`).bind(params.id).first<any>(),
    env.DB.prepare(`SELECT * FROM escalations WHERE ticket_id = ?1 ORDER BY raised_at DESC LIMIT 1`)
      .bind(params.id).first<any>(),
  ]);
  return json({
    ticket: t, loc: t.loc,
    events: events.results, slots: slots.results, appointments: appts.results,
    parts: parts.results, reporterCount: reporters.n,
    escalation: escalation && !escalation.closed_at ? escalation : null,
    canBook: mayBookOrConsent(p, t.loc),
  });
});

route("POST", "/api/tickets", async ({ env, req, p }) => {
  const body = (await req.json()) as { objectId: string; symptom: string; note?: string };
  if (!body.objectId || !body.symptom) return bad("objectId and symptom required");

  const o = await env.DB.prepare(
    `SELECT o.id, r.kind AS room_kind, r.unit_id, r.id AS room_id,
            u.is_common, u.building_id
       FROM objects o
       JOIN rooms r ON r.id = o.room_id
       JOIN units u ON u.id = r.unit_id
      WHERE o.id = ?1`
  ).bind(body.objectId).first<any>();
  if (!o) return bad("unknown object", 404);

  // Shared space — kitchen, corridor, laundry — is reportable by anyone who
  // notices it, signed in or not. The person who spots a dead corridor light
  // may not live on that floor, and being signed in must never restrict more
  // than staying anonymous does.
  //
  // Private rooms are different: a session is required, and it has to belong to
  // the same unit. A flatmate may report your radiator (that's how faults get
  // caught), but a stranger cannot file against your bedroom.
  if (o.room_kind === "private") {
    if (p.kind === "anonymous") return bad("sign in to report your own room", 403);
    if (p.kind === "tenant" && o.unit_id !== p.unitId) {
      return bad("that room is in another flat", 403);
    }
  }

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
  // Anything inside a dwelling needs somebody to open the door, shared or not.
  // Only genuine common areas (stairwell, laundry) need no appointment.
  const needsAccess = o.is_common ? 0 : 1;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access, note, note_locale)
       VALUES (?1,?2,?3,'reported',?4,?5,?6,?7)`
    ).bind(id, body.objectId, body.symptom, now(), needsAccess, body.note || null, (p as any).locale || "de"),
    env.DB.prepare(
      `INSERT INTO ticket_reporters (id, ticket_id, tenant_id, locale, token, is_primary, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(uid(), id, p.kind === "tenant" ? p.tenantId : null, (p as any).locale || "de", token, isPrivate ? 1 : 0, now()),
    env.DB.prepare(
      `INSERT INTO ticket_events (ticket_id, to_state, actor_kind, actor_id, reason, created_at)
       VALUES (?1,'reported',?2,?3,'reported',?4)`
    ).bind(id, p.kind === "tenant" ? "tenant" : "system", p.kind === "tenant" ? p.tenantId : null, now()),
    ...tellStaff(env, o.building_id, id, "reported", { symptom: body.symptom }),
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

/**
 * Offer appointment times. The caretaker picks them; `slots` is a list of epoch
 * milliseconds. Omitting it falls back to generated times, which is what the
 * automatic re-offer paths rely on.
 *
 * Re-offering while already in slots_offered replaces the previous set without
 * a state change — a caretaker correcting their availability isn't a workflow
 * transition.
 */
route("POST", "/api/tickets/:id/offer", async ({ env, req, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const staffId = (p as any).staffId;

  let body: any = {};
  try { body = await req.json(); } catch { /* handled by validateSlots */ }
  // No generated fallback: the app must never invent a caretaker's availability.
  const chosen = validateSlots(body?.slots);

  // Don't offer a time that overlaps something this caretaker is already
  // committed to. Now that times are free-form, equality isn't enough.
  const busy = await env.DB.prepare(
    `SELECT starts_at, ends_at FROM appointments
      WHERE staff_id = ?1 AND status = 'booked' AND ends_at > ?2`
  ).bind(staffId, now()).all<any>();
  const free = chosen.filter((c) =>
    !busy.results.some((b: any) => c.startsAt < b.ends_at && c.endsAt > b.starts_at));
  if (free.length === 0) return bad("you're already booked at all of those times", 409);

  const stmts = [
    env.DB.prepare(`UPDATE slot_offers SET expires_at = ?1 WHERE ticket_id = ?2 AND expires_at > ?1`)
      .bind(now(), t.id),
    ...free.map((s) =>
      env.DB.prepare(
        `INSERT INTO slot_offers (id, ticket_id, staff_id, starts_at, ends_at, offered_at, expires_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`
      ).bind(uid(), t.id, staffId, s.startsAt, s.endsAt, now(), now() + 7 * DAY)
    ),
  ];
  // Already offering? Replace the set, don't re-transition.
  if (t.state !== "slots_offered") {
    stmts.push(...transitionStmts(env, t, "slots_offered", "slots_offered", p));
  }
  stmts.push(...(await tellTenant(env, t.id, "slots_offered", { count: free.length })));
  await env.DB.batch(stmts);
  return json({ ok: true, offered: free.length, skipped: chosen.length - free.length });
});

/** The caretaker's own committed times, so the picker can grey them out. */
route("GET", "/api/my-schedule", async ({ env, p }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  const rows = await env.DB.prepare(
    `SELECT starts_at, ends_at FROM appointments
      WHERE staff_id = ?1 AND status = 'booked' AND starts_at >= ?2
      ORDER BY starts_at`
  ).bind((p as any).staffId, now()).all<any>();
  return json({ busy: rows.results, hours: SLOT_HOURS, maxOffers: MAX_OFFERS, horizonDays: OFFER_HORIZON_DAYS });
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

  /**
   * Claim the slot in ONE statement.
   *
   * Times are free-form now, so two appointments can overlap without sharing a
   * start time — which a unique index on (staff_id, starts_at) cannot catch.
   * A read-then-write check would race. `INSERT ... SELECT ... WHERE NOT EXISTS`
   * evaluates the guard and performs the write atomically inside SQLite, so a
   * second request arriving in the same millisecond simply inserts nothing.
   */
  let claimed;
  try {
    claimed = await env.DB.prepare(
      `INSERT INTO appointments
         (id, ticket_id, slot_offer_id, staff_id, starts_at, ends_at, status, booked_by, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'booked', 'tenant', ?7
        WHERE NOT EXISTS (
                SELECT 1 FROM appointments a
                 WHERE a.staff_id = ?4 AND a.status = 'booked'
                   AND a.starts_at < ?6 AND a.ends_at > ?5)
          AND NOT EXISTS (
                SELECT 1 FROM appointments b
                 WHERE b.ticket_id = ?2 AND b.status = 'booked')
          AND NOT EXISTS (
                SELECT 1 FROM appointments c
                 WHERE c.slot_offer_id = ?3 AND c.status = 'booked')`
    ).bind(uid(), t.id, slot.id, slot.staff_id, slot.starts_at, slot.ends_at, now()).run();
  } catch (e: any) {
    if (/UNIQUE constraint failed/i.test(e?.message || "")) {
      return bad("that time was just taken — pick another", 409);
    }
    throw e;
  }

  if (!claimed.meta.changes) {
    // Three different reasons, and telling them apart matters: "already taken"
    // sends the resident looking for another time, which is useless advice if
    // the real problem is that this ticket already has an appointment.
    const already = await env.DB.prepare(
      `SELECT starts_at FROM appointments WHERE ticket_id = ?1 AND status = 'booked'`
    ).bind(t.id).first<any>();
    if (already) return bad("this report already has an appointment", 409);
    return bad("that time was just taken — pick another", 409);
  }

  // Other offered times stay open: if the resident later changes their mind,
  // they pick from what the caretaker already agreed to.
  await env.DB.batch([
    ...transitionStmts(env, t, "scheduled", t.reschedule_count > 0 ? "rebooked" : "booked", p),
    ...tellStaff(env, t.loc.building_id, t.id,
      t.reschedule_count > 0 ? "rebooked" : "booked", { startsAt: slot.starts_at }),
  ]);
  return json({ ok: true });
});

/**
 * Times the caretaker has offered that are still choosable: not expired, not in
 * the past, and not already claimed by a live appointment.
 */
async function remainingOffers(env: Env, ticketId: string, excludeSlotId?: string | null) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM slot_offers so
      WHERE so.ticket_id = ?1 AND so.expires_at > ?2 AND so.starts_at > ?2
        AND (?3 IS NULL OR so.id != ?3)
        AND NOT EXISTS (SELECT 1 FROM appointments a
                         WHERE a.slot_offer_id = so.id AND a.status = 'booked')`
  ).bind(ticketId, now(), excludeSlotId ?? null).first<any>();
  return (r?.n as number) ?? 0;
}

route("POST", "/api/tickets/:id/reschedule", async ({ env, p, params }) => {
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  if (!mayBookOrConsent(p, t.loc) && !isStaff(p)) return bad("not allowed", 403);
  const appt = await env.DB.prepare(`SELECT * FROM appointments WHERE ticket_id = ?1 AND status='booked'`)
    .bind(t.id).first<any>();
  if (!appt) return bad("no appointment to change", 409);
  if (!isStaff(p) && appt.starts_at - now() < DAY) return bad("under 24 hours — the caretaker has to agree", 409);
  if (!isStaff(p) && t.reschedule_count >= 3) return bad("too many changes — the caretaker will contact you", 409);

  // Reuse what the caretaker already agreed to. If he offered only the one
  // time, there is nothing left to choose and he has to propose new times —
  // the app must not invent them.
  const left = await remainingOffers(env, t.id, appt.slot_offer_id);
  const back: State = left > 0 ? "slots_offered" : "accepted";

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE appointments SET status = ?1, resolved_at = ?2 WHERE id = ?3`
    ).bind(isStaff(p) ? "cancelled_by_staff" : "cancelled_by_tenant", now(), appt.id),
    env.DB.prepare(`UPDATE tickets SET reschedule_count = reschedule_count + 1 WHERE id = ?1`).bind(t.id),
    env.DB.prepare(
      `UPDATE slot_offers SET expires_at = ?1 WHERE id = ?2`
    ).bind(now(), appt.slot_offer_id),
    ...transitionStmts(env, t, back, left > 0 ? "reschedule" : "needs_times", p),
    ...(isStaff(p)
      ? await tellTenant(env, t.id, "staff_cancelled", { remaining: left })
      : tellStaff(env, t.loc.building_id, t.id, "tenant_rescheduled", {})),
  ]);
  return json({ ok: true, remaining: left });
});

route("POST", "/api/tickets/:id/no-access", async ({ env, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const appt = await env.DB.prepare(`SELECT * FROM appointments WHERE ticket_id = ?1 AND status='booked'`)
    .bind(t.id).first<any>();
  if (!appt) return bad("no appointment", 409);
  const left = await remainingOffers(env, t.id, appt.slot_offer_id);
  const back: State = left > 0 ? "slots_offered" : "accepted";

  await env.DB.batch([
    env.DB.prepare(`UPDATE appointments SET status='no_access', resolved_at=?1 WHERE id=?2`).bind(now(), appt.id),
    env.DB.prepare(
      `UPDATE slot_offers SET expires_at = ?1 WHERE id = ?2`
    ).bind(now(), appt.slot_offer_id),
    ...transitionStmts(env, t, back, "no_access", p),
  ]);
  return json({ ok: true, remaining: left });
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
    ...(await tellTenant(env, t.id, "part_ordered", { part: what, eta: eta || null })),
  ]);
  return json({ ok: true });
});

route("POST", "/api/tickets/:id/part-arrived", async ({ env, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  const left = await remainingOffers(env, t.id);
  const back: State = left > 0 ? "slots_offered" : "accepted";

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE parts_orders SET arrived_at = ?1 WHERE ticket_id = ?2 AND arrived_at IS NULL`
    ).bind(now(), t.id),
    ...transitionStmts(env, t, back, "part_arrived", p),
    ...(await tellTenant(env, t.id, "part_arrived", {})),
  ]);
  return json({ ok: true, remaining: left });
});

/**
 * Hand the job to an external trade.
 *
 * The caretaker raises it; the operator commissions the firm, because that's
 * who holds the budget and the contracts. The ticket stays open and still needs
 * an appointment eventually — escalation changes who does the work, not what
 * stage the work is at.
 */
route("POST", "/api/tickets/:id/escalate", async ({ env, req, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const t = await loadTicket(env, params.id);
  if (t.state === "done" || t.state === "cancelled") return bad("that ticket is closed", 409);
  if (t.handling === "external") return bad("already with an external trade", 409);

  const { trade, reason, note } = (await req.json()) as
    { trade: string; reason: string; note?: string };
  if (!TRADES.includes(trade)) return bad("unknown trade");
  if (!ESCALATION_REASONS.includes(reason)) return bad("unknown reason");

  // Any appointment the caretaker had booked is no longer his to keep.
  const appt = await env.DB.prepare(
    `SELECT id, slot_offer_id FROM appointments WHERE ticket_id = ?1 AND status = 'booked'`
  ).bind(t.id).first<any>();

  const stmts = [
    env.DB.prepare(`UPDATE tickets SET handling = 'external' WHERE id = ?1`).bind(t.id),
    env.DB.prepare(
      `INSERT INTO escalations (id, ticket_id, trade, reason, note, raised_by, raised_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(uid(), t.id, trade, reason, note || null, (p as any).staffId, now()),
    env.DB.prepare(
      `INSERT INTO ticket_events (ticket_id, from_state, to_state, actor_kind, actor_id, reason, created_at)
       VALUES (?1,?2,?2,'staff',?3,?4,?5)`
    ).bind(t.id, t.state, (p as any).staffId, "escalated_" + trade.toLowerCase(), now()),
  ];
  if (appt) {
    stmts.push(
      env.DB.prepare(`UPDATE appointments SET status='cancelled_by_staff', resolved_at=?1 WHERE id=?2`)
        .bind(now(), appt.id),
      env.DB.prepare(`UPDATE slot_offers SET expires_at = ?1 WHERE id = ?2`).bind(now(), appt.slot_offer_id)
    );
  }
  stmts.push(queueNotification(env, { audience: "operator" }, "escalated", t.id, { trade, reason }));
  stmts.push(...(await tellTenant(env, t.id, "escalated", { trade })));
  await env.DB.batch(stmts);
  return json({ ok: true, trade, reason });
});

/** The operator commissions the firm and records the order reference. */
route("POST", "/api/tickets/:id/commission", async ({ env, req, p, params }) => {
  if (p.kind !== "operator") return bad("operator only", 403);
  const esc = await env.DB.prepare(
    `SELECT * FROM escalations WHERE ticket_id = ?1 AND closed_at IS NULL`
  ).bind(params.id).first<any>();
  if (!esc) return bad("nothing to commission", 409);

  const { contractor, reference } = (await req.json()) as
    { contractor: string; reference?: string };
  if (!contractor?.trim()) return bad("name the firm");

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE escalations SET commissioned_at = ?1, contractor = ?2, reference = ?3 WHERE id = ?4`
    ).bind(now(), contractor.trim(), reference?.trim() || null, esc.id),
    env.DB.prepare(
      `INSERT INTO ticket_events (ticket_id, from_state, to_state, actor_kind, actor_id, reason, created_at)
       SELECT ?1, state, state, 'staff', ?2, 'commissioned', ?3 FROM tickets WHERE id = ?1`
    ).bind(params.id, (p as any).staffId, now()),
  ]);
  return json({ ok: true });
});

/** Wrong call, or the firm handed it back. Returns the job to the caretaker. */
route("POST", "/api/tickets/:id/deescalate", async ({ env, p, params }) => {
  if (!isStaff(p)) return bad("staff only", 403);
  await assertVisible(env, p, params.id);
  const esc = await env.DB.prepare(
    `SELECT id FROM escalations WHERE ticket_id = ?1 AND closed_at IS NULL`
  ).bind(params.id).first<any>();
  if (!esc) return bad("not with an external trade", 409);

  await env.DB.batch([
    env.DB.prepare(`UPDATE escalations SET closed_at = ?1 WHERE id = ?2`).bind(now(), esc.id),
    env.DB.prepare(`UPDATE tickets SET handling = 'caretaker' WHERE id = ?1`).bind(params.id),
    env.DB.prepare(
      `INSERT INTO ticket_events (ticket_id, from_state, to_state, actor_kind, actor_id, reason, created_at)
       SELECT ?1, state, state, 'staff', ?2, 'returned_to_caretaker', ?3 FROM tickets WHERE id = ?1`
    ).bind(params.id, (p as any).staffId, now()),
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
    env.DB.prepare(`UPDATE escalations SET closed_at = ?1 WHERE ticket_id = ?2 AND closed_at IS NULL`)
      .bind(now(), t.id),
    // A live link into a finished ticket is risk with no upside. There's no
    // expiry column, and there doesn't need to be: overwriting the token is what
    // actually revokes it, and the value stays unique per row.
    env.DB.prepare(
      `UPDATE ticket_reporters SET token = 'revoked-' || id
        WHERE ticket_id = ?1 AND token NOT LIKE 'revoked-%' AND token NOT LIKE 'expired-%'`
    ).bind(t.id),
    env.DB.prepare(`UPDATE appointments SET status='completed', resolved_at=?1 WHERE ticket_id=?2 AND status='booked'`)
      .bind(now(), t.id),
    env.DB.prepare(`UPDATE slot_offers SET expires_at = ?1 WHERE ticket_id = ?2 AND expires_at > ?1`).bind(now(), t.id),
    ...transitionStmts(env, t, "done", "fixed", p),
    ...(await tellTenant(env, t.id, "fixed", { cause })),
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

const RANGE_MONTHS = [1, 3, 6, 12];

/**
 * One expression for the month bucket, used by the trend chart and by the
 * per-month drill-down, so a bar and its detail can never disagree.
 */
const MONTH_BUCKET = `strftime('%Y-%m', vtl.reported_at / 1000, 'unixepoch')`;

/** Shared filter parsing for the dashboard and its drill-down lists. */
function dashboardFilter(url: URL) {
  const months = RANGE_MONTHS.includes(Number(url.searchParams.get("months")))
    ? Number(url.searchParams.get("months"))
    : 12;
  const building = (url.searchParams.get("building") || "").toUpperCase() || null;
  return { months, building, since: now() - months * 30 * DAY };
}

/** `AND building_code = ?` only when a building is selected. */
const buildingClause = (building: string | null, alias = "vtl") =>
  building ? `AND ${alias}.building_code = ?` : "";

route("GET", "/api/dashboard", async ({ env, p, url }) => {
  if (p.kind !== "operator") return bad("operator only", 403);
  const { months, building, since } = dashboardFilter(url);
  const bBind = building ? [building] : [];
  const bc = buildingClause(building);

  const [open, parts, closed, visits, repeats, buildings, trend, byType, external] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM v_ticket_location vtl
        WHERE vtl.state NOT IN ('done','cancelled') ${bc}`
    ).bind(...bBind).first<any>(),

    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM v_ticket_location vtl
        WHERE vtl.state = 'waiting_for_parts' ${bc}`
    ).bind(...bBind).first<any>(),

    env.DB.prepare(
      `SELECT (vtl.closed_at - vtl.reported_at) AS ms FROM v_ticket_location vtl
        WHERE vtl.state = 'done' AND vtl.closed_at IS NOT NULL
          AND vtl.closed_at >= ? ${bc}
        ORDER BY ms`
    ).bind(since, ...bBind).all<any>(),

    env.DB.prepare(
      `SELECT a.status, COUNT(*) AS n
         FROM appointments a JOIN v_ticket_location vtl ON vtl.ticket_id = a.ticket_id
        WHERE a.status IN ('completed','no_access') AND a.starts_at >= ? ${bc}
        GROUP BY a.status`
    ).bind(since, ...bBind).all<any>(),

    env.DB.prepare(
      `SELECT vtl.building_code, vtl.riser, vtl.object_type,
              COUNT(*) AS ticket_count,
              COUNT(DISTINCT vtl.room_id) AS rooms_affected,
              SUM(CASE WHEN vtl.cause IN ('RISER','WIRING') THEN 1 ELSE 0 END) AS systemic
         FROM v_ticket_location vtl
        WHERE vtl.reported_at >= ? AND vtl.riser IS NOT NULL ${bc}
        GROUP BY vtl.building_code, vtl.riser, vtl.object_type
       HAVING COUNT(*) >= 3
        ORDER BY ticket_count DESC LIMIT 6`
    ).bind(since, ...bBind).all<any>(),

    env.DB.prepare(
      `SELECT b.id, b.code, b.name, b.room_count,
              (SELECT COUNT(*) FROM v_ticket_location v
                WHERE v.building_id = b.id AND v.state NOT IN ('done','cancelled')) AS open_count,
              (SELECT COUNT(*) FROM v_ticket_location v
                WHERE v.building_id = b.id AND v.reported_at >= ?1) AS reported_count,
              -- Shown on the card so a building with nobody covering it is
              -- visible where the operator already looks, not in a settings page.
              (SELECT GROUP_CONCAT(s.display_name, ', ')
                 FROM staff_buildings sb JOIN staff s ON s.id = sb.staff_id
                WHERE sb.building_id = b.id AND s.disabled_at IS NULL AND s.is_operator = 0
              ) AS caretaker_names
         FROM buildings b ORDER BY b.code`
    ).bind(since).all<any>(),

    // Monthly reported vs. fixed, for the trend chart.
    env.DB.prepare(
      `SELECT ${MONTH_BUCKET} AS bucket,
              COUNT(*) AS reported,
              SUM(CASE WHEN vtl.state = 'done' THEN 1 ELSE 0 END) AS fixed,
              SUM(CASE WHEN vtl.state NOT IN ('done','cancelled') THEN 1 ELSE 0 END) AS still_open
         FROM v_ticket_location vtl
        WHERE vtl.reported_at >= ? ${bc}
        GROUP BY bucket ORDER BY bucket`
    ).bind(since, ...bBind).all<any>(),

    env.DB.prepare(
      `SELECT vtl.object_type, COUNT(*) AS n
         FROM v_ticket_location vtl
        WHERE vtl.reported_at >= ? ${bc}
        GROUP BY vtl.object_type ORDER BY n DESC LIMIT 8`
    ).bind(since, ...bBind).all<any>(),

    // Work handed to an external trade, split by whether it's been commissioned.
    env.DB.prepare(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN e.commissioned_at IS NULL THEN 1 ELSE 0 END) AS uncommissioned
         FROM tickets t
         JOIN escalations e ON e.ticket_id = t.id AND e.closed_at IS NULL
         JOIN v_ticket_location vtl ON vtl.ticket_id = t.id
        WHERE t.state NOT IN ('done','cancelled') ${bc}`
    ).bind(...bBind).first<any>(),
  ]);

  const ms = closed.results.map((r: any) => r.ms);
  const median = ms.length ? ms[Math.floor(ms.length / 2)] / DAY : 0;
  const vc = Object.fromEntries(visits.results.map((r: any) => [r.status, r.n]));
  const visitTotal = (vc.completed || 0) + (vc.no_access || 0);

  return json({
    filter: { months, building, ranges: RANGE_MONTHS },
    metrics: {
      open: open.n,
      medianDays: median.toFixed(1),
      waitingParts: parts.n,
      failedPct: visitTotal ? Math.round((100 * (vc.no_access || 0)) / visitTotal) : 0,
      closedCount: ms.length,
      failedCount: vc.no_access || 0,
      external: external?.n ?? 0,
      awaitingCommission: external?.uncommissioned ?? 0,
    },
    trend: trend.results,
    byType: byType.results,
    repeats: repeats.results,
    buildings: buildings.results.map((b: any) => ({
      ...b,
      caretakers: b.caretaker_names
        ? String(b.caretaker_names).split(", ").map((name: string) => ({ name }))
        : [],
    })),
  });
});

/**
 * Everything behind one bar of the trend chart.
 *
 * Same month expression as the chart itself, so the numbers on the bar and the
 * numbers in the panel are computed the same way rather than nearly the same way.
 */
route("GET", "/api/dashboard/month", async ({ env, p, url }) => {
  if (p.kind !== "operator") return bad("operator only", 403);
  const bucket = url.searchParams.get("bucket") || "";
  if (!/^\d{4}-\d{2}$/.test(bucket)) return bad("bucket must look like 2026-08");

  const { building } = dashboardFilter(url);
  const bBind = building ? [building] : [];
  const bc = buildingClause(building);

  const [totals, closed, byBuilding, byType, byCause, tickets] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS reported,
              SUM(CASE WHEN vtl.state = 'done' THEN 1 ELSE 0 END) AS fixed,
              SUM(CASE WHEN vtl.state NOT IN ('done','cancelled') THEN 1 ELSE 0 END) AS still_open
         FROM v_ticket_location vtl
        WHERE ${MONTH_BUCKET} = ? ${bc}`
    ).bind(bucket, ...bBind).first<any>(),

    env.DB.prepare(
      `SELECT (vtl.closed_at - vtl.reported_at) AS ms
         FROM v_ticket_location vtl
        WHERE ${MONTH_BUCKET} = ? AND vtl.closed_at IS NOT NULL ${bc}
        ORDER BY ms`
    ).bind(bucket, ...bBind).all<any>(),

    env.DB.prepare(
      `SELECT vtl.building_code, COUNT(*) AS n
         FROM v_ticket_location vtl
        WHERE ${MONTH_BUCKET} = ? ${bc}
        GROUP BY vtl.building_code ORDER BY n DESC`
    ).bind(bucket, ...bBind).all<any>(),

    env.DB.prepare(
      `SELECT vtl.object_type, COUNT(*) AS n
         FROM v_ticket_location vtl
        WHERE ${MONTH_BUCKET} = ? ${bc}
        GROUP BY vtl.object_type ORDER BY n DESC LIMIT 6`
    ).bind(bucket, ...bBind).all<any>(),

    env.DB.prepare(
      `SELECT vtl.cause, COUNT(*) AS n
         FROM v_ticket_location vtl
        WHERE ${MONTH_BUCKET} = ? AND vtl.cause IS NOT NULL ${bc}
        GROUP BY vtl.cause ORDER BY n DESC LIMIT 6`
    ).bind(bucket, ...bBind).all<any>(),

    env.DB.prepare(
      `SELECT vtl.ticket_id, vtl.building_code, vtl.unit_code, vtl.room_code, vtl.room_type,
              vtl.object_type, vtl.state, vtl.reported_at, vtl.closed_at, vtl.cause
         FROM v_ticket_location vtl
        WHERE ${MONTH_BUCKET} = ? ${bc}
        ORDER BY vtl.reported_at DESC LIMIT 40`
    ).bind(bucket, ...bBind).all<any>(),
  ]);

  const ms = closed.results.map((r: any) => r.ms);
  const median = ms.length ? ms[Math.floor(ms.length / 2)] / DAY : null;

  return json({
    bucket,
    building,
    totals: {
      reported: totals?.reported ?? 0,
      fixed: totals?.fixed ?? 0,
      stillOpen: totals?.still_open ?? 0,
      medianDays: median === null ? null : median.toFixed(1),
      closedCount: ms.length,
    },
    byBuilding: byBuilding.results,
    byType: byType.results,
    byCause: byCause.results,
    tickets: tickets.results,
  });
});

/**
 * Drill-down behind the metric cards. Same filters, individual tickets.
 * `filter=open` for everything live, `parts` for what's waiting on a supplier,
 * `failed` for visits where nobody was home.
 */
route("GET", "/api/dashboard/tickets", async ({ env, p, url }) => {
  if (p.kind !== "operator") return bad("operator only", 403);
  const { months, building, since } = dashboardFilter(url);
  const which = url.searchParams.get("filter") || "open";
  const bBind = building ? [building] : [];
  const bc = buildingClause(building);

  if (which === "parts") {
    const rows = await env.DB.prepare(
      `SELECT vtl.ticket_id, vtl.building_code, vtl.unit_code, vtl.room_code, vtl.room_type,
              vtl.object_type, vtl.state, vtl.reported_at,
              po.description AS part, po.supplier_eta, po.ordered_at
         FROM v_ticket_location vtl
         JOIN parts_orders po ON po.ticket_id = vtl.ticket_id AND po.arrived_at IS NULL
        WHERE vtl.state = 'waiting_for_parts' ${bc}
        ORDER BY po.ordered_at`
    ).bind(...bBind).all<any>();
    return json({ filter: { which, months, building }, tickets: rows.results });
  }

  if (which === "trade") {
    const rows = await env.DB.prepare(
      `SELECT vtl.ticket_id, vtl.building_code, vtl.unit_code, vtl.room_code, vtl.room_type,
              vtl.object_type, vtl.state, vtl.reported_at,
              e.trade, e.reason, e.note, e.raised_at, e.commissioned_at, e.contractor, e.reference
         FROM escalations e
         JOIN tickets t ON t.id = e.ticket_id
         JOIN v_ticket_location vtl ON vtl.ticket_id = t.id
        WHERE e.closed_at IS NULL AND t.state NOT IN ('done','cancelled') ${bc}
        ORDER BY e.commissioned_at IS NOT NULL, e.raised_at`
    ).bind(...bBind).all<any>();
    return json({ filter: { which, months, building }, tickets: rows.results });
  }

  if (which === "failed") {
    const rows = await env.DB.prepare(
      `SELECT vtl.ticket_id, vtl.building_code, vtl.unit_code, vtl.room_code, vtl.room_type,
              vtl.object_type, vtl.state, vtl.reported_at,
              a.starts_at AS missed_at
         FROM appointments a JOIN v_ticket_location vtl ON vtl.ticket_id = a.ticket_id
        WHERE a.status = 'no_access' AND a.starts_at >= ? ${bc}
        ORDER BY a.starts_at DESC LIMIT 100`
    ).bind(since, ...bBind).all<any>();
    return json({ filter: { which, months, building }, tickets: rows.results });
  }

  const rows = await env.DB.prepare(
    `SELECT vtl.ticket_id, vtl.building_code, vtl.unit_code, vtl.room_code, vtl.room_type,
            vtl.object_type, vtl.state, vtl.reported_at,
            (SELECT starts_at FROM appointments a
              WHERE a.ticket_id = vtl.ticket_id AND a.status = 'booked') AS appt_at
       FROM v_ticket_location vtl
      WHERE vtl.state NOT IN ('done','cancelled') ${bc}
      ORDER BY vtl.reported_at LIMIT 200`
  ).bind(...bBind).all<any>();
  return json({ filter: { which, months, building }, tickets: rows.results });
});

/* --- notifications ----------------------------------------------- */

/**
 * The bell. Unread count plus the most recent notices, each carrying enough
 * location to render a row without a second request.
 */
route("GET", "/api/notifications", async ({ env, p }) => {
  const reader = readerKey(p);
  if (!reader) return json({ notifications: [], unread: 0 });

  const scope = notificationScope(p);
  const rows = await env.DB.prepare(
    `SELECT n.id, n.kind, n.payload, n.created_at, n.ticket_id,
            vtl.building_code, vtl.unit_code, vtl.room_type, vtl.room_label,
            vtl.object_type, vtl.state,
            (r.read_at IS NOT NULL) AS is_read
       FROM notifications n
       LEFT JOIN v_ticket_location vtl ON vtl.ticket_id = n.ticket_id
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.reader = ?1
      WHERE ${scope.where}
      ORDER BY n.created_at DESC
      LIMIT 40`
  ).bind(reader, ...scope.binds).all<any>();

  const unread = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications n
      WHERE ${scope.where}
        AND NOT EXISTS (SELECT 1 FROM notification_reads r
                         WHERE r.notification_id = n.id AND r.reader = ?${scope.binds.length + 1})`
  ).bind(...scope.binds, reader).first<any>();

  return json({ notifications: rows.results, unread: unread?.n ?? 0 });
});

/** Read on tap, not on opening the panel: a glance shouldn't clear your list. */
route("POST", "/api/notifications/:id/read", async ({ env, p, params }) => {
  const reader = readerKey(p);
  if (!reader) return bad("sign in first", 403);

  const scope = notificationScope(p);
  const visible = await env.DB.prepare(
    `SELECT n.id FROM notifications n WHERE n.id = ? AND ${scope.where}`
  ).bind(params.id, ...scope.binds).first();
  if (!visible) return bad("not found", 404);

  await env.DB.prepare(
    `INSERT INTO notification_reads (notification_id, reader, read_at) VALUES (?1,?2,?3)
     ON CONFLICT (notification_id, reader) DO NOTHING`
  ).bind(params.id, reader, now()).run();
  return json({ ok: true });
});

route("POST", "/api/notifications/read-all", async ({ env, p }) => {
  const reader = readerKey(p);
  if (!reader) return bad("sign in first", 403);
  const scope = notificationScope(p);
  await env.DB.prepare(
    `INSERT INTO notification_reads (notification_id, reader, read_at)
     SELECT n.id, ?1, ?2 FROM notifications n WHERE ${scope.where}
     ON CONFLICT (notification_id, reader) DO NOTHING`
  ).bind(reader, now(), ...scope.binds).run();
  return json({ ok: true });
});

/* --- administration: buildings, rooms and staff ------------------ */

route("GET",   "/api/setup-state",              (c) => admin.setupState(c));
route("POST",  "/api/admin/bootstrap",          (c) => admin.bootstrap(c));
route("POST",  "/api/auth/setup",               (c) => admin.consumeInvite(c));

route("GET",   "/api/admin/vocabulary",         (c) => admin.adminVocabulary(c));

route("GET",   "/api/admin/buildings",          (c) => admin.listBuildings(c));
route("POST",  "/api/admin/buildings",          (c) => admin.createBuilding(c));
route("PATCH", "/api/admin/buildings/:id",      (c) => admin.updateBuilding(c));
route("GET",   "/api/admin/buildings/:id/units",(c) => admin.listUnits(c));
route("POST",  "/api/admin/buildings/:id/units",(c) => admin.createUnit(c));

route("PATCH", "/api/admin/rooms/:id",          (c) => admin.updateRoom(c));
route("POST",  "/api/admin/rooms/:id/objects",  (c) => admin.addObjects(c));
route("DELETE","/api/admin/objects/:id",        (c) => admin.deleteObject(c));

route("GET",   "/api/admin/staff",              (c) => admin.listStaff(c));
route("POST",  "/api/admin/staff",              (c) => admin.createStaff(c));
route("PATCH", "/api/admin/staff/:id",          (c) => admin.updateStaff(c));
route("PUT",   "/api/admin/staff/:id/buildings",(c) => admin.setStaffBuildings(c));
route("POST",  "/api/admin/staff/:id/invite",   (c) => admin.inviteStaff(c));
route("POST",  "/api/admin/staff/:id/disable",  (c) => admin.disableStaff(c));
route("POST",  "/api/admin/staff/:id/enable",   (c) => admin.enableStaff(c));

/* --- dev seed --------------------------------------------------- */

route("POST", "/api/dev/seed", async ({ env }) => {
  if (env.DEMO_MODE !== "true") return bad("disabled", 403);
  // Never wipe an estate somebody actually built.
  const real = await env.DB.prepare(`SELECT COUNT(*) AS n FROM buildings WHERE seeded = 0`)
    .first<any>();
  if (((real?.n as number) ?? 0) > 0) {
    return bad("this database has real buildings in it — refusing to reseed", 409);
  }
  await seed(env);
  return json({ ok: true });
});

/**
 * The resident to notify about a ticket: the primary reporter if they have an
 * account. Anonymous reporters have no bell, which is what the capability link
 * (and later, email) is for.
 */
async function ticketTenant(env: Env, ticketId: string): Promise<string | null> {
  const r = await env.DB.prepare(
    `SELECT tenant_id FROM ticket_reporters
      WHERE ticket_id = ?1 AND tenant_id IS NOT NULL
      ORDER BY is_primary DESC, created_at LIMIT 1`
  ).bind(ticketId).first<any>();
  return (r?.tenant_id as string) ?? null;
}

/** Notify the resident, if there is one to notify. */
async function tellTenant(env: Env, ticketId: string, kind: string, payload: Record<string, unknown> = {}) {
  const tenantId = await ticketTenant(env, ticketId);
  if (!tenantId) return [];
  // The address is resolved now rather than at send time: if the resident later
  // changes it, mail already queued goes where it was addressed.
  const to = await tenantEmail(env, tenantId);
  return [queueNotification(env, { audience: "tenant", tenantId }, kind, ticketId, payload, null, to)];
}

/** Notify whoever covers the building this ticket is in. */
function tellStaff(env: Env, buildingId: string, ticketId: string, kind: string, payload: Record<string, unknown> = {}) {
  return [queueNotification(env, { audience: "staff", buildingId }, kind, ticketId, payload)];
}

async function loadTicket(env: Env, id: string) {
  const t = await env.DB.prepare(`SELECT * FROM tickets WHERE id = ?1`).bind(id).first<any>();
  if (!t) throw new HttpError("not found", 404);
  const loc = await env.DB.prepare(
    `SELECT vtl.*, u.is_common
       FROM v_ticket_location vtl JOIN units u ON u.id = vtl.unit_id
      WHERE vtl.ticket_id = ?1`
  ).bind(id).first<any>();
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
  let email: string | null = null;
  let wantsEmail = true;
  if (p.kind === "tenant") {
    const me = await env.DB.prepare(`SELECT email, wants_email FROM tenants WHERE id = ?1`)
      .bind(p.tenantId).first<any>();
    email = me?.email ?? null;
    wantsEmail = me?.wants_email !== 0;
  }
  if (p.kind === "tenant") {
    home = await env.DB.prepare(
      `SELECT u.id AS unit_id, u.code AS unit_code, b.code AS building_code, r.code AS room_code
         FROM rooms r JOIN units u ON u.id = r.unit_id JOIN buildings b ON b.id = u.building_id
        WHERE r.id = ?1`
    ).bind(p.roomId).first<any>();
  }
  const demo = env.DEMO_MODE === "true";
  return json({
    principal: p,
    buildings: buildings.results,
    home,
    demo,
    demoHints: demo ? DEMO_HINTS : null,
    // The client builds its time picker from these, so the two can't drift.
    slotRules: {
      hours: SLOT_HOURS,
      minutes: SLOT_MINUTES,
      timeZone: BUILDING_TZ,
      maxOffers: MAX_OFFERS,
      horizonDays: OFFER_HORIZON_DAYS,
    },
    retention: { residentRecentDays: RESIDENT_RECENT_DAYS },
    email, wantsEmail,
    emailConfigured: !!env.RESEND_API_KEY,
    needsSetup: ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM staff`).first<any>())?.n ?? 0) === 0,
  });
});

/* ================================================================ */
/* housekeeping — runs daily on a cron, never deletes a ticket       */
/* ================================================================ */

/**
 * Remind residents about tomorrow's appointment.
 *
 * This is the notification that pays for itself: failed visits are the biggest
 * measured cost in the system, and the only thing standing between a booked slot
 * and an empty room is whether the resident remembered.
 *
 * The appointment id is the idempotency key, so running twice in a day cannot
 * remind twice.
 */
async function sendReminders(env: Env) {
  const from = now();
  const to = now() + 2 * DAY;

  const due = await env.DB.prepare(
    `SELECT a.id, a.ticket_id, a.starts_at, vtl.building_id
       FROM appointments a
       JOIN v_ticket_location vtl ON vtl.ticket_id = a.ticket_id
      WHERE a.status = 'booked' AND a.starts_at > ?1 AND a.starts_at < ?2`
  ).bind(from, to).all<any>();

  let queued = 0;
  for (const a of due.results) {
    const tenantId = await ticketTenant(env, a.ticket_id);
    if (!tenantId) continue;
    try {
      await queueNotification(
        env, { audience: "tenant", tenantId }, "reminder", a.ticket_id,
        { startsAt: a.starts_at }, a.id, await tenantEmail(env, tenantId),
      ).run();
      queued++;
    } catch {
      // one_notification_per_ref: already reminded for this appointment
    }
  }
  return queued;
}

async function runRetention(env: Env) {
  const reporterCutoff = now() - RETAIN_REPORTER_DAYS * DAY;
  const attemptCutoff = now() - RETAIN_ATTEMPTS_DAYS * DAY;

  const results = await env.DB.batch([
    // Anonymise, don't delete: the ticket keeps its reporter count, loses the
    // identities. `token` has a UNIQUE constraint, so it gets a fresh dead value
    // rather than NULL for every row.
    env.DB.prepare(
      `UPDATE ticket_reporters
          SET tenant_id = NULL, email = NULL, token = 'expired-' || id
        WHERE tenant_id IS NOT NULL
          AND ticket_id IN (SELECT id FROM tickets WHERE closed_at IS NOT NULL AND closed_at < ?1)`
    ).bind(reporterCutoff),

    // Tenancies that ended long ago no longer need the person attached either.
    env.DB.prepare(
      `UPDATE ticket_reporters
          SET tenant_id = NULL, email = NULL, token = 'expired-' || id
        WHERE tenant_id IS NOT NULL
          AND tenant_id IN (
            SELECT tenant_id FROM tenancies
             WHERE ends_on IS NOT NULL AND ends_on < ?1)`
    ).bind(reporterCutoff),

    env.DB.prepare(`DELETE FROM login_attempts WHERE attempted_at < ?1`).bind(attemptCutoff),

    env.DB.prepare(
      `DELETE FROM staff_sessions WHERE expires_at < ?1 OR revoked_at IS NOT NULL`
    ).bind(now()),
    env.DB.prepare(
      `DELETE FROM tenant_sessions WHERE expires_at < ?1 OR revoked_at IS NOT NULL`
    ).bind(now()),

    // Offers nobody took, long past. The appointment history stays.
    env.DB.prepare(
      `DELETE FROM slot_offers
        WHERE expires_at < ?1
          AND id NOT IN (SELECT slot_offer_id FROM appointments WHERE slot_offer_id IS NOT NULL)`
    ).bind(now() - 90 * DAY),

    // Read notifications older than 90 days: the ticket keeps the history.
    env.DB.prepare(
      `DELETE FROM notifications WHERE created_at < ?1
        AND id IN (SELECT notification_id FROM notification_reads)`
    ).bind(now() - 90 * DAY),
  ]);

  return {
    anonymisedByClosure: results[0].meta.changes,
    anonymisedByMoveOut: results[1].meta.changes,
    loginAttemptsPurged: results[2].meta.changes,
    sessionsPurged: results[3].meta.changes + results[4].meta.changes,
    staleOffersPurged: results[5].meta.changes,
  };
}

/**
 * Render every template without sending anything.
 *
 * Worth having beyond the tests: email copy is the one part of the app you
 * can't see by clicking around, and reading it side by side in both languages
 * is how you catch a sentence that only makes sense in one.
 */
route("GET", "/api/dev/mail/preview", async ({ p, url }) => {
  if (p.kind !== "operator") return bad("operator only", 403);

  const kinds = [
    ["slots_offered", { count: 3 }],
    ["booked", {}],
    ["staff_cancelled", {}],
    ["part_ordered", { part: "Siphon-Dichtung", eta: "KW 34" }],
    ["part_arrived", {}],
    ["fixed", { cause: "SEAL" }],
    ["escalated", { trade: "ELECTRICAL" }],
    ["reminder", { startsAt: now() + DAY }],
    // Not an email: proves caretaker traffic is bell-only.
    ["reported", {}],
  ] as [string, Record<string, unknown>][];

  const out: any[] = [];
  for (const [kind, payload] of kinds) {
    for (const locale of ["de", "en"]) {
      const row = {
        kind, locale, payload: JSON.stringify(payload),
        building_code: "B", unit_code: "312", room_type: "BATHROOM", room_label: null,
        token: "preview-token-not-real",
      };
      out.push({ kind, locale, mail: renderMail(row, url.origin) });
    }
  }
  return json({ previews: out });
});

route("POST", "/api/dev/mail", async ({ env, p, url }) => {
  if (p.kind !== "operator") return bad("operator only", 403);
  return json(await flushMail(env, url.origin));
});

/** A resident turning email off keeps the bell. */
route("POST", "/api/me/email", async ({ env, req, p }) => {
  if (p.kind !== "tenant") return bad("residents only", 403);
  const { email, wantsEmail } = (await req.json()) as
    { email?: string | null; wantsEmail?: boolean };

  if (email !== undefined && email !== null && email !== "" && !email.includes("@")) {
    return bad("that doesn't look like an email address");
  }
  await env.DB.prepare(
    `UPDATE tenants
        SET email = COALESCE(?1, email),
            wants_email = ?2
      WHERE id = ?3`
  ).bind(
    email === undefined || email === null || email === "" ? null : email.trim().toLowerCase(),
    wantsEmail === false ? 0 : 1,
    p.tenantId,
  ).run();
  return json({ ok: true });
});

route("POST", "/api/dev/retention", async ({ env, p }) => {
  if (p.kind !== "operator") return bad("operator only", 403);
  return json(await runRetention(env));
});

route("POST", "/api/dev/reminders", async ({ env, p }) => {
  if (p.kind !== "operator") return bad("operator only", 403);
  return json({ queued: await sendReminders(env) });
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
  // "WASHER*3" means three of them, ordinals 1..3. A room with multiples is
  // the one case that still needs a sticker per object.
  LAUNDRY: ["WASHER*3", "DRAIN", "LIGHT"],
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
    stmts.push(env.DB.prepare(`INSERT INTO buildings (id, code, name, room_count, seeded) VALUES (?1,?2,?3,?4,1)`)
      .bind(b.id, b.code, b.name, b.rooms))
  );

  const addUnit = (bid: string, bcode: string, code: string, floor: number, kind: string,
                   rooms: [string, string, string, string][]) => {
    const uid_ = `u-${bcode}-${code}`;
    stmts.push(env.DB.prepare(
      `INSERT INTO units (id, building_id, code, floor, kind, is_common) VALUES (?1,?2,?3,?4,?5,?6)`
    ).bind(uid_, bid, code, floor, kind, code.startsWith("COM") ? 1 : 0));
    rooms.forEach(([rcode, rtype, rkind, riser]) => {
      const rid = `${uid_}-${rcode}`;
      const roomSlug = `${bcode}${code}-${rcode}`.toLowerCase();
      stmts.push(env.DB.prepare(
        `INSERT INTO rooms (id, unit_id, code, room_type, kind, qr_slug) VALUES (?1,?2,?3,?4,?5,?6)`
      ).bind(rid, uid_, rcode, rtype, rkind, roomSlug));

      ROOM_SPEC[rtype].forEach((entry) => {
        const [otype, countStr] = entry.split("*");
        const count = Number(countStr || 1);
        for (let n = 1; n <= count; n++) {
          const suffix = count > 1 ? `${otype}${n}` : otype;
          const oid = `${rid}-${suffix}`;
          const slug = `${roomSlug}-${suffix}`.toLowerCase();
          stmts.push(env.DB.prepare(
            `INSERT INTO objects (id, room_id, object_type, ordinal, qr_slug, riser) VALUES (?1,?2,?3,?4,?5,?6)`
          ).bind(oid, rid, otype, n, slug, riser));
          objects.push({ id: oid, type: otype, riser, roomId: rid, roomKind: rkind });
        }
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
  // One common-area unit per floor: a corridor belongs to a floor, not a flat.
  addUnit("b-a", "A", "COM1", 1, "studio", [["FL", "HALLWAY", "shared", "A-S1"]]);
  addUnit("b-a", "A", "COM2", 2, "studio", [["FL", "HALLWAY", "shared", "A-S1"]]);
  addUnit("b-b", "B", "COM3", 3, "studio", [["FL", "HALLWAY", "shared", "B-S1"]]);
  addUnit("b-c", "C", "COM2", 2, "studio", [
    ["FL", "HALLWAY", "shared", "C-S2"], ["WK", "LAUNDRY", "shared", "C-S2"],
  ]);
  for (let i = 1; i <= 8; i++) {
    addUnit("b-c", "C", `20${i}`, 2, "studio", [
      ["Z1", "BEDROOM", "private", "C-S2"], ["BA", "BATHROOM", "private", "C-S2"],
    ]);
  }

  // Accounts. Passwords are hashed here exactly as a real signup would.
  const hmPw = await hashNewPassword(DEMO_STAFF_PASSWORD);
  const opPw = await hashNewPassword(DEMO_OPERATOR_PASSWORD);
  stmts.push(
    env.DB.prepare(
      `INSERT INTO tenants (id, email, locale, activated_at, activation_code)
       VALUES ('t-z2','z2@wohnheim.test','en',?1,?2)`
    ).bind(now(), DEMO_RESIDENT_CODE),
    env.DB.prepare(
      `INSERT INTO staff (id, email, display_name, locale, is_operator, password_hash, password_salt)
       VALUES ('s-hm','hausmeister@wohnheim.test','K. Neumann','de',0,?1,?2)`
    ).bind(hmPw.hash, hmPw.salt),
    env.DB.prepare(
      `INSERT INTO staff (id, email, display_name, locale, is_operator, password_hash, password_salt)
       VALUES ('s-op','verwaltung@wohnheim.test','Studierendenwerk','de',1,?1,?2)`
    ).bind(opPw.hash, opPw.salt),
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
  const aHall = objects.find((o) => o.id === "u-A-COM1-FL-LIGHT");
  if (aHall) [200, 160, 120, 84, 50, 18].forEach((ago, i) =>
    closed(aHall.id, "NO_POWER", i < 4 ? "WIRING" : "CONSUMABLE", ago, 1 + (i % 3), false));

  for (let i = 0; i < hist.length; i += 40) await env.DB.batch(hist.slice(i, i + 40));

  /* ---- live tickets -------------------------------------------- */
  const live: D1PreparedStatement[] = [];
  // Tomorrow 11:00 in the building's zone — a genuinely offerable hour, so the
  // seeded appointment reads the same way one created through the picker would.
  const tmr = buildingHourFromNow(1, 11);

  // Kitchen sink in the demo WG: scheduled, then a part was ordered.
  live.push(
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access, access_consent, note)
       VALUES ('L1','u-B-312-KU-SINK','LEAKING','waiting_for_parts',?1,1,1,'Tropft unter dem Schrank.')`
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
    ).bind(tmr, tmr + 36e5, now() - 2 * DAY),
    ...(["reported", "accepted", "slots_offered", "scheduled"] as string[]).map((s, i) =>
      env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L2',?1,'staff',?2,?3)`)
        .bind(s, s, now() - 3 * DAY + i * 6e6)),
    // Common-area hallway light in Haus C: three reporters, no appointment needed
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access)
       VALUES ('L3','u-C-COM2-FL-LIGHT','NO_POWER','accepted',?1,0)`
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
    // A socket with no power: not something a caretaker may legally touch.
    env.DB.prepare(
      `INSERT INTO tickets (id, object_id, symptom, state, reported_at, needs_access, handling, note)
       VALUES ('L5','u-C-201-Z1-SOCKET','NO_POWER','accepted',?1,1,'external','Ganze Wand ohne Strom.')`
    ).bind(now() - 5 * DAY),
    env.DB.prepare(`INSERT INTO ticket_reporters (id, ticket_id, locale, token, is_primary, created_at) VALUES ('r5','L5','de',?1,1,?2)`)
      .bind(randomToken(), now() - 5 * DAY),
    env.DB.prepare(
      `INSERT INTO escalations (id, ticket_id, trade, reason, note, raised_by, raised_at)
       VALUES ('e1','L5','ELECTRICAL','QUALIFICATION','Braucht einen Elektrofachbetrieb.','s-hm',?1)`
    ).bind(now() - 4 * DAY),
    env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L5','reported','tenant','reported',?1)`).bind(now() - 5 * DAY),
    env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L5','accepted','staff','accepted',?1)`).bind(now() - 5 * DAY + 36e5),
    env.DB.prepare(`INSERT INTO ticket_events (ticket_id, to_state, actor_kind, reason, created_at) VALUES ('L5','accepted','staff','escalated_electrical',?1)`).bind(now() - 4 * DAY),
  );
  for (let i = 0; i < live.length; i += 30) await env.DB.batch(live.slice(i, i + 30));
}

/* ================================================================ */
/* dispatch                                                         */
/* ================================================================ */

export default {
  /** Daily housekeeping. Anonymises old reporter links; never drops a ticket. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      console.log("reminders", await sendReminders(env));
      console.log("retention", await runRetention(env));
      // After the reminders, so tomorrow's appointments go out in the same run.
      console.log("mail", await flushMail(env, env.PUBLIC_ORIGIN ?? "https://dormtag.com"));
    })());
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        const res = await handler({ req, env, p, url, params });
        // Anything that changed state may have queued mail. Flush it after the
        // response so nobody waits on a third party, and so an outage can never
        // fail the request that caused it.
        if (req.method !== "GET" && res.ok) {
          ctx.waitUntil(flushMail(env, url.origin).catch(() => {}));
        }
        return res;
      }
      return bad("no such endpoint", 404);
    } catch (e: any) {
      if (e instanceof HttpError) return bad(e.message, e.status);
      return bad(e?.message || "server error", 500);
    }
  },
};
