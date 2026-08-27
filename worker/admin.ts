/**
 * admin.ts — the routes that make DormTag deployable without editing code.
 *
 * Everything here is operator-only, except:
 *   POST /api/admin/bootstrap  (public, and only while no staff exist at all)
 *   POST /api/auth/setup       (public, consumes a one-time invite)
 *   PATCH /api/admin/rooms/:id (caretakers too: they're the ones standing in
 *                               the room noticing there are two bathrooms)
 */

import type { Env, Principal, RouteCtx } from "./core";
import {
  bad, json, now, uid, DAY, sha256, randomToken, hashNewPassword,
  derivePassword, sameSecret, tooManyAttempts, recordAttempt,
  isStaff, issueStaffSession, sessionResponse, HttpError, orgOf,
} from "./core";

/* ---------------------------------------------------------------- */
/* shared helpers                                                   */
/* ---------------------------------------------------------------- */

const ROOM_TYPES = ["BEDROOM", "KITCHEN", "BATHROOM", "HALLWAY", "LAUNDRY"];

const OBJECTS_FOR: Record<string, string[]> = {
  BEDROOM: ["LIGHT", "RADIATOR", "WINDOW", "SOCKET"],
  KITCHEN: ["SINK", "STOVE", "FRIDGE", "LIGHT", "SOCKET"],
  BATHROOM: ["SHOWER", "DRAIN", "LIGHT"],
  HALLWAY: ["LIGHT", "DOOR"],
  LAUNDRY: ["WASHER", "DRAIN", "LIGHT"],
};

const OBJECT_TYPES = [
  "SINK", "STOVE", "LIGHT", "FRIDGE", "RADIATOR",
  "SHOWER", "DRAIN", "WASHER", "DOOR", "WINDOW", "SOCKET",
];

const MIN_PASSWORD = 10;
const INVITE_DAYS = 7;

/** Slugs are lowercase and hyphen-safe, because they end up in a printed URL. */
const slugPart = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * A short token that makes one organisation's QR slugs distinct from another's.
 *
 * Slugs are URLs, so they have to be unique platform-wide however many customers
 * there are. Building codes are not: everybody has a Haus A. So the prefix goes
 * into the stored code and therefore into the slug, while display_code stays
 * whatever the operator typed.
 */
async function makeSlugPrefix(env: Env, orgName: string): Promise<string> {
  const base = slugPart(orgName).slice(0, 6) || "org";
  for (let i = 0; i < 40; i++) {
    const candidate = i === 0 ? base : `${base}${i}`;
    const clash = await env.DB.prepare(`SELECT id FROM orgs WHERE slug_prefix = ?1`)
      .bind(candidate).first();
    if (!clash) return candidate;
  }
  return slugPart(uid()).slice(0, 10);
}

function requireOperator(p: Principal) {
  if (p.kind !== "operator") throw new HttpError("operator only", 403);
  return p;
}

/**
 * The organisation this request may touch.
 *
 * Every admin query goes through this rather than hand-writing the condition,
 * because isolation here is a shared database plus an org_id and a single
 * forgotten WHERE is another customer's data.
 */
function myOrg(p: Principal): string {
  const org = orgOf(p);
  if (!org) throw new HttpError("no organisation", 403);
  return org;
}

async function countStaff(env: Env) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM staff`).first<any>();
  return (r?.n as number) ?? 0;
}

/** Refuse to strand the estate with nobody who can administer it. */
async function assertNotLastOperator(env: Env, staffId: string) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM staff
      WHERE is_operator = 1 AND disabled_at IS NULL AND id != ?1
        AND org_id = (SELECT org_id FROM staff WHERE id = ?1)`
  ).bind(staffId).first<any>();
  if (((r?.n as number) ?? 0) === 0) {
    throw new HttpError("that's the last operator — promote someone else first", 409);
  }
}

/* ---------------------------------------------------------------- */
/* bootstrap: the very first operator                               */
/* ---------------------------------------------------------------- */

export async function bootstrap({ env, req }: RouteCtx) {
  if (await countStaff(env) > 0) {
    return bad("already set up", 409);
  }
  const { email, name, password } = (await req.json()) as
    { email?: string; name?: string; password?: string };

  if (!email?.includes("@")) return bad("a real email address, please");
  if (!name?.trim()) return bad("name required");
  if (!password || password.length < MIN_PASSWORD) {
    return bad(`password needs at least ${MIN_PASSWORD} characters`);
  }

  const pw = await hashNewPassword(password);
  const id = uid();
  await env.DB.prepare(
    `INSERT INTO staff (id, email, display_name, locale, is_operator, password_hash, password_salt)
     VALUES (?1,?2,?3,'de',1,?4,?5)`
  ).bind(id, email.trim().toLowerCase(), name.trim(), pw.hash, pw.salt).run();

  return sessionResponse("sid", await issueStaffSession(env, id));
}

/** Told to the login screen so it can offer setup instead of a sign-in form. */
export async function setupState({ env }: RouteCtx) {
  return json({ needsSetup: (await countStaff(env)) === 0 });
}

/* ---------------------------------------------------------------- */
/* buildings                                                        */
/* ---------------------------------------------------------------- */

export async function listBuildings({ env, p }: RouteCtx) {
  requireOperator(p);
  const rows = await env.DB.prepare(
    `SELECT b.id, COALESCE(b.display_code, b.code) AS code, b.name, b.room_count, b.seeded,
            (SELECT COUNT(*) FROM units u WHERE u.building_id = b.id) AS units,
            (SELECT COUNT(*) FROM rooms r JOIN units u ON u.id = r.unit_id
              WHERE u.building_id = b.id) AS rooms
       FROM buildings b WHERE b.org_id = ?1 ORDER BY b.code`
  ).bind(myOrg(p)).all<any>();

  const staff = await env.DB.prepare(
    `SELECT sb.building_id, s.id, s.display_name
       FROM staff_buildings sb JOIN staff s ON s.id = sb.staff_id
      WHERE s.disabled_at IS NULL AND s.is_operator = 0 AND s.org_id = ?1
      ORDER BY s.display_name`
  ).bind(myOrg(p)).all<any>();

  return json({
    buildings: rows.results.map((b: any) => ({
      ...b,
      caretakers: staff.results.filter((x: any) => x.building_id === b.id)
        .map((x: any) => ({ id: x.id, name: x.display_name })),
    })),
  });
}

export async function createBuilding({ env, req, p }: RouteCtx) {
  requireOperator(p);
  const { code, name, roomCount } = (await req.json()) as
    { code?: string; name?: string; roomCount?: number };

  const c = slugPart(code || "").toUpperCase();
  if (!c || c.length > 6) return bad("code: 1 to 6 letters or digits");
  if (!name?.trim()) return bad("name required");

  const org = myOrg(p);
  // Unique within the organisation: two Studierendenwerke may both have a Haus A.
  const clash = await env.DB.prepare(
    `SELECT id FROM buildings WHERE display_code = ?1 AND org_id = ?2`
  ).bind(c, org).first();
  if (clash) return bad(`a building with code ${c} already exists`, 409);

  // The stored code carries the organisation's prefix, which is what keeps QR
  // slugs unique platform-wide. The demo organisation has an empty prefix so its
  // already-printed stickers keep resolving.
  const row = await env.DB.prepare(`SELECT slug_prefix FROM orgs WHERE id = ?1`)
    .bind(org).first<any>();
  const prefix = row?.slug_prefix ?? "";
  const stored = prefix ? `${prefix}-${c}` : c;

  const globalClash = await env.DB.prepare(`SELECT id FROM buildings WHERE code = ?1`)
    .bind(stored).first();
  if (globalClash) return bad(`a building with code ${c} already exists`, 409);

  const id = uid();
  await env.DB.prepare(
    `INSERT INTO buildings (id, code, display_code, name, room_count, seeded, org_id)
     VALUES (?1,?2,?3,?4,?5,0,?6)`
  ).bind(id, stored, c, name.trim(), Math.max(0, Number(roomCount) || 0), org).run();
  return json({ id, code: c });
}

/**
 * Name and room count only. The code is immutable because it is baked into
 * every printed QR slug: renaming it would silently kill every sticker on
 * every door in the building.
 */
export async function updateBuilding({ env, req, p, params }: RouteCtx) {
  requireOperator(p);
  const { name, roomCount } = (await req.json()) as { name?: string; roomCount?: number };
  if (!name?.trim()) return bad("name required");

  const r = await env.DB.prepare(
    `UPDATE buildings SET name = ?1, room_count = ?2 WHERE id = ?3 AND org_id = ?4`
  ).bind(name.trim(), Math.max(0, Number(roomCount) || 0), params.id, myOrg(p)).run();
  if (!r.meta.changes) return bad("unknown building", 404);
  return json({ ok: true });
}

/* ---------------------------------------------------------------- */
/* units and rooms                                                  */
/* ---------------------------------------------------------------- */

export async function listUnits({ env, p, params }: RouteCtx) {
  requireOperator(p);
  // Checked here rather than relying on the caller: an id from another
  // organisation must return nothing, not that organisation's units.
  const owned = await env.DB.prepare(
    `SELECT id FROM buildings WHERE id = ?1 AND org_id = ?2`
  ).bind(params.id, myOrg(p)).first();
  if (!owned) return bad("unknown building", 404);

  const units = await env.DB.prepare(
    `SELECT id, code, floor, kind, is_common FROM units
      WHERE building_id = ?1 ORDER BY floor, code`
  ).bind(params.id).all<any>();

  const rooms = await env.DB.prepare(
    `SELECT r.id, r.unit_id, r.code, r.room_type, r.kind, r.label, r.qr_slug,
            (SELECT COUNT(*) FROM objects o WHERE o.room_id = r.id) AS objects
       FROM rooms r JOIN units u ON u.id = r.unit_id
      WHERE u.building_id = ?1 ORDER BY r.code`
  ).bind(params.id).all<any>();

  return json({
    units: units.results.map((u: any) => ({
      ...u,
      rooms: rooms.results.filter((r: any) => r.unit_id === u.id),
    })),
  });
}

/**
 * Create a unit with its rooms in one call, generating QR slugs as it goes.
 *
 * Rooms arrive as `[{ code, roomType, kind, label? }]`. Fixtures come from the
 * room type, which is why the type is a code: the caller doesn't have to know
 * that a bathroom has a shower, a drain and a light.
 */
export async function createUnit({ env, req, p, params }: RouteCtx) {
  requireOperator(p);
  const b = await env.DB.prepare(
    `SELECT id, code FROM buildings WHERE id = ?1 AND org_id = ?2`
  ).bind(params.id, myOrg(p)).first<any>();
  if (!b) return bad("unknown building", 404);

  const body = (await req.json()) as {
    code?: string; floor?: number; kind?: string; isCommon?: boolean;
    rooms?: { code?: string; roomType?: string; kind?: string; label?: string }[];
  };

  const code = slugPart(body.code || "").toUpperCase();
  if (!code || code.length > 8) return bad("unit code: 1 to 8 letters or digits");
  const kind = body.kind === "wg" ? "wg" : "studio";
  const floor = Number.isFinite(Number(body.floor)) ? Number(body.floor) : 0;
  const isCommon = body.isCommon ? 1 : 0;

  const rooms = Array.isArray(body.rooms) ? body.rooms : [];
  if (rooms.length === 0) return bad("a unit needs at least one room");
  if (rooms.length > 20) return bad("at most 20 rooms per unit");

  const dupUnit = await env.DB.prepare(
    `SELECT id FROM units WHERE building_id = ?1 AND code = ?2`
  ).bind(b.id, code).first();
  if (dupUnit) return bad(`${b.code}-${code} already exists`, 409);

  const unitId = uid();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO units (id, building_id, code, floor, kind, is_common)
       VALUES (?1,?2,?3,?4,?5,?6)`
    ).bind(unitId, b.id, code, floor, kind, isCommon),
  ];

  const seenRoom = new Set<string>();
  for (const r of rooms) {
    const rc = slugPart(r.code || "").toUpperCase();
    if (!rc || rc.length > 6) return bad("room code: 1 to 6 letters or digits");
    if (seenRoom.has(rc)) return bad(`duplicate room code ${rc}`);
    seenRoom.add(rc);

    const rt = String(r.roomType || "").toUpperCase();
    if (!ROOM_TYPES.includes(rt)) return bad(`unknown room type ${rt}`);
    const rkind = r.kind === "private" ? "private" : "shared";

    const roomId = `${unitId}-${rc}`;
    const slug = `${slugPart(b.code)}${slugPart(code)}-${slugPart(rc)}`;

    const slugClash = await env.DB.prepare(`SELECT id FROM rooms WHERE qr_slug = ?1`)
      .bind(slug).first();
    if (slugClash) return bad(`sticker code ${slug} is already in use`, 409);

    stmts.push(env.DB.prepare(
      `INSERT INTO rooms (id, unit_id, code, room_type, kind, label, qr_slug)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(roomId, unitId, rc, rt, rkind, r.label?.trim() || null, slug));

    for (const ot of OBJECTS_FOR[rt]) {
      stmts.push(env.DB.prepare(
        `INSERT INTO objects (id, room_id, object_type, ordinal, qr_slug, riser)
         VALUES (?1,?2,?3,1,?4,NULL)`
      ).bind(`${roomId}-${ot}`, roomId, ot, `${slug}-${ot.toLowerCase()}`));
    }
  }

  await env.DB.batch(stmts);
  return json({ id: unitId, code, rooms: rooms.length });
}

/** Caretakers may set a room's label. They see the rooms; the operator doesn't. */
export async function updateRoom({ env, req, p, params }: RouteCtx) {
  if (!isStaff(p)) return bad("staff only", 403);

  const { label } = (await req.json()) as { label?: string };
  const clean = label?.trim() ? label.trim().slice(0, 40) : null;

  const own = await env.DB.prepare(
    `SELECT u.building_id, b.org_id
       FROM rooms r JOIN units u ON u.id = r.unit_id
       JOIN buildings b ON b.id = u.building_id
      WHERE r.id = ?1`
  ).bind(params.id).first<any>();
  if (!own || own.org_id !== myOrg(p)) return bad("unknown room", 404);
  if (p.kind === "staff" && !p.buildingIds.includes(own.building_id)) {
    return bad("not one of your buildings", 403);
  }

  const r = await env.DB.prepare(`UPDATE rooms SET label = ?1 WHERE id = ?2`)
    .bind(clean, params.id).run();
  if (!r.meta.changes) return bad("unknown room", 404);
  return json({ ok: true, label: clean });
}

/** Add a fixture, optionally several of the same type (laundry machines). */
export async function addObjects({ env, req, p, params }: RouteCtx) {
  requireOperator(p);
  const { objectType, count } = (await req.json()) as
    { objectType?: string; count?: number };

  const ot = String(objectType || "").toUpperCase();
  if (!OBJECT_TYPES.includes(ot)) return bad(`unknown fixture ${ot}`);
  const n = Math.min(Math.max(Number(count) || 1, 1), 12);

  const room = await env.DB.prepare(
    `SELECT r.id, r.qr_slug FROM rooms r
       JOIN units u ON u.id = r.unit_id
       JOIN buildings b ON b.id = u.building_id
      WHERE r.id = ?1 AND b.org_id = ?2`
  ).bind(params.id, myOrg(p)).first<any>();
  if (!room) return bad("unknown room", 404);

  const existing = await env.DB.prepare(
    `SELECT COALESCE(MAX(ordinal), 0) AS top FROM objects
      WHERE room_id = ?1 AND object_type = ?2`
  ).bind(room.id, ot).first<any>();

  const start = ((existing?.top as number) ?? 0) + 1;
  const stmts = [];
  for (let i = start; i < start + n; i++) {
    const suffix = i > 1 ? `${ot}${i}` : ot;
    stmts.push(env.DB.prepare(
      `INSERT INTO objects (id, room_id, object_type, ordinal, qr_slug, riser)
       VALUES (?1,?2,?3,?4,?5,NULL)`
    ).bind(`${room.id}-${suffix}`, room.id, ot, i,
           `${room.qr_slug}-${suffix.toLowerCase()}`));
  }
  await env.DB.batch(stmts);
  return json({ added: n, from: start });
}

/** Refused if any ticket ever referenced it: the history must stay readable. */
export async function deleteObject({ env, p, params }: RouteCtx) {
  requireOperator(p);
  const owned = await env.DB.prepare(
    `SELECT o.id FROM objects o
       JOIN rooms r ON r.id = o.room_id
       JOIN units u ON u.id = r.unit_id
       JOIN buildings b ON b.id = u.building_id
      WHERE o.id = ?1 AND b.org_id = ?2`
  ).bind(params.id, myOrg(p)).first();
  if (!owned) return bad("unknown fixture", 404);

  const used = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM tickets WHERE object_id = ?1`
  ).bind(params.id).first<any>();
  if (((used?.n as number) ?? 0) > 0) {
    return bad("that fixture has repair history and can't be removed", 409);
  }
  const r = await env.DB.prepare(`DELETE FROM objects WHERE id = ?1`).bind(params.id).run();
  if (!r.meta.changes) return bad("unknown fixture", 404);
  return json({ ok: true });
}

/* ---------------------------------------------------------------- */
/* staff                                                            */
/* ---------------------------------------------------------------- */

export async function listStaff({ env, p }: RouteCtx) {
  requireOperator(p);
  const rows = await env.DB.prepare(
    `SELECT s.id, s.email, s.display_name, s.is_operator, s.disabled_at,
            (s.password_hash IS NOT NULL) AS has_password
       FROM staff s WHERE s.org_id = ?1
      ORDER BY s.is_operator DESC, s.display_name`
  ).bind(myOrg(p)).all<any>();

  const assigned = await env.DB.prepare(
    `SELECT sb.staff_id, b.id, COALESCE(b.display_code, b.code) AS code, b.name
       FROM staff_buildings sb JOIN buildings b ON b.id = sb.building_id
      WHERE b.org_id = ?1 ORDER BY b.code`
  ).bind(myOrg(p)).all<any>();

  return json({
    staff: rows.results.map((s: any) => ({
      ...s,
      buildings: assigned.results.filter((a: any) => a.staff_id === s.id)
        .map((a: any) => ({ id: a.id, code: a.code, name: a.name })),
    })),
  });
}

export async function createStaff({ env, req, p }: RouteCtx) {
  const me = requireOperator(p);
  const { email, name, isOperator, buildingIds } = (await req.json()) as
    { email?: string; name?: string; isOperator?: boolean; buildingIds?: string[] };

  if (!email?.includes("@")) return bad("a real email address, please");
  if (!name?.trim()) return bad("name required");

  const addr = email.trim().toLowerCase();
  // Global, because staff.email is UNIQUE platform-wide (see migration 0010).
  const clash = await env.DB.prepare(`SELECT id FROM staff WHERE email = ?1`)
    .bind(addr).first();
  if (clash) return bad("that email address is already in use", 409);

  const org = myOrg(p);
  const id = uid();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO staff (id, email, display_name, locale, is_operator, org_id)
       VALUES (?1,?2,?3,'de',?4,?5)`
    ).bind(id, addr, name.trim(), isOperator ? 1 : 0, org),
  ];
  // Only buildings this organisation owns: otherwise an operator could assign a
  // caretaker to someone else's house and see its tickets through him.
  for (const b of (buildingIds || []).slice(0, 200)) {
    const owned = await env.DB.prepare(
      `SELECT id FROM buildings WHERE id = ?1 AND org_id = ?2`
    ).bind(b, org).first();
    if (!owned) return bad("unknown building", 404);
    stmts.push(env.DB.prepare(
      `INSERT INTO staff_buildings (staff_id, building_id) VALUES (?1,?2)`
    ).bind(id, b));
  }
  await env.DB.batch(stmts);

  // No password is set here. The operator never learns anyone's credentials.
  const token = await issueInvite(env, id);
  return json({ id, setupToken: token, expiresInDays: INVITE_DAYS, by: me.staffId });
}

export async function updateStaff({ env, req, p, params }: RouteCtx) {
  const me = requireOperator(p);
  const { name, isOperator } = (await req.json()) as
    { name?: string; isOperator?: boolean };

  const target = await env.DB.prepare(
    `SELECT id, is_operator FROM staff WHERE id = ?1 AND org_id = ?2`
  ).bind(params.id, myOrg(p)).first<any>();
  if (!target) return bad("unknown staff", 404);

  if (target.is_operator && isOperator === false) {
    if (target.id === me.staffId) return bad("you can't demote yourself", 409);
    await assertNotLastOperator(env, target.id);
  }

  await env.DB.prepare(
    `UPDATE staff SET display_name = COALESCE(?1, display_name), is_operator = ?2 WHERE id = ?3`
  ).bind(name?.trim() || null, isOperator ? 1 : 0, params.id).run();
  return json({ ok: true });
}

/**
 * Replace a caretaker's building assignments.
 *
 * Removing a building he has booked appointments in is refused: he'd lose sight
 * of an appointment a resident is still expecting him to keep.
 */
export async function setStaffBuildings({ env, req, p, params }: RouteCtx) {
  requireOperator(p);
  const org = myOrg(p);
  const mine = await env.DB.prepare(
    `SELECT id FROM staff WHERE id = ?1 AND org_id = ?2`
  ).bind(params.id, org).first();
  if (!mine) return bad("unknown staff", 404);

  const { buildingIds } = (await req.json()) as { buildingIds?: string[] };
  const wanted = new Set((buildingIds || []).slice(0, 200));
  for (const b of wanted) {
    const owned = await env.DB.prepare(
      `SELECT id FROM buildings WHERE id = ?1 AND org_id = ?2`
    ).bind(b, org).first();
    if (!owned) return bad("unknown building", 404);
  }

  const current = await env.DB.prepare(
    `SELECT building_id FROM staff_buildings WHERE staff_id = ?1`
  ).bind(params.id).all<any>();

  const removing = current.results
    .map((r: any) => r.building_id)
    .filter((b: string) => !wanted.has(b));

  for (const b of removing) {
    const booked = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM appointments a
         JOIN v_ticket_location vtl ON vtl.ticket_id = a.ticket_id
        WHERE a.staff_id = ?1 AND a.status = 'booked' AND vtl.building_id = ?2`
    ).bind(params.id, b).first<any>();
    if (((booked?.n as number) ?? 0) > 0) {
      return bad(`${booked.n} booked appointment(s) there — reassign or cancel first`, 409);
    }
  }

  const stmts = [env.DB.prepare(`DELETE FROM staff_buildings WHERE staff_id = ?1`).bind(params.id)];
  for (const b of wanted) {
    stmts.push(env.DB.prepare(
      `INSERT INTO staff_buildings (staff_id, building_id) VALUES (?1,?2)`
    ).bind(params.id, b));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, buildings: wanted.size });
}

export async function disableStaff({ env, p, params }: RouteCtx) {
  const me = requireOperator(p);
  if (params.id === me.staffId) return bad("you can't disable yourself", 409);

  const target = await env.DB.prepare(
    `SELECT id, is_operator, disabled_at FROM staff WHERE id = ?1 AND org_id = ?2`
  ).bind(params.id, myOrg(p)).first<any>();
  if (!target) return bad("unknown staff", 404);
  if (target.disabled_at) return bad("already disabled", 409);
  if (target.is_operator) await assertNotLastOperator(env, target.id);

  // Staff are never deleted: their name is on closed tickets.
  await env.DB.batch([
    env.DB.prepare(`UPDATE staff SET disabled_at = ?1 WHERE id = ?2`).bind(now(), params.id),
    env.DB.prepare(`UPDATE staff_sessions SET revoked_at = ?1 WHERE staff_id = ?2 AND revoked_at IS NULL`)
      .bind(now(), params.id),
    env.DB.prepare(`DELETE FROM staff_buildings WHERE staff_id = ?1`).bind(params.id),
    env.DB.prepare(`UPDATE staff_invites SET consumed_at = ?1 WHERE staff_id = ?2 AND consumed_at IS NULL`)
      .bind(now(), params.id),
  ]);
  return json({ ok: true });
}

export async function enableStaff({ env, p, params }: RouteCtx) {
  requireOperator(p);
  const r = await env.DB.prepare(
    `UPDATE staff SET disabled_at = NULL
      WHERE id = ?1 AND org_id = ?2 AND disabled_at IS NOT NULL`
  ).bind(params.id, myOrg(p)).run();
  if (!r.meta.changes) return bad("not disabled", 409);
  return json({ ok: true });
}

/* ---------------------------------------------------------------- */
/* invites                                                          */
/* ---------------------------------------------------------------- */

async function issueInvite(env: Env, staffId: string) {
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE staff_invites SET consumed_at = ?1 WHERE staff_id = ?2 AND consumed_at IS NULL`
    ).bind(now(), staffId),
    env.DB.prepare(
      `INSERT INTO staff_invites (id, staff_id, token_hash, created_at, expires_at)
       VALUES (?1,?2,?3,?4,?5)`
    ).bind(uid(), staffId, await sha256(token), now(), now() + INVITE_DAYS * DAY),
  ]);
  return token;
}

export async function inviteStaff({ env, p, params }: RouteCtx) {
  requireOperator(p);
  const target = await env.DB.prepare(
    `SELECT id FROM staff WHERE id = ?1 AND org_id = ?2 AND disabled_at IS NULL`
  ).bind(params.id, myOrg(p)).first<any>();
  if (!target) return bad("unknown or disabled staff", 404);
  return json({ setupToken: await issueInvite(env, params.id), expiresInDays: INVITE_DAYS });
}

/** Public. The invited person sets their own password and is signed straight in. */
export async function consumeInvite({ env, req }: RouteCtx) {
  const { token, password } = (await req.json()) as { token?: string; password?: string };
  if (!token) return bad("missing setup link");
  if (!password || password.length < MIN_PASSWORD) {
    return bad(`password needs at least ${MIN_PASSWORD} characters`);
  }

  const row = await env.DB.prepare(
    `SELECT i.id, i.staff_id FROM staff_invites i
       JOIN staff s ON s.id = i.staff_id
      WHERE i.token_hash = ?1 AND i.consumed_at IS NULL AND i.expires_at > ?2
        AND s.disabled_at IS NULL`
  ).bind(await sha256(token), now()).first<any>();
  if (!row) return bad("that setup link is invalid or has expired", 401);

  const pw = await hashNewPassword(password);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE staff SET password_hash = ?1, password_salt = ?2 WHERE id = ?3`
    ).bind(pw.hash, pw.salt, row.staff_id),
    env.DB.prepare(`UPDATE staff_invites SET consumed_at = ?1 WHERE id = ?2`)
      .bind(now(), row.id),
  ]);

  return sessionResponse("sid", await issueStaffSession(env, row.staff_id));
}

/** Which room types and fixtures the admin forms should offer. */
export async function adminVocabulary({ p }: RouteCtx) {
  requireOperator(p);
  return json({ roomTypes: ROOM_TYPES, objectTypes: OBJECT_TYPES, objectsFor: OBJECTS_FOR });
}

/* ---------------------------------------------------------------- */
/* passwords                                                        */
/* ---------------------------------------------------------------- */

/** Short, because a reset link arrives instantly. An invite may sit for days. */
const RESET_MINUTES = 60;

/**
 * Change your own password.
 *
 * The current one is required: without it, anyone who finds an unlocked laptop
 * can lock the real owner out of their own account.
 */
export async function changePassword({ env, req, p }: RouteCtx) {
  if (!isStaff(p)) return bad("staff only", 403);
  const staffId = (p as any).staffId as string;

  const { currentPassword, newPassword } = (await req.json()) as
    { currentPassword?: string; newPassword?: string };

  if (!newPassword || newPassword.length < MIN_PASSWORD) {
    return bad(`password needs at least ${MIN_PASSWORD} characters`);
  }

  const me = await env.DB.prepare(
    `SELECT password_hash, password_salt FROM staff WHERE id = ?1`
  ).bind(staffId).first<any>();
  if (!me?.password_hash) return bad("no password set", 409);

  const attempt = await derivePassword(currentPassword ?? "", me.password_salt);
  if (!sameSecret(attempt, me.password_hash)) {
    return bad("that isn't your current password", 401);
  }

  const pw = await hashNewPassword(newPassword);
  await env.DB.batch([
    env.DB.prepare(`UPDATE staff SET password_hash = ?1, password_salt = ?2 WHERE id = ?3`)
      .bind(pw.hash, pw.salt, staffId),
    // Every session ends, including this one: if somebody else had yours,
    // changing the password should lock them out. A fresh cookie comes back in
    // the response, so the person who did it stays signed in.
    env.DB.prepare(
      `UPDATE staff_sessions SET revoked_at = ?1 WHERE staff_id = ?2 AND revoked_at IS NULL`
    ).bind(now(), staffId),
  ]);
  return sessionResponse("sid", await issueStaffSession(env, staffId));
}

/**
 * Ask for a reset link.
 *
 * Always answers the same way. A form that says "no such account" is a way to
 * find out who has one.
 *
 * Requesting a reset does not invalidate the existing password: a malicious
 * request against your address should cost you nothing but an email.
 */
export async function requestReset({ env, req, url }: RouteCtx) {
  const { email } = (await req.json()) as { email?: string };
  const addr = (email ?? "").trim().toLowerCase();
  const same = { ok: true, message: "if that address has an account, a link is on its way" };
  if (!addr.includes("@")) return json(same);

  if (await tooManyAttempts(env, `reset:${addr}`)) return json(same);
  await recordAttempt(env, `reset:${addr}`, false);

  const staff = await env.DB.prepare(
    `SELECT id, locale FROM staff WHERE email = ?1 AND disabled_at IS NULL`
  ).bind(addr).first<any>();
  if (!staff) return json(same);

  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE password_resets SET consumed_at = ?1
        WHERE staff_id = ?2 AND consumed_at IS NULL`
    ).bind(now(), staff.id),
    env.DB.prepare(
      `INSERT INTO password_resets (id, staff_id, token_hash, created_at, expires_at)
       VALUES (?1,?2,?3,?4,?5)`
    ).bind(uid(), staff.id, await sha256(token), now(),
           now() + RESET_MINUTES * 60_000),
    // Queued so the existing sender delivers it. Deliberately addressed to a
    // tenant audience with no tenant: that matches nobody's bell scope, so a
    // personal reset link can't surface in someone else's notifications, while
    // flushMail still picks it up because it selects on email_to.
    env.DB.prepare(
      `INSERT INTO notifications
         (id, ticket_id, audience, tenant_id, building_id, kind, payload,
          ref, created_at, email_to)
       VALUES (?1,NULL,'tenant',NULL,NULL,'password_reset',?2,NULL,?3,?4)`
    ).bind(uid(),
           JSON.stringify({ url: `${url.origin}/reset/${token}`, locale: staff.locale }),
           now(), addr),
  ]);
  return json(same);
}

/** Consume the link, set a new password, and end every other session. */
export async function consumeReset({ env, req }: RouteCtx) {
  const { token, password } = (await req.json()) as { token?: string; password?: string };
  if (!token) return bad("missing reset link");
  if (!password || password.length < MIN_PASSWORD) {
    return bad(`password needs at least ${MIN_PASSWORD} characters`);
  }

  const row = await env.DB.prepare(
    `SELECT r.id, r.staff_id FROM password_resets r
       JOIN staff s ON s.id = r.staff_id
      WHERE r.token_hash = ?1 AND r.consumed_at IS NULL AND r.expires_at > ?2
        AND s.disabled_at IS NULL`
  ).bind(await sha256(token), now()).first<any>();
  if (!row) return bad("that reset link is invalid or has expired", 401);

  const pw = await hashNewPassword(password);
  await env.DB.batch([
    env.DB.prepare(`UPDATE staff SET password_hash = ?1, password_salt = ?2 WHERE id = ?3`)
      .bind(pw.hash, pw.salt, row.staff_id),
    env.DB.prepare(`UPDATE password_resets SET consumed_at = ?1 WHERE id = ?2`)
      .bind(now(), row.id),
    // A reset is the one moment to assume somebody else may have been in there.
    env.DB.prepare(
      `UPDATE staff_sessions SET revoked_at = ?1 WHERE staff_id = ?2 AND revoked_at IS NULL`
    ).bind(now(), row.staff_id),
  ]);

  return sessionResponse("sid", await issueStaffSession(env, row.staff_id));
}

/* ---------------------------------------------------------------- */
/* signing up an organisation                                       */
/* ---------------------------------------------------------------- */

/**
 * Anyone may sign up; nothing works until a platform admin approves it.
 *
 * No password is chosen here. The signup issues a setup link to the address
 * given, which does two jobs at once: it proves the person controls that inbox,
 * and it lets them choose their own password. The domain of that address is
 * recorded as evidence — not proof of authority, but you can't get an address on
 * someone else's domain.
 */
export async function signupOrg({ env, req, url }: RouteCtx) {
  const { orgName, name, email } = (await req.json()) as
    { orgName?: string; name?: string; email?: string };

  if (!orgName?.trim()) return bad("name your organisation");
  if (!name?.trim()) return bad("your name, please");
  const addr = (email ?? "").trim().toLowerCase();
  if (!addr.includes("@") || addr.length < 6) return bad("a real email address, please");

  // Same throttle as sign-in: an open signup is otherwise a way to send mail.
  if (await tooManyAttempts(env, `signup:${addr}`)) {
    return bad("too many attempts — try again later", 429);
  }
  await recordAttempt(env, `signup:${addr}`, false);

  // Platform-wide, because staff.email is UNIQUE across the database.
  const clash = await env.DB.prepare(`SELECT id FROM staff WHERE email = ?1`)
    .bind(addr).first();
  if (clash) return bad("that email address is already in use", 409);

  const orgId = uid();
  const staffId = uid();
  const domain = addr.split("@")[1] ?? null;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO orgs (id, name, status, signup_email, signup_domain, created_at, slug_prefix)
       VALUES (?1,?2,'pending',?3,?4,?5,?6)`
    ).bind(orgId, orgName.trim().slice(0, 120), addr, domain, now(),
           await makeSlugPrefix(env, orgName)),
    env.DB.prepare(
      `INSERT INTO staff (id, email, display_name, locale, is_operator, org_id)
       VALUES (?1,?2,?3,'de',1,?4)`
    ).bind(staffId, addr, name.trim().slice(0, 80), orgId),
  ]);

  const token = await issueInvite(env, staffId);
  const link = `${url.origin}/setup/${token}`;

  // Queued to no bell audience: a personal setup link must not surface in
  // anyone's notifications. flushMail selects on email_to, so it still sends.
  await env.DB.prepare(
    `INSERT INTO notifications
       (id, ticket_id, audience, tenant_id, building_id, kind, payload, ref,
        created_at, email_to, org_id)
     VALUES (?1,NULL,'tenant',NULL,NULL,'org_setup',?2,NULL,?3,?4,?5)`
  ).bind(uid(), JSON.stringify({ url: link, orgName: orgName.trim() }),
         now(), addr, orgId).run();

  return json({
    ok: true,
    orgId,
    // Returned only in demo mode, so the flow can be walked through without a
    // working mail sender. Never in production.
    setupToken: env.DEMO_MODE === "true" ? token : undefined,
    message: "check your email for the link, then wait for approval",
  });
}

/* ---------------------------------------------------------------- */
/* the platform console                                             */
/* ---------------------------------------------------------------- */

function requirePlatformAdmin(p: Principal) {
  if (p.kind !== "operator" || !p.isPlatformAdmin) {
    throw new HttpError("platform admin only", 403);
  }
  return p;
}

/**
 * Every organisation, with counts only.
 *
 * Deliberately no ticket data. Approving an organisation and reading a few
 * hundred students' repair histories are different powers, and a console that
 * bundled them would be a bad answer to "who can see our tenants' reports?".
 */
export async function listOrgs({ env, p }: RouteCtx) {
  requirePlatformAdmin(p);
  const rows = await env.DB.prepare(
    `SELECT o.id, o.name, o.status, o.signup_email, o.signup_domain,
            o.created_at, o.approved_at, o.note,
            (SELECT COUNT(*) FROM buildings b WHERE b.org_id = o.id) AS buildings,
            (SELECT COUNT(*) FROM staff s WHERE s.org_id = o.id AND s.disabled_at IS NULL) AS staff,
            (SELECT COUNT(*) FROM staff s
              WHERE s.org_id = o.id AND s.password_hash IS NOT NULL) AS signed_in_ever
       FROM orgs o
      ORDER BY CASE o.status WHEN 'pending' THEN 0 ELSE 1 END, o.created_at DESC`
  ).all<any>();
  return json({ orgs: rows.results });
}

export async function setOrgStatus({ env, req, p, params }: RouteCtx) {
  const me = requirePlatformAdmin(p);
  const { status, note } = (await req.json()) as { status?: string; note?: string };

  if (!["active", "suspended", "rejected"].includes(String(status))) {
    return bad("status must be active, suspended or rejected");
  }
  // The demo organisation is permanent: it's what the landing page offers, and
  // suspending it would break the front door.
  if (params.id === "org-demo") return bad("the demo organisation can't be changed", 409);
  if (params.id === me.orgId) return bad("you can't change your own organisation", 409);

  const r = await env.DB.prepare(
    `UPDATE orgs
        SET status = ?1,
            note = COALESCE(?2, note),
            approved_at = CASE WHEN ?1 = 'active' AND approved_at IS NULL THEN ?3 ELSE approved_at END
      WHERE id = ?4 AND status != 'demo'`
  ).bind(status, note?.trim() || null, now(), params.id).run();
  if (!r.meta.changes) return bad("unknown organisation", 404);

  // Suspending has to end sessions, or someone stays inside until theirs expires.
  if (status !== "active") {
    await env.DB.prepare(
      `UPDATE staff_sessions SET revoked_at = ?1
        WHERE revoked_at IS NULL
          AND staff_id IN (SELECT id FROM staff WHERE org_id = ?2)`
    ).bind(now(), params.id).run();
  }
  return json({ ok: true, status });
}
