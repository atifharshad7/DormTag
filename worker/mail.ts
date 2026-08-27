/**
 * mail.ts — turning queued notifications into email.
 *
 * The outbox pattern matters here. Sending inline would mean a caretaker waits
 * on Resend to offer times, and a Resend outage would fail his ticket update.
 * So the notification is written in the same batch as the state change, and the
 * send happens afterwards: fast path via `ctx.waitUntil`, reliability path via
 * the cron picking up whatever failed.
 *
 * Text only, no HTML. These are five-line status messages, and plain text can't
 * render wrong, can't leak a tracking pixel, and lands in fewer spam folders.
 */

import { type Env, now, DAY } from "./core";

const FROM = "DormTag <status@dormtag.com>";
const MAX_ATTEMPTS = 4;
const BATCH = 20;

/** How long a resident's own report stays worth emailing about. */
const STALE_AFTER = 30 * DAY;

type Locale = "de" | "en";

/**
 * Labels for the codes that appear in email.
 *
 * The frontend has its own catalogue in lib.ts, but a Worker sending mail from
 * a cron has no frontend to ask. Duplicating these two small maps is better
 * than letting BATHROOM or ELECTRICAL reach a resident's inbox, which is what
 * happened before the preview existed.
 */
const ROOM: Record<string, { de: string; en: string }> = {
  BEDROOM:  { de: "Zimmer",     en: "Bedroom" },
  KITCHEN:  { de: "Küche",      en: "Kitchen" },
  BATHROOM: { de: "Bad",        en: "Bathroom" },
  HALLWAY:  { de: "Flur",       en: "Hallway" },
  LAUNDRY:  { de: "Waschküche", en: "Laundry" },
};

const TRADE: Record<string, { de: string; en: string }> = {
  ELECTRICAL: { de: "Elektro",    en: "electrical" },
  PLUMBING:   { de: "Sanitär",    en: "plumbing" },
  HEATING:    { de: "Heizung",    en: "heating" },
  LOCKSMITH:  { de: "Schlosser",  en: "locksmith" },
  GLAZING:    { de: "Glaser",     en: "glazing" },
  PEST:       { de: "Schädlinge", en: "pest control" },
  LIFT:       { de: "Aufzug",     en: "lift" },
  OTHER:      { de: "Sonstiges",  en: "other" },
};

const label = (map: typeof ROOM, code: string | null, l: Locale) =>
  (code && map[code]?.[l]) || code || "";

/* ---------------------------------------------------------------- */
/* templates                                                       */
/* ---------------------------------------------------------------- */

const T = {
  de: {
    place: (b: string, u: string, r: string) => `${b}-${u} · ${r}`,
    open: "Vorgang ansehen",
    footer: (origin: string) =>
      `Du bekommst diese Mail, weil du einen Schaden gemeldet hast.\n${origin}`,

    slots_offered: (n: number) => ({
      subject: n === 1 ? "Ein Termin steht zur Auswahl" : `${n} Termine stehen zur Auswahl`,
      body: n === 1
        ? "Der Hausmeister hat einen Termin angeboten. Bestätige ihn, damit er kommen kann."
        : `Der Hausmeister hat ${n} Termine angeboten. Wähle einen aus, der dir passt.`,
    }),
    booked: () => ({
      subject: "Termin bestätigt",
      body: "Dein Termin ist eingetragen.",
    }),
    staff_cancelled: () => ({
      subject: "Termin abgesagt",
      body: "Der Termin musste abgesagt werden. Neue Zeiten folgen.",
    }),
    part_ordered: (part: string | null, eta: string | null) => ({
      subject: "Ein Ersatzteil ist bestellt",
      body: `Die Reparatur wartet auf ein Teil${part ? `: ${part}` : ""}.`
        + (eta ? ` Laut Händler: ${eta}.` : "")
        + " Sobald es da ist, gibt es einen neuen Termin.",
    }),
    part_arrived: () => ({
      subject: "Das Teil ist da",
      body: "Das Ersatzteil ist angekommen. Wähle einen Termin für die Reparatur.",
    }),
    fixed: () => ({
      subject: "Erledigt",
      body: "Die Reparatur ist abgeschlossen. Falls doch noch etwas ist, melde es einfach neu.",
    }),
    escalated: (trade: string | null) => ({
      subject: "Ein Fachbetrieb übernimmt",
      body: `Der Hausmeister hat die Reparatur an einen Fachbetrieb weitergegeben${trade ? ` (${trade})` : ""}.`,
    }),
    reminder: (when: string, clock: string) => ({
      subject: `Termin morgen: ${when}`,
      body: `Der Hausmeister kommt morgen um ${clock}.`
        + " Wenn du nicht da sein kannst, ändere den Termin oder erlaube den Zutritt ohne dich.",
    }),
  },

  en: {
    place: (b: string, u: string, r: string) => `${b}-${u} · ${r}`,
    open: "Open the report",
    footer: (origin: string) =>
      `You're getting this because you reported a problem.\n${origin}`,

    slots_offered: (n: number) => ({
      subject: n === 1 ? "One appointment time to choose" : `${n} appointment times to choose`,
      body: n === 1
        ? "The caretaker offered a time. Confirm it so he can come."
        : `The caretaker offered ${n} times. Pick whichever suits you.`,
    }),
    booked: () => ({
      subject: "Appointment confirmed",
      body: "Your appointment is set.",
    }),
    staff_cancelled: () => ({
      subject: "Appointment cancelled",
      body: "The appointment had to be cancelled. New times will follow.",
    }),
    part_ordered: (part: string | null, eta: string | null) => ({
      subject: "A part is on order",
      body: `The repair is waiting on a part${part ? `: ${part}` : ""}.`
        + (eta ? ` The supplier says: ${eta}.` : "")
        + " Once it arrives you'll get a new appointment.",
    }),
    part_arrived: () => ({
      subject: "The part arrived",
      body: "The part is here. Pick a time for the repair.",
    }),
    fixed: () => ({
      subject: "Fixed",
      body: "The repair is done. If something's still wrong, just report it again.",
    }),
    escalated: (trade: string | null) => ({
      subject: "An external firm is taking this on",
      body: `The caretaker handed the repair to a qualified firm${trade ? ` (${trade})` : ""}.`,
    }),
    reminder: (when: string, clock: string) => ({
      subject: `Appointment tomorrow: ${when}`,
      body: `The caretaker is coming tomorrow at ${clock}.`
        + " If you can't be there, change the time or allow entry without you.",
    }),
  },
} as const;

/** The building's clock, not the server's: a Worker runs in UTC. */
function localDateTime(ms: number, locale: Locale) {
  return new Date(ms).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Just the clock time: the subject line already carries the day. */
function localClock(ms: number, locale: Locale) {
  return new Date(ms).toLocaleTimeString(locale === "de" ? "de-DE" : "en-GB", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit",
  });
}

export function renderMail(row: any, origin: string): { subject: string; text: string } | null {
  const locale: Locale = row.locale === "en" ? "en" : "de";
  const s = T[locale];
  const payload = (() => {
    try { return JSON.parse(row.payload || "{}"); } catch { return {}; }
  })();

  let m: { subject: string; body: string } | null = null;
  switch (row.kind) {
    case "slots_offered":   m = s.slots_offered(Number(payload.count) || 1); break;
    case "booked":
    case "rebooked":        m = s.booked(); break;
    case "staff_cancelled": m = s.staff_cancelled(); break;
    case "part_ordered":    m = s.part_ordered(payload.part ?? null, payload.eta ?? null); break;
    case "part_arrived":    m = s.part_arrived(); break;
    case "fixed":           m = s.fixed(); break;
    case "escalated":
      m = s.escalated(label(TRADE, payload.trade ?? null, locale) || null); break;
    case "reminder":
      m = s.reminder(
        localDateTime(Number(payload.startsAt), locale),
        localClock(Number(payload.startsAt), locale),
      ); break;
    // Anything else is bell-only. A caretaker doesn't want an email per report.
    default: return null;
  }

  const place = row.building_code
    ? s.place(row.building_code, row.unit_code,
        row.room_label || label(ROOM, row.room_type, locale))
    : "";
  const link = row.token ? `${origin}/t/${row.token}` : origin;

  return {
    subject: place ? `${place}: ${m.subject}` : m.subject,
    text: [place, "", m.body, "", `${s.open}: ${link}`, s.footer(origin)]
      .filter((x) => x !== undefined).join("\n").trim(),
  };
}

/* ---------------------------------------------------------------- */
/* sending                                                         */
/* ---------------------------------------------------------------- */

export type Sender = (msg: { to: string; subject: string; text: string }) =>
  Promise<{ ok: true } | { ok: false; error: string; retry: boolean }>;

/** The real sender. Swapped for a stub in tests so the suite costs nothing. */
export function resendSender(apiKey: string): Sender {
  return async ({ to, subject, text }) => {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from: FROM, to, subject, text }),
      });
      if (res.ok) return { ok: true };

      const body = await res.text();
      // 4xx other than rate limiting means the message itself is wrong: a bad
      // address, a rejected domain. Retrying can only waste attempts.
      const retry = res.status === 429 || res.status >= 500;
      return { ok: false, error: `${res.status} ${body.slice(0, 200)}`, retry };
    } catch (e: any) {
      return { ok: false, error: String(e).slice(0, 200), retry: true };
    }
  };
}

/**
 * Send what's queued and unsent.
 *
 * Called twice: right after a response via `ctx.waitUntil` for immediacy, and
 * from the cron for anything that failed. Both paths are the same function, so
 * there's only one behaviour to reason about.
 */
export async function flushMail(env: Env, origin: string, send?: Sender) {
  const key = env.RESEND_API_KEY;
  const sender = send ?? (key ? resendSender(key) : null);
  // No key configured is a normal state, not an error: the bell still works and
  // the queue simply waits until sending is switched on.
  if (!sender) return { sent: 0, failed: 0, skipped: 0, configured: false };

  const due = await env.DB.prepare(
    `SELECT n.id, n.kind, n.payload, n.email_to, n.created_at,
            t.locale,
            vtl.building_code, vtl.unit_code, vtl.room_type, vtl.room_label,
            (SELECT tr.token FROM ticket_reporters tr
              WHERE tr.ticket_id = n.ticket_id AND tr.tenant_id = n.tenant_id
                AND tr.token NOT LIKE 'revoked-%' AND tr.token NOT LIKE 'expired-%'
              LIMIT 1) AS token
       FROM notifications n
       LEFT JOIN tenants t ON t.id = n.tenant_id
       LEFT JOIN v_ticket_location vtl ON vtl.ticket_id = n.ticket_id
      WHERE n.email_to IS NOT NULL
        AND n.emailed_at IS NULL
        AND n.email_attempts < ?1
        AND n.created_at > ?2
      ORDER BY n.created_at
      LIMIT ?3`
  ).bind(MAX_ATTEMPTS, now() - STALE_AFTER, BATCH).all<any>();

  let sent = 0, failed = 0, skipped = 0;

  for (const row of due.results) {
    const msg = renderMail(row, origin);
    if (!msg) {
      // Nothing to say by email for this kind. Mark it done so it stops
      // being picked up on every run.
      await env.DB.prepare(`UPDATE notifications SET emailed_at = ?1 WHERE id = ?2`)
        .bind(now(), row.id).run();
      skipped++;
      continue;
    }

    const result = await sender({ to: row.email_to, subject: msg.subject, text: msg.text });
    if (result.ok) {
      await env.DB.prepare(`UPDATE notifications SET emailed_at = ?1 WHERE id = ?2`)
        .bind(now(), row.id).run();
      sent++;
    } else {
      await env.DB.prepare(
        `UPDATE notifications
            SET email_attempts = ?1, email_error = ?2
          WHERE id = ?3`
      ).bind(result.retry ? row.email_attempts + 1 : MAX_ATTEMPTS, result.error, row.id).run();
      failed++;
    }
  }

  return { sent, failed, skipped, configured: true };
}
