/**
 * core.ts — the pieces index.ts and admin.ts both need.
 *
 * These cannot live in index.ts: the Workers runtime treats every named export
 * of the entry module as a handler, and rejects the module outright when one of
 * them is a number ("Incorrect type for map entry 'DAY'").
 */

export interface Env {
  DB: D1Database;
  DEMO_MODE: string;
  ASSETS: Fetcher;
}


/* --- tiny helpers ------------------------------------------------ */

export const now = () => Date.now();
export const uid = () => crypto.randomUUID();
export const DAY = 864e5;

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });

export const bad = (msg: string, status = 400) => json({ error: msg }, { status });


/* --- crypto ------------------------------------------------------ */

const enc = new TextEncoder();

export async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken() {
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
/* ---- password hashing (PBKDF2-SHA256) ---- */

const PBKDF2_ITERATIONS = 100_000;

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function derivePassword(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256
  );
  return toHex(bits);
}

export async function hashNewPassword(password: string) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = toHex(saltBytes.buffer);
  return { salt, hash: await derivePassword(password, salt) };
}

/** Constant-time-ish comparison so a wrong password can't be timed. */
export function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---- login throttling ---- */

const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW = 15 * 60 * 1000;

export async function tooManyAttempts(env: Env, identifier: string) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE identifier = ?1 AND succeeded = 0 AND attempted_at > ?2`
  ).bind(identifier.toLowerCase(), now() - ATTEMPT_WINDOW).first<any>();
  return (row?.n ?? 0) >= MAX_ATTEMPTS;
}

export async function recordAttempt(env: Env, identifier: string, ok: boolean) {
  await env.DB.prepare(
    `INSERT INTO login_attempts (identifier, succeeded, attempted_at) VALUES (?1,?2,?3)`
  ).bind(identifier.toLowerCase(), ok ? 1 : 0, now()).run();
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") || "";
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(name + "="));
  if (!hit) return null;
  const value = decodeURIComponent(hit.slice(name.length + 1)).trim();
  // Reject anything that isn't a plausible token before touching the database.
  return /^[A-Za-z0-9_-]{20,}$/.test(value) ? value : null;
}

export function setCookie(name: string, value: string, maxAgeSec: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
export const clearCookie = (name: string) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;


/* --- principal --------------------------------------------------- */

export type Principal =
  | { kind: "anonymous" }
  | { kind: "token"; ticketId: string; reporterId: string; isPrimary: boolean; locale: string }
  | { kind: "tenant"; tenantId: string; roomId: string; unitId: string; locale: string }
  | { kind: "staff"; staffId: string; name: string; buildingIds: string[]; locale: string }
  | { kind: "operator"; staffId: string; name: string; locale: string };

export const isStaff = (p: Principal) => p.kind === "staff" || p.kind === "operator";

/* --- errors ------------------------------------------------------ */

export class HttpError extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

/* --- sessions ---------------------------------------------------- */

export async function issueStaffSession(env: Env, staffId: string) {
  const token = randomToken();
  await env.DB.prepare(
    `INSERT INTO staff_sessions (id, staff_id, token_hash, issued_at, expires_at) VALUES (?1,?2,?3,?4,?5)`
  ).bind(uid(), staffId, await sha256(token), now(), now() + 7 * DAY).run();
  return token;
}

export async function issueTenantSession(env: Env, tenantId: string) {
  const token = randomToken();
  await env.DB.prepare(
    `INSERT INTO tenant_sessions (id, tenant_id, token_hash, issued_at, expires_at) VALUES (?1,?2,?3,?4,?5)`
  ).bind(uid(), tenantId, await sha256(token), now(), now() + 7 * DAY).run();
  return token;
}

export function sessionResponse(cookieName: "sid" | "tid", token: string) {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", setCookie(cookieName, token, 7 * 86400));
  headers.append("set-cookie", clearCookie(cookieName === "sid" ? "tid" : "sid"));
  return new Response(JSON.stringify({ ok: true }), { headers });
}

/** The shape every route handler receives. */
export type RouteCtx = {
  req: Request; env: Env; p: Principal; url: URL; params: Record<string, string>;
};
