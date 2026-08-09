/**
 * lib.ts — i18n catalogue, code→label resolution, API client.
 *
 * Nothing user-visible is stored in the database. The database stores
 * 'KITCHEN' / 'SINK' / 'RISER'; this file is the only place those become words.
 * That's what lets the dashboard count sink leaks across the whole Bestand
 * regardless of which language each report was filed in.
 */

import {
  Droplet, Flame, Lightbulb, Refrigerator, Thermometer, ShowerHead,
  WashingMachine, DoorClosed, Wind, Plug, type LucideIcon,
} from "lucide-react";

export type Locale = "de" | "en";

/* ---------------------------------------------------------------- */
/* UI strings                                                       */
/* ---------------------------------------------------------------- */

export const T = {
  appName:       { de: "DormTag",                     en: "DormTag" },
  tenant:        { de: "Bewohner",                        en: "Resident" },
  staff:         { de: "Hausmeister",                     en: "Caretaker" },
  operator:      { de: "Verwaltung",                      en: "Operator" },
  signIn:        { de: "Rolle wählen",                    en: "Choose a role" },
  demoNote:      { de: "Jede Rolle erzeugt eine echte Sitzung.", en: "Each role issues a real session." },
  seedFirst:     { de: "Demodaten laden",                 en: "Load demo data" },
  seeding:       { de: "Wird geladen…",                   en: "Loading…" },
  logout:        { de: "Abmelden",                        en: "Sign out" },

  scanTitle:     { de: "Schaden melden",                  en: "Report a problem" },
  scanHint:      { de: "QR-Aufkleber im Raum scannen",    en: "Scan the sticker in the room" },
  simulate:      { de: "Aufkleber wählen (Demo)",         en: "Pick a sticker (demo)" },
  whatBroken:    { de: "Was ist defekt?",                 en: "What's broken?" },
  whatWrong:     { de: "Was ist das Problem?",            en: "What's wrong with it?" },
  noteOptional:  { de: "Notiz (optional)",                en: "Note (optional)" },
  send:          { de: "Absenden",                        en: "Send" },
  merged:        { de: "Zu bestehender Meldung hinzugefügt.", en: "Added to an existing report." },
  myReports:     { de: "Meine Meldungen",                 en: "My reports" },
  newReport:     { de: "Neue Meldung",                    en: "New report" },
  noReports:     { de: "Noch keine Meldungen.",           en: "No reports yet." },
  noReportsCta:  { de: "Melde etwas, das kaputt ist.",    en: "Report something that's broken." },

  pickSlot:      { de: "Termin wählen",                   en: "Pick a time" },
  pickSlotHint:  { de: "Der Hausmeister hat diese Zeiten angeboten.", en: "The caretaker offered these times." },
  onlyPrimary:   { de: "Nur der Zimmerbewohner kann den Termin wählen.", en: "Only the room's resident can pick the time." },
  changeAppt:    { de: "Termin ändern",                   en: "Change appointment" },
  enterWithoutMe:{ de: "Auch ohne mich betreten",         en: "Enter without me" },
  allowed:       { de: "erlaubt",                         en: "allowed" },
  notAllowed:    { de: "nicht erlaubt",                   en: "not allowed" },
  sharedRoom:    { de: "Gemeinschaftsraum — kein Termin nötig", en: "Shared room — no appointment needed" },
  reports:       { de: "Meldungen",                       en: "reports" },
  back:          { de: "Zurück",                          en: "Back" },

  queueToday:    { de: "Warteschlange",                   en: "Queue" },
  jobs:          { de: "Aufträge",                        en: "jobs" },
  queueNew:      { de: "Ohne Termin",                     en: "No appointment" },
  queueWaiting:  { de: "Wartet auf Teil",                 en: "Waiting for parts" },
  accept:        { de: "Annehmen",                        en: "Accept" },
  offerSlots:    { de: "Termine anbieten",                en: "Offer times" },
  slotsOffered:  { de: "Termine angeboten",               en: "Times offered" },
  awaitingPick:  { de: "Bewohner wählt noch",             en: "Resident hasn't picked yet" },
  goFix:         { de: "Ohne Termin erledigen",           en: "Fix without appointment" },
  causeQ:        { de: "Was war die Ursache?",            en: "What was the cause?" },
  markDone:      { de: "Erledigt",                        en: "Done" },
  noAccess:      { de: "Niemand angetroffen",             en: "Nobody home" },
  partWhat:      { de: "Welches Teil?",                   en: "Which part?" },
  supplierEta:   { de: "Laut Händler",                    en: "Supplier says" },
  orderPart:     { de: "Teil bestellen",                  en: "Order part" },
  partArrived:   { de: "Teil ist da",                     en: "Part arrived" },

  openTickets:   { de: "Offene Meldungen",                en: "Open tickets" },
  medianFix:     { de: "Median bis Erledigung",           en: "Median time to fix" },
  waitingParts:  { de: "Wartet auf Teile",                en: "Waiting for parts" },
  failedVisits:  { de: "Vergebliche Besuche",             en: "Failed visits" },
  repeatFaults:  { de: "Wiederkehrende Fehler",           en: "Repeat faults" },
  last12:        { de: "letzte 12 Monate",                en: "last 12 months" },
  ticketsWord:   { de: "Meldungen",                       en: "tickets" },
  roomsAffected: { de: "Zimmer betroffen",                en: "rooms affected" },
  systemicHint:  { de: "Ursache Strang/Leitung in",       en: "Cause logged as riser in" },
  ofWord:        { de: "von",                             en: "of" },
  buildings:     { de: "Gebäude",                         en: "Buildings" },
  roomsWord:     { de: "Zimmer",                          en: "rooms" },
  openWord:      { de: "offen",                           en: "open" },
  nothingFlagged:{ de: "Keine Auffälligkeiten.",          en: "Nothing flagged." },

  st_reported:   { de: "Gemeldet",                        en: "Reported" },
  st_accepted:   { de: "Angenommen",                      en: "Accepted" },
  st_slots_offered:{ de: "Termine angeboten",             en: "Times offered" },
  st_scheduled:  { de: "Termin steht",                    en: "Appointment set" },
  st_waiting_for_parts: { de: "Wartet auf Teil",          en: "Waiting for part" },
  st_done:       { de: "Erledigt",                        en: "Done" },
  st_cancelled:  { de: "Abgebrochen",                     en: "Cancelled" },
} as const;

export type StrKey = keyof typeof T;

/** Event reason codes → timeline labels. */
export const REASON = {
  reported:      { de: "Gemeldet",                     en: "Reported" },
  accepted:      { de: "Vom Hausmeister angenommen",   en: "Accepted by caretaker" },
  slots_offered: { de: "Termine angeboten",            en: "Times offered" },
  booked:        { de: "Termin gebucht",               en: "Appointment booked" },
  rebooked:      { de: "Termin geändert",              en: "Appointment changed" },
  reschedule:    { de: "Termin abgesagt",              en: "Appointment cancelled" },
  no_access:     { de: "Niemand angetroffen",          en: "Nobody was home" },
  part_ordered:  { de: "Teil bestellt",                en: "Part ordered" },
  part_arrived:  { de: "Teil geliefert",               en: "Part arrived" },
  fixed:         { de: "Erledigt",                     en: "Fixed" },
} as const;

export const ROOM_TYPE = {
  BEDROOM:  { de: "Zimmer",     en: "Bedroom" },
  KITCHEN:  { de: "Küche",      en: "Kitchen" },
  BATHROOM: { de: "Bad",        en: "Bathroom" },
  HALLWAY:  { de: "Flur",       en: "Hallway" },
  LAUNDRY:  { de: "Waschküche", en: "Laundry" },
} as const;

export const OBJECT_TYPE: Record<string, { de: string; en: string; icon: LucideIcon }> = {
  SINK:     { de: "Spüle",         en: "Sink",     icon: Droplet },
  STOVE:    { de: "Herd",          en: "Stove",    icon: Flame },
  LIGHT:    { de: "Licht",         en: "Light",    icon: Lightbulb },
  FRIDGE:   { de: "Kühlschrank",   en: "Fridge",   icon: Refrigerator },
  RADIATOR: { de: "Heizung",       en: "Radiator", icon: Thermometer },
  SHOWER:   { de: "Dusche",        en: "Shower",   icon: ShowerHead },
  DRAIN:    { de: "Abfluss",       en: "Drain",    icon: Droplet },
  WASHER:   { de: "Waschmaschine", en: "Washer",   icon: WashingMachine },
  DOOR:     { de: "Tür",           en: "Door",     icon: DoorClosed },
  WINDOW:   { de: "Fenster",       en: "Window",   icon: Wind },
  SOCKET:   { de: "Steckdose",     en: "Socket",   icon: Plug },
};

export const SYMPTOM = {
  LEAKING:  { de: "undicht",         en: "leaking" },
  BLOCKED:  { de: "verstopft",       en: "blocked" },
  NO_POWER: { de: "geht nicht",      en: "not working" },
  COLD:     { de: "wird nicht warm", en: "not heating" },
  NOISE:    { de: "macht Geräusche", en: "making noise" },
  BROKEN:   { de: "kaputt",          en: "broken" },
} as const;

export const SYMPTOMS_FOR: Record<string, (keyof typeof SYMPTOM)[]> = {
  SINK: ["LEAKING", "BLOCKED", "BROKEN"],
  DRAIN: ["BLOCKED", "LEAKING", "NOISE"],
  SHOWER: ["LEAKING", "BLOCKED", "COLD", "BROKEN"],
  LIGHT: ["NO_POWER", "BROKEN"],
  SOCKET: ["NO_POWER", "BROKEN"],
  STOVE: ["NO_POWER", "BROKEN"],
  FRIDGE: ["NO_POWER", "NOISE", "COLD"],
  RADIATOR: ["COLD", "NOISE", "LEAKING"],
  WASHER: ["NO_POWER", "LEAKING", "NOISE"],
  DOOR: ["BROKEN", "NOISE"],
  WINDOW: ["BROKEN", "COLD", "LEAKING"],
};

export const CAUSE = {
  SEAL:        { de: "Dichtung",       en: "Seal" },
  BLOCKAGE:    { de: "Verstopfung",    en: "Blockage" },
  RISER:       { de: "Rohr / Strang",  en: "Riser / pipe" },
  WIRING:      { de: "Leitung",        en: "Wiring" },
  CONSUMABLE:  { de: "Verschleißteil", en: "Consumable" },
  USER_DAMAGE: { de: "Nutzerschaden",  en: "User damage" },
} as const;

export const CAUSES_FOR: Record<string, (keyof typeof CAUSE)[]> = {
  SINK: ["SEAL", "BLOCKAGE", "RISER", "USER_DAMAGE"],
  DRAIN: ["BLOCKAGE", "RISER", "SEAL", "USER_DAMAGE"],
  SHOWER: ["SEAL", "BLOCKAGE", "RISER", "USER_DAMAGE"],
  LIGHT: ["CONSUMABLE", "WIRING", "USER_DAMAGE"],
  SOCKET: ["WIRING", "USER_DAMAGE"],
  STOVE: ["CONSUMABLE", "WIRING", "USER_DAMAGE"],
  FRIDGE: ["CONSUMABLE", "WIRING", "USER_DAMAGE"],
  RADIATOR: ["RISER", "SEAL", "CONSUMABLE"],
  WASHER: ["CONSUMABLE", "WIRING", "BLOCKAGE"],
  DOOR: ["CONSUMABLE", "USER_DAMAGE"],
  WINDOW: ["SEAL", "USER_DAMAGE"],
};

/* ---------------------------------------------------------------- */
/* formatting                                                       */
/* ---------------------------------------------------------------- */

const tag = (l: Locale) => (l === "de" ? "de-DE" : "en-GB");

export const fmtDay = (ms: number, l: Locale) =>
  new Date(ms).toLocaleDateString(tag(l), { weekday: "short", day: "numeric", month: "short" });
export const fmtTime = (ms: number, l: Locale) =>
  new Date(ms).toLocaleTimeString(tag(l), { hour: "2-digit", minute: "2-digit" });
export const fmtDT = (ms: number, l: Locale) => `${fmtDay(ms, l)} · ${fmtTime(ms, l)}`;

export const STATE_TONE: Record<string, string> = {
  reported: "neutral", accepted: "neutral", slots_offered: "warn",
  scheduled: "info", waiting_for_parts: "warn", done: "ok", cancelled: "neutral",
};

/** The signature element: the enamel door plate. */
export function plate(loc: any, l: Locale) {
  return `${loc.building_code}-${loc.unit_code} · ${roomLabel(loc.room_type, l)}`;
}

export function title(loc: any, symptom: string, l: Locale) {
  return `${objLabel(loc.object_type, l)} ${symptomLabel(symptom, l)}`;
}

/* ---------------------------------------------------------------- */
/* API client                                                       */
/* ---------------------------------------------------------------- */

async function call(path: string, init?: RequestInit) {
  const res = await fetch("/api" + path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error || `HTTP ${res.status}`);
  return body as any;
}

const post = (path: string, body?: unknown) =>
  call(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export const api = {
  session:     () => call("/session"),
  demoLogin:   (as: string) => post("/session/demo", { as }),
  logout:      () => post("/session/logout"),
  seed:        () => post("/dev/seed"),

  myRooms:     () => call("/my-rooms"),
  tickets:     () => call("/tickets"),
  ticket:      (id: string) => call(`/tickets/${id}`),
  report:      (objectId: string, symptom: string, note: string) =>
                 post("/tickets", { objectId, symptom, note }),

  accept:      (id: string) => post(`/tickets/${id}/accept`),
  offer:       (id: string) => post(`/tickets/${id}/offer`),
  book:        (id: string, slotId: string) => post(`/tickets/${id}/book`, { slotId }),
  reschedule:  (id: string) => post(`/tickets/${id}/reschedule`),
  noAccess:    (id: string) => post(`/tickets/${id}/no-access`),
  orderPart:   (id: string, what: string, eta: string) => post(`/tickets/${id}/part`, { what, eta }),
  partArrived: (id: string) => post(`/tickets/${id}/part-arrived`),
  done:        (id: string, cause: string) => post(`/tickets/${id}/done`, { cause }),
  consent:     (id: string, value: boolean) => post(`/tickets/${id}/consent`, { value }),

  dashboard:   () => call("/dashboard"),
};

/* ---------------------------------------------------------------- */
/* label resolution — the only place a code becomes a word           */
/* ---------------------------------------------------------------- */

const pick = (table: Record<string, any>, code: string, l: Locale, fallback?: string) =>
  (table[code]?.[l] as string) ?? fallback ?? code;

export const roomLabel    = (code: string, l: Locale) => pick(ROOM_TYPE, code, l);
export const objLabel     = (code: string, l: Locale) => pick(OBJECT_TYPE, code, l);
export const symptomLabel = (code: string, l: Locale) => pick(SYMPTOM, code, l);
export const causeLabel   = (code: string, l: Locale) => pick(CAUSE, code, l);
export const reasonLabel  = (code: string, l: Locale) => pick(REASON, code, l);
export const objIcon      = (code: string): LucideIcon | undefined => OBJECT_TYPE[code]?.icon;
