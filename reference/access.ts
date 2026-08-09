/**
 * access.ts — one place where "who is this" and "what may they touch" is decided.
 *
 * Rule: no route handler ever reads a role from the request body, a query
 * param, or a header the client controls. The principal is derived only from
 * a signed cookie or a token looked up in the database.
 */

import { createHash, randomBytes } from "crypto";

export type Principal =
  | { kind: "anonymous" }
  | { kind: "token"; ticketId: string; reporterId: string; locale: Locale }
  | { kind: "tenant"; tenantId: string; roomId: string; unitId: string; locale: Locale }
  | { kind: "staff"; staffId: string; buildingIds: string[]; locale: Locale }
  | { kind: "operator"; staffId: string; locale: Locale };

type Locale = "de" | "en";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

/* ------------------------------------------------------------------ */
/* 1. resolve the principal                                            */
/* ------------------------------------------------------------------ */

export async function resolvePrincipal(req: Request, db: Db): Promise<Principal> {
  // Staff session cookie wins — it's the strongest credential present.
  const sid = readSignedCookie(req, "sid");
  if (sid) {
    const row = await db.one(
      `select s.id, s.is_operator, s.locale
         from staff_sessions ss
         join staff s on s.id = ss.staff_id
        where ss.token_hash = $1
          and ss.revoked_at is null
          and ss.expires_at > now()`,
      [sha256(sid)]
    );
    if (row) {
      await db.exec(`update staff_sessions set last_seen_at = now() where token_hash = $1`, [sha256(sid)]);
      if (row.is_operator) {
        return { kind: "operator", staffId: row.id, locale: row.locale };
      }
      const buildings = await db.many(
        `select building_id from staff_buildings where staff_id = $1`, [row.id]
      );
      return {
        kind: "staff",
        staffId: row.id,
        buildingIds: buildings.map((b) => b.building_id),
        locale: row.locale,
      };
    }
  }

  // Tenant session (activated account, magic-link login).
  const tid = readSignedCookie(req, "tid");
  if (tid) {
    const row = await db.one(
      `select t.id as tenant_id, t.locale, r.id as room_id, r.unit_id
         from tenants t
         join tenancies tn on tn.tenant_id = t.id and tn.ends_on is null
         join rooms r on r.id = tn.room_id
        where t.id = $1 and t.activated_at is not null`,
      [tid]
    );
    if (row) {
      return {
        kind: "tenant",
        tenantId: row.tenant_id,
        roomId: row.room_id,
        unitId: row.unit_id,
        locale: row.locale,
      };
    }
  }

  // Capability token from a /t/:token link. Scoped to one ticket, nothing more.
  const bare = new URL(req.url).pathname.match(/^\/t\/([A-Za-z0-9_-]{20,})$/)?.[1];
  if (bare) {
    const row = await db.one(
      `select id, ticket_id, locale
         from ticket_reporters
        where token = $1
          and (token_expires_at is null or token_expires_at > now())`,
      [bare]
    );
    if (row) {
      return { kind: "token", ticketId: row.ticket_id, reporterId: row.id, locale: row.locale };
    }
  }

  return { kind: "anonymous" };
}

/* ------------------------------------------------------------------ */
/* 2. bind the principal to the transaction (drives RLS)               */
/* ------------------------------------------------------------------ */

export async function bindPrincipal(tx: Tx, p: Principal) {
  await tx.exec(`select set_config('app.principal_kind', $1, true)`, [p.kind]);
  if (p.kind === "staff" || p.kind === "operator") {
    await tx.exec(`select set_config('app.staff_id', $1, true)`, [p.staffId]);
  }
  if (p.kind === "tenant") {
    await tx.exec(`select set_config('app.tenant_id', $1, true)`, [p.tenantId]);
  }
  if (p.kind === "token") {
    await tx.exec(`select set_config('app.ticket_id', $1, true)`, [p.ticketId]);
  }
}

/* ------------------------------------------------------------------ */
/* 3. capability checks — what each principal may DO, not just see      */
/* ------------------------------------------------------------------ */

export const can = {
  /** Only the room's own resident consents to entry. Flatmates may not. */
  grantAccess(p: Principal, ticket: TicketRow): boolean {
    if (p.kind === "token") return p.reporterId === ticket.primary_reporter_id;
    if (p.kind === "tenant") return ticket.room_kind === "shared"
      ? ticket.unit_id === p.unitId
      : ticket.room_id === p.roomId;
    return false;
  },

  /** Same rule for picking or changing the appointment. */
  bookSlot(p: Principal, ticket: TicketRow): boolean {
    return can.grantAccess(p, ticket);
  },

  /** Anyone reaching the report form may file one — that's the point. */
  report(): boolean {
    return true;
  },

  acceptTicket(p: Principal): boolean {
    return p.kind === "staff" || p.kind === "operator";
  },

  closeTicket(p: Principal, ticket: TicketRow): boolean {
    if (p.kind === "operator") return true;
    return p.kind === "staff" && p.buildingIds.includes(ticket.building_id);
  },

  /** Aggregates only. Nobody queries per-Hausmeister performance. */
  viewDashboard(p: Principal): boolean {
    return p.kind === "operator";
  },
};

/* ------------------------------------------------------------------ */
/* 4. demo mode — keeps the portfolio clickable without faking auth     */
/* ------------------------------------------------------------------ */

/**
 * In DEMO_MODE the seed script creates three real sessions and the landing
 * page offers three buttons that set the corresponding real cookie. The
 * reviewer clicks between roles; the auth path underneath is the production
 * one. Never a client-side `role` variable.
 */
export const DEMO_MODE = process.env.DEMO_MODE === "true";

export async function issueDemoSession(db: Db, email: string) {
  if (!DEMO_MODE) throw new Error("demo sessions are disabled");
  const token = newToken();
  await db.exec(
    `insert into staff_sessions (staff_id, token_hash, expires_at)
     select id, $2, now() + interval '7 days' from staff where email = $1`,
    [email, sha256(token)]
  );
  return token;
}

/* --- ambient types, replace with your db client's --- */
type Db = { one(q: string, p?: unknown[]): Promise<any>; many(q: string, p?: unknown[]): Promise<any[]>; exec(q: string, p?: unknown[]): Promise<void> };
type Tx = Db;
type TicketRow = {
  id: string; room_id: string; unit_id: string; building_id: string;
  room_kind: "private" | "shared"; primary_reporter_id: string | null;
};
declare function readSignedCookie(req: Request, name: string): string | null;
