import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  QrCode, Calendar, Clock, Check, ChevronLeft, Package, AlertTriangle, Key,
  Wrench, LayoutDashboard, Languages, User, Users, ArrowRight, Plus,
  LogOut, Camera, Building, Send, Settings, CalendarX, Search, FlaskConical,
} from "lucide-react";
import {
  api, T, SYMPTOMS_FOR, CAUSE, CAUSES_FOR,
  roomLabel, roomIcon, objLabel, objIcon, symptomLabel, causeLabel, reasonLabel,
  tradeLabel, escReason, TRADE, ESC_REASON,
  fmtDay, fmtDT, fmtTime, plate, title, STATE_TONE, type Locale, type StrKey,
} from "./lib";
import { SignIn, ScanLanding, ReportDone, StickerSheet } from "./Auth";
import { ScannerModal } from "./Scanner";
import { SlotPicker, type SlotRules } from "./SlotPicker";
import { OperatorView } from "./Operator";
import { Logo } from "./Logo";
import { parse, href, readQuery, queryString, type Route } from "./router";
import { StaffPage, BuildingsPage, FirstRunSetup, AcceptInvite, ForgotPassword, ResetPassword, ChangePassword } from "./Admin";
import { Account } from "./Account";
import { Landing, DemoPicker, SignUpOrg, OrgWaiting, SignInModal, DemoModal } from "./Landing";
import { Platform } from "./Platform";
import { About } from "./Auth";
import { BellButton, NotificationPanel, useNotifications } from "./Notifications";

/* ---------------------------------------------------------------- */
/* small shared pieces                                              */
/* ---------------------------------------------------------------- */

const Plate = ({ children, sm }: any) => (
  <span className={"plate" + (sm ? " plate-sm" : "")}>{children}</span>
);
const Pill = ({ tone, children }: any) => <span className={"pill pill-" + tone}>{children}</span>;

function Tile({ icon: Icon, label, active, onClick }: any) {
  return (
    <button className={"tile" + (active ? " tile-on" : "") + (Icon ? "" : " tile-text")} onClick={onClick}>
      {Icon && <Icon size={26} strokeWidth={1.5} aria-hidden />}
      <span>{label}</span>
    </button>
  );
}

function Err({ msg, onClose }: any) {
  if (!msg) return null;
  return <div className="err" role="alert" onClick={onClose}>{msg}</div>;
}

/* ---------------------------------------------------------------- */
/* sign-in                                                          */
/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
/* resident                                                         */
/* ---------------------------------------------------------------- */

function TenantView({ l, t, tickets, reload, home, onScan, recentDays, openTicket, onOpenTicket,
  wizard, onWizard }: {
  l: Locale; t: (k: StrKey) => string; tickets: any[]; reload: () => Promise<void>;
  home: any; onScan: () => void; recentDays: number;
  /* The open ticket comes from the URL, so back closes it and a link opens it. */
  openTicket: string | null; onOpenTicket: (id: string | null) => void;
  /* The wizard's step lives in the URL too, so back moves up the wizard rather
     than out of the app — which is where it went before, taking the note with
     it. The note itself stays in state here, so stepping back and forward keeps
     what was typed. */
  wizard: { step: "none" | "rooms" | "objects" | "symptom"; roomId?: string; objectId?: string };
  onWizard: (roomId?: string, objectId?: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [symptom, setSymptom] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const openId = openTicket;
  const setOpenId = onOpenTicket;
  const [flash, setFlash] = useState("");
  const [showOlder, setShowOlder] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api.myRooms().then((d) => setRows(d.rows)).catch(() => {}); }, []);

  const screen = wizard.step === "none" ? "list"
    : wizard.step === "rooms" ? "scan"
    : wizard.step === "objects" ? "object" : "symptom";
  const roomId = wizard.roomId ?? null;
  const objectId = wizard.objectId ?? null;

  const rooms = Array.from(new Map(rows.map((r) => [r.room_id, r])).values());
  const objects = rows.filter((r) => r.room_id === roomId);
  const currentObj = rows.find((r) => r.object_id === objectId);

  if (openId) return <TenantTicket l={l} t={t} id={openId} reload={reload} onBack={() => { setOpenId(null); reload(); }} />;

  if (screen === "scan") {
    // Two equal paths. Scanning is best for a precise fixture or anything
    // outside the flat; picking a room is faster for someone already standing
    // in their own kitchen. Private rooms first — your own is the likely one.
    const ordered = [...rooms].sort((a, b) =>
      (a.room_kind === b.room_kind ? 0 : a.room_kind === "private" ? -1 : 1));

    return (
      <div className="rz">
        <div className="col rz-body">
          <button className="rz-btn rz-btn-back" onClick={() => onWizard()}>
            <ChevronLeft size={16} /> {t("back")}
          </button>

          <div>
            <h2 className="rz-display">{t("reportProblem")}</h2>
            {home && (
              <p className="rz-small" style={{ marginTop: 6 }}>
                {home.building_code}-{home.unit_code} · {t("yourFlat")}
              </p>
            )}
          </div>

          <div className="rz-linkwell">
            <div className="rz-spread">
              <div>
                <p className="rz-cardtitle">{t("scanQrTitle")}</p>
                <p className="rz-small">{t("scanKnowsItem")}</p>
              </div>
              <QrCode size={24} strokeWidth={1.5} aria-hidden />
            </div>
            <button className="rz-btn rz-btn-ghost" onClick={onScan}>
              <Camera size={16} aria-hidden /> {t("openCamera")}
            </button>
          </div>

          <div className="rz-grouphead">
            <p className="rz-overline">{t("orChooseRoom")}</p>
            <span className="rz-rule" />
          </div>

          <div className="col" style={{ gap: 8 }}>
            {ordered.map((r) => (
              <button key={r.room_id} className="rz-row"
                onClick={() => { setSymptom(null); onWizard(r.room_id); }}>
                <span className="rz-rowcode">{r.room_code}</span>
                <span className="rz-rowname">{roomLabel(r.room_type, l)}</span>
                <span className="rz-small">
                  {r.room_kind === "private" ? t("yourRoom") : t("sharedTag")}
                </span>
              </button>
            ))}
          </div>

          <p className="rz-small">{t("outsideFlat")}</p>
        </div>
      </div>
    );
  }

  if (screen === "object" && roomId) {
    const room = rooms.find((r) => r.room_id === roomId);
    return (
      <div className="rz">
        <div className="col rz-body">
          <button className="rz-btn rz-btn-back" onClick={() => onWizard()}>
            <ChevronLeft size={16} /> {t("back")}
          </button>
          <div>
            <span className="rz-plate">
              {home?.building_code}-{home?.unit_code} · {roomLabel(room?.room_type ?? "", l)}
            </span>
            <h2 className="rz-display" style={{ marginTop: 10 }}>{t("whatBroken")}</h2>
          </div>

          {/* Tiles rather than rows: bigger targets, which matters when
              somebody is holding a phone one-handed in a bathroom. */}
          <div className="rz-tiles">
            {objects.map((o) => {
              const Icon = objIcon(o.object_type) ?? Package;
              return (
                <button key={o.object_id} className="rz-tile"
                  onClick={() => onWizard(roomId ?? undefined, o.object_id)}>
                  <Icon size={28} strokeWidth={1.6} aria-hidden />
                  <span className="rz-tilelabel">{objLabel(o.object_type, l)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "symptom" && currentObj) {
    const syms = SYMPTOMS_FOR[currentObj.object_type] ?? ["BROKEN"];
    return (
      <div className="rz">
        <div className="col rz-body">
          <button className="rz-btn rz-btn-back" onClick={() => onWizard(roomId ?? undefined)}>
            <ChevronLeft size={16} /> {t("back")}
          </button>
          <div>
            <span className="rz-plate">
              {roomLabel(currentObj.room_type, l)} · {objLabel(currentObj.object_type, l)}
            </span>
            <h2 className="rz-display" style={{ marginTop: 10 }}>{t("whatWrong")}</h2>
          </div>

          <Err msg={err} onClose={() => setErr("")} />

          {/* Full width with a visible selected state, because the choice has
              to survive somebody glancing away and back. */}
          <div className="col" style={{ gap: 8 }}>
            {syms.map((sy) => (
              <button key={sy} className="rz-option" aria-pressed={symptom === sy}
                onClick={() => setSymptom(sy)}>
                {symptomLabel(sy, l)}
                <Check className="rz-tick" size={19} strokeWidth={2.4} aria-hidden />
              </button>
            ))}
          </div>

          <textarea className="rz-note" rows={3}
            placeholder={symptom === "OTHER" ? t("noteWanted") : t("noteOptional")}
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="rz-actionbar">
          <button className="rz-actionmain"
            disabled={!symptom || (symptom === "OTHER" && !note.trim())}
            style={!symptom || (symptom === "OTHER" && !note.trim())
              ? { background: "var(--rz-surface-3)", color: "var(--fg-3)", boxShadow: "none" }
              : undefined}
            onClick={async () => {
              try {
                const r = await api.report(objectId!, symptom!, note);
                setNote(""); setSymptom(null); onWizard();
                setFlash(r.merged ? t("merged") : "");
                await reload();
                setOpenId(r.id);
              } catch (e: any) { setErr(e.message); }
            }}>
            {t("send")} <ArrowRight size={17} />
          </button>
        </div>
      </div>
    );
  }

  /* Older, closed reports. Same card in the new language, so "show older"
     doesn't drop you into the previous design. */
  const Card = ({ x }: any) => (
    <button key={x.ticket_id} className="rz-card" onClick={() => setOpenId(x.ticket_id)}>
      <span className="rz-spread">
        <span className="rz-mono">{plate(x, l)}</span>
        <span className={"rz-pill " + (TONE[x.state] ?? "")}>
          {t(("st_" + x.state) as StrKey)}
        </span>
      </span>
      <span className="rz-cardtitle">{title(x, x.symptom, l)}</span>
      {x.closed_at && (
        <span className="rz-small">{t("fixed")} {fmtDay(x.closed_at, l)}</span>
      )}
    </button>
  );

  // Grouped by what the resident needs to know, not by database state:
  // something to do first, then things in motion, then what's finished.
  const recentCut = Date.now() - (recentDays * 864e5);
  const groups = [
    { key: "grpAction",  rows: tickets.filter((x: any) => x.state === "slots_offered") },
    { key: "grpBooked",  rows: tickets.filter((x: any) => x.state === "scheduled") },
    { key: "grpParts",   rows: tickets.filter((x: any) => x.state === "waiting_for_parts") },
    { key: "grpOpen",    rows: tickets.filter((x: any) => x.state === "reported" || x.state === "accepted") },
    { key: "grpDone",    rows: tickets.filter((x: any) => x.state === "done" && (x.closed_at ?? 0) >= recentCut) },
  ];
  const older = tickets.filter((x: any) => x.state === "done" && (x.closed_at ?? 0) < recentCut);

  /*
   * Grouped by what the resident has to do, not by date.
   *
   * "Pick a time" first, then waiting, then done. The chronological list buried
   * the one report that needed them, which is the whole reason they opened the
   * app.
   */
  const TONE: Record<string, string> = {
    slots_offered: "rz-pill-info", scheduled: "rz-pill-info",
    waiting_for_parts: "rz-pill-warn", done: "rz-pill-ok",
  };

  return (
    <div className="rz">
      <div className="col rz-body">
        <div>
          <span className="rz-plate">{home?.building_code}-{home?.unit_code}</span>
          <h2 className="rz-display" style={{ marginTop: 10 }}>{t("myReports")}</h2>
        </div>

        {flash && <div className="flash" onClick={() => setFlash("")}>{flash}</div>}

        {tickets.length === 0 && (
          <div className="empty"><p>{t("noReports")}</p><p className="rz-small">{t("noReportsCta")}</p></div>
        )}

        {groups.filter((g) => g.rows.length > 0).map((g) => (
          <div className="col" key={g.key} style={{ gap: 10 }}>
            <div className="rz-grouphead">
              <p className="rz-overline">{t(g.key as StrKey)}</p>
              <span className="rz-rule" />
              <span className="rz-overline">{g.rows.length}</span>
            </div>
            {g.rows.map((x: any) => (
              <button className="rz-card" key={x.ticket_id} onClick={() => setOpenId(x.ticket_id)}>
                <span className="rz-spread">
                  <span className="rz-mono">
                    {x.building_code}-{x.unit_code} · {x.room_label || roomLabel(x.room_type, l)}
                  </span>
                  <span className={"rz-pill " + (TONE[x.state] ?? "")}>
                    {t(("st_" + x.state) as StrKey)}
                  </span>
                </span>

                <span className="rz-cardtitle">
                  {objLabel(x.object_type, l)} · {symptomLabel(x.symptom, l)}
                </span>

                <span className="rz-small">
                  {x.state === "done" && x.closed_at
                    ? `${t("fixed")} ${fmtDay(x.closed_at, l)}`
                    : x.state === "waiting_for_parts" && x.part_what
                      ? `${x.part_what}${x.part_eta ? ` · ${t("supplierEta")}: ${x.part_eta}` : ""}`
                      : `${t("reportedOn")} ${fmtDay(x.reported_at, l)}`}
                </span>

                {/* Only where the resident has to act. */}
                {x.state === "slots_offered" && (
                  <span className="rz-cardcta">{t("pickSlot")} →</span>
                )}
              </button>
            ))}
          </div>
        ))}

        {older.length > 0 && (
          <>
            <button className="rz-sheetcancel" onClick={() => setShowOlder((v) => !v)}>
              {showOlder ? t("hideOlder") : `${t("showOlder")} (${older.length})`}
            </button>
            {showOlder && older.map((x: any) => <Card key={x.ticket_id} x={x} />)}
          </>
        )}
      </div>

      <div className="rz-actionbar">
        <button className="rz-actionmain" onClick={() => onWizard("")}>
          <Plus size={18} aria-hidden /> {t("newReport")}
        </button>
        <button className="rz-actionscan" onClick={onScan} aria-label={t("scanQrTitle")}>
          <QrCode size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function TenantTicket({ l, t, id, onBack }: any) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  /* Choosing a time is a commitment: somebody has to be home. A stray tap
     shouldn't book it, so the slot is selected first and confirmed second —
     the same two-step the symptom screen uses, so it's one habit not two. */
  const [picked, setPicked] = useState<string | null>(null);
  const load = useCallback(() => api.ticket(id).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="col"><p className="rz-small">…</p></div>;

  const appt = d.appointments.find((a: any) => a.status === "booked");
  const act = async (fn: () => Promise<any>) => {
    setErr("");
    try { await fn(); await load(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="rz">
      <div className="col rz-body">
        <button className="rz-btn rz-btn-back" onClick={onBack}>
          <ChevronLeft size={16} /> {t("back")}
        </button>

        {/* The room and the fault, stated once and large, so the rest of the
            screen is free to be about what happens next. */}
        <div className="rz-hero">
          <div className="rz-spread">
            <span className="rz-herobadge">{t(("st_" + d.ticket.state) as StrKey)}</span>
            {d.reporterCount > 1 && (
              <span className="rz-small" style={{ color: "rgba(255,255,255,.72)" }}>
                {d.reporterCount} {t("reports")}
              </span>
            )}
          </div>
          <h2 className="rz-display">{title(d.loc, d.ticket.symptom, l)}</h2>
          <div className="rz-herometa">
            <span className="rz-mono">{plate(d.loc, l)}</span>
            <span>· {t("reportedOn")} {fmtDay(d.ticket.reported_at, l)}</span>
          </div>
        </div>
      {d.ticket.note && <p className="rz-quote">{d.ticket.note}</p>}
      <Err msg={err} onClose={() => setErr("")} />

      {/* A numbered ladder rather than a list of timestamps: the newest step is
          the coloured one, so "where has this got to" is a glance. */}
      <div className="rz-ladder">
        {[
          ...(d.ticket.state === "waiting_for_parts" && d.parts[0] ? [{
            id: "part",
            label: t("st_waiting_for_parts"),
            sub: `${d.parts[0].description} · ${t("supplierEta")}: ${d.parts[0].supplier_eta || "—"}`,
          }] : []),
          ...[...d.events].reverse().map((e: any) => ({
            id: e.id,
            label: reasonLabel(e.reason, l),
            sub: fmtDT(e.created_at, l),
          })),
        ].map((step, i, all) => (
          <div className="rz-step" key={step.id}>
            <div className="rz-rail">
              <span className="rz-num">{all.length - i}</span>
              <span className="rz-line" />
            </div>
            <div className="rz-stepbody">
              <p className="rz-steptitle">{step.label}</p>
              <p className="rz-small rz-mono">{step.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {!d.escalation && d.ticket.state === "accepted" && d.events.length > 2 && (
        <div className="rz-card" style={{ cursor: "default" }}>
          <span className="rz-cardtitle">{t("awaitingTimes")}</span>
        </div>
      )}

      {/* Escalating cancels the caretaker's appointment and withdraws its slot,
          so the picker rendered with nothing in it — which reads as broken. The
          two states are worth distinguishing: waiting on the operator to
          commission a firm is different news from waiting on the firm. */}
      {d.escalation && (
        <div className="rz-card" style={{ cursor: "default" }}>
          <span className="rz-spread">
            <span className="rz-cardtitle">{t("externalNote")}</span>
            <span className="rz-pill rz-pill-info">{tradeLabel(d.escalation.trade, l)}</span>
          </span>
          <span className="rz-small">
            {d.escalation.commissioned_at ? t("firmWillConfirm") : t("awaitingCommission")}
          </span>
        </div>
      )}

      {!d.escalation && d.ticket.state === "slots_offered" && (
        <div className="col" style={{ gap: 10 }}>
          <div className="rz-grouphead">
            <p className="rz-overline">{t("pickSlot")}</p>
            <span className="rz-rule" />
          </div>
          <p className="rz-small">{d.canBook ? t("pickSlotHint") : t("onlyPrimary")}</p>
          {d.canBook && d.slots.map((sl: any) => (
            <button key={sl.id} className="rz-option" aria-pressed={picked === sl.id}
              onClick={() => setPicked(picked === sl.id ? null : sl.id)}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Clock size={18} strokeWidth={1.6} aria-hidden />
                {fmtDay(sl.starts_at, l)}
              </span>
              <span className="rz-mono">{fmtTime(sl.starts_at, l)}</span>
              <Check className="rz-tick" size={19} strokeWidth={2.4} aria-hidden />
            </button>
          ))}
        </div>
      )}

      {appt && !d.escalation && (
        <div className="rz-appt">
          <div className="rz-apptrow">
            <Calendar size={22} strokeWidth={1.6} aria-hidden />
            <div>
              <p className="rz-small" style={{ color: "rgba(255,255,255,.72)" }}>{t("appointment")}</p>
              <p className="rz-apptwhen">{fmtDT(appt.starts_at, l)}</p>
            </div>
          </div>
        </div>
      )}

      {/*
        The way out of a time that no longer suits.
        
        The caretaker offered three times and the resident took one, so the
        others are usually still free — offering those first is instant and
        costs the caretaker nothing. Only when none of them fit does it fall
        back to asking for new ones.
        
        Note the wording: "change the appointment" implied the resident picks a
        new time, and they can't. The caretaker offers, the resident chooses.
      */}
      {appt && !d.escalation && d.canBook && (
        <div className="col" style={{ gap: 8 }}>
          {d.slots.length > 0 && (
            <>
              <div className="rz-grouphead">
                <p className="rz-overline">{t("otherTimes")}</p>
                <span className="rz-rule" />
              </div>
              {d.slots.map((sl: any) => (
                <button key={sl.id} className="rz-option"
                  onClick={() => act(() => api.book(id, sl.id))}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Clock size={18} strokeWidth={1.6} aria-hidden />
                    {fmtDay(sl.starts_at, l)}
                  </span>
                  <span className="rz-mono">{fmtTime(sl.starts_at, l)}</span>
                </button>
              ))}
            </>
          )}
          <button className="rz-btn rz-btn-ghost" style={{ alignSelf: "flex-start" }}
            onClick={() => act(() => api.reschedule(id))}>
            {t("askNewTimes")}
          </button>
        </div>
      )}

      {d.ticket.note && (
        <p className="rz-small" style={{ fontStyle: "italic" }}>{d.ticket.note}</p>
      )}

      {/*
        A permission, not a disabled row.
        
        The old version was a grey bordered button with a pill, which read as
        something that wasn't working. It's actually the one decision a resident
        makes about their own front door, so it gets a switch and a key that
        turns when they grant it.
      */}
      {d.ticket.needs_access ? (
        <button className={"rz-consent" + (d.ticket.access_consent ? " rz-consent-on" : "")}
          role="switch" aria-checked={d.ticket.access_consent} disabled={!d.canBook}
          onClick={() => act(() => api.consent(id, !d.ticket.access_consent))}>
          <span className="rz-keywell">
            <Key size={19} strokeWidth={1.8} aria-hidden />
          </span>
          <span className="rz-consenttext">
            <span className="rz-consentlabel">{t("enterWithoutMe")}</span>
            <span className="rz-small">
              {d.ticket.access_consent ? t("allowed") : t("notAllowed")}
            </span>
          </span>
          <span className="rz-switch" aria-hidden><span className="rz-knob" /></span>
        </button>
      ) : (
        <p className="rz-small"><Users size={13} /> {t("sharedRoom")}</p>
      )}

      <Err msg={err} onClose={() => setErr("")} />
      </div>

      {/* Only once a time is chosen. It names the time it's about to book, so
          confirming is a second look rather than a second tap. */}
      {picked && (
        <div className="rz-actionbar">
          <button className="rz-actionmain"
            onClick={() => { const id2 = picked; setPicked(null); act(() => api.book(id, id2)); }}>
            <Check size={18} aria-hidden /> {t("confirmTime")}
            {(() => {
              const sl = d.slots.find((x: any) => x.id === picked);
              return sl ? ` · ${fmtDT(sl.starts_at, l)}` : "";
            })()}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* caretaker                                                        */
/* ---------------------------------------------------------------- */

function StaffView({ l, t, tickets, reload, rules, openTicket, onOpenTicket }: {
  l: Locale; t: (k: StrKey) => string; tickets: any[]; reload: () => Promise<void>;
  rules: SlotRules;
  /* The open job comes from the URL, so back closes it and a link opens it. */
  openTicket: string | null; onOpenTicket: (id: string | null) => void;
}) {
  const openId = openTicket;
  const setOpenId = onOpenTicket;
  const [q, setQ] = useState("");
  const [buildingF, setBuildingF] = useState("");
  const [stateF, setStateF] = useState("");
  const [oldestFirst, setOldestFirst] = useState(false);

  if (openId) return <StaffTicket l={l} t={t} id={openId} rules={rules} onBack={() => { setOpenId(null); reload(); }} />;

  const all = tickets.filter((x: any) => x.state !== "done" && x.state !== "cancelled");

  // Only worth offering a building filter to someone who covers more than one.
  const buildingCodes = [...new Set(all.map((x: any) => x.building_code))].sort();

  /** Search the words a caretaker would actually type, in the language he reads. */
  const matches = (x: any) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [
      x.building_code, x.unit_code, x.room_code,
      x.room_label, roomLabel(x.room_type, l),
      objLabel(x.object_type, l), symptomLabel(x.symptom, l),
      x.note, x.trade ? tradeLabel(x.trade, l) : "",
    ].some((f) => String(f ?? "").toLowerCase().includes(needle));
  };

  const inState = (x: any) => {
    if (!stateF) return true;
    if (stateF === "external") return x.handling === "external";
    if (stateF === "needs_time") return x.handling !== "external" && !x.appt_at
      && x.state !== "waiting_for_parts";
    if (stateF === "booked") return !!x.appt_at;
    if (stateF === "parts") return x.state === "waiting_for_parts";
    return true;
  };

  const shown = all.filter((x: any) =>
    matches(x) && inState(x) && (!buildingF || x.building_code === buildingF));

  const filtering = !!q.trim() || !!buildingF || !!stateF;
  const days = (x: any) => Math.max(0, Math.round((Date.now() - x.reported_at) / 864e5));

  const Row = ({ x }: any) => (
    <button className="rz-card" onClick={() => setOpenId(x.ticket_id)}>
      <span className="rz-spread">
        <span className="rz-mono">
          {x.appt_at ? fmtTime(x.appt_at, l) + " · " : ""}{plate(x, l)}
        </span>
        {/* Unaccepted work reads red: it's the only thing nobody has looked at. */}
        <span className={"rz-pill " + (x.state === "reported" ? "rz-pill-new"
          : x.state === "waiting_for_parts" ? "rz-pill-warn"
          : x.state === "done" ? "rz-pill-ok" : "rz-pill-info")}>
          {t(("st_" + x.state) as StrKey)}
        </span>
      </span>

      {/* An icon in a tinted square, so a caretaker scanning thirty rows sees
          light, light, drain by shape before reading a word. */}
      <span className="rz-jobline">
        <span className="rz-jobicon">
          {(() => { const I = objIcon(x.object_type) ?? Package; return <I size={20} strokeWidth={1.7} aria-hidden />; })()}
        </span>
        <span className="rz-jobtext">
          <span className="rz-jobtitle">{title(x, x.symptom, l)}</span>
          <span className="rz-small">
            {x.reporter_count > 1 ? `${x.reporter_count} ${t("reports")} · ` : ""}
            {days(x)} {t("daysOpen")}
          </span>
        </span>
      </span>

      {x.note && <span className="rz-quote">{x.note}</span>}
      {x.trade && <span className="rz-small">{tradeLabel(x.trade, l)}</span>}
    </button>
  );

  // Grouping is the default because it maps to how the day is organised. Sorting
  // by age deliberately breaks the groups: the point is to surface the job from
  // March that everyone stopped seeing.
  const external = shown.filter((x: any) => x.handling === "external");
  const live = shown.filter((x: any) => x.handling !== "external");
  const booked = live.filter((x: any) => x.appt_at).sort((a: any, b: any) => a.appt_at - b.appt_at);
  const noSlot = live.filter((x: any) => !x.appt_at && x.state !== "waiting_for_parts");
  const waiting = live.filter((x: any) => !x.appt_at && x.state === "waiting_for_parts");
  const byAge = [...shown].sort((a: any, b: any) => a.reported_at - b.reported_at);

  return (
    <div className="rz">
      <div className="col rz-body">
      <div className="rz-spread">
        <h2>{t("queueToday")}</h2>
        <span className="rz-small">
          {filtering ? `${shown.length} / ${all.length}` : all.length} {t("jobs")}
        </span>
      </div>

      {/* A pill-shaped search with the icon inside, rather than a bordered
          input: it's the first thing a caretaker reaches for. */}
      <div className="rz-search">
        <Search size={18} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchQueue")} aria-label={t("searchQueue")} />
      </div>

      {/* Selects rather than a row of chips: three controls that name
          themselves take less room than eight toggles, and they don't push the
          first actual job below the fold on a phone. */}
      <div className="rz-queuefilters">
        {buildingCodes.length > 1 && (
          <select className={"rz-queuesel" + (buildingF ? " on" : "")} value={buildingF} aria-label={t("buildingLabel")}
            onChange={(e) => setBuildingF(e.target.value)}>
            <option value="">{t("allBuildings")}</option>
            {buildingCodes.map((c: any) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <select className={"rz-queuesel" + (stateF ? " on" : "")} value={stateF} aria-label={t("statusLabel")}
          onChange={(e) => setStateF(e.target.value)}>
          <option value="">{t("allJobs")}</option>
          <option value="needs_time">{t("queueNew")}</option>
          <option value="booked">{t("grpBooked")}</option>
          <option value="parts">{t("queueWaiting")}</option>
          <option value="external">{t("withExternal")}</option>
        </select>

        <select className={"rz-queuesel" + (oldestFirst ? " on" : "")} value={oldestFirst ? "age" : "day"} aria-label={t("sortLabel")}
          onChange={(e) => setOldestFirst(e.target.value === "age")}>
          <option value="day">{t("sortByDay")}</option>
          <option value="age">{t("oldestFirst")}</option>
        </select>
      </div>

      {(filtering || oldestFirst) && (
        <button className="rz-sheetcancel" onClick={() => {
          setQ(""); setBuildingF(""); setStateF(""); setOldestFirst(false);
        }}>{t("clearFilter")}</button>
      )}

      {shown.length === 0 && (
        <div className="empty"><p className="rz-small">{t("nothingHere")}</p></div>
      )}

      {oldestFirst ? (
        byAge.map((x: any) => <Row key={x.ticket_id} x={x} />)
      ) : (
        <>
          {booked.map((x: any) => <Row key={x.ticket_id} x={x} />)}
          {noSlot.length > 0 && <div className="rz-grouphead">
            <p className="rz-overline">{t("queueNew")}</p><span className="rz-rule" />
          </div>}
          {noSlot.map((x: any) => <Row key={x.ticket_id} x={x} />)}
          {waiting.length > 0 && <div className="rz-grouphead">
            <p className="rz-overline">{t("queueWaiting")}</p><span className="rz-rule" />
          </div>}
          {waiting.map((x: any) => <Row key={x.ticket_id} x={x} />)}
          {external.length > 0 && <div className="rz-grouphead">
            <p className="rz-overline">{t("withExternal")}</p><span className="rz-rule" />
          </div>}
          {external.map((x: any) => <Row key={x.ticket_id} x={x} />)}
        </>
      )}
      </div>
    </div>
  );
}


function StaffTicket({ l, t, id, onBack, rules }: any) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"main" | "close" | "times" | "escalate" | "part">("main");
  const [trade, setTrade] = useState<string | null>(null);
  const [escWhy, setEscWhy] = useState<string | null>(null);
  const [escNote, setEscNote] = useState("");
  const [notice, setNotice] = useState("");
  const [cause, setCause] = useState<string | null>(null);
  const [what, setWhat] = useState("");
  const [eta, setEta] = useState("");

  const load = useCallback(() => api.ticket(id).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="col"><p className="rz-small">…</p></div>;

  const appt = d.appointments.find((a: any) => a.status === "booked");
  const causes = CAUSES_FOR[d.loc.object_type] ?? (Object.keys(CAUSE) as any);
  const act = async (fn: () => Promise<any>, close = false) => {
    setErr("");
    try { await fn(); if (close) onBack(); else await load(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="rz">
      <div className="col rz-body">
      <button className="rz-btn rz-btn-back" onClick={onBack}>
        <ChevronLeft size={16} /> {t("back")}
      </button>

      <div>
        <span className="rz-plate">{plate(d.loc, l)} · {objLabel(d.loc.object_type, l)}</span>
        <h2 className="rz-display" style={{ marginTop: 10 }}>
          {title(d.loc, d.ticket.symptom, l)}
        </h2>
      </div>

      {/* The resident's own words, quoted rather than run into the page. */}
      {d.ticket.note && (
        <div className="rz-notewell">
          <p className="rz-overline">{t("noteFromResident")}</p>
          <p className="rz-notebody">{d.ticket.note}</p>
        </div>
      )}
      <p className="rz-small rz-mono">
        {fmtDT(d.ticket.reported_at, l)}
        {d.reporterCount > 1 && ` · ${d.reporterCount} ${t("reports")}`}
      </p>
      {!!d.ticket.access_consent && <p className="rz-small"><Key size={13} /> {t("enterWithoutMe")}: {t("allowed")}</p>}
      {d.parts[0] && !d.parts[0].arrived_at && (
        <div className="rz-partwell">
          <p className="rz-overline">{t("st_waiting_for_parts")}</p>
          <p className="rz-partwhat">{d.parts[0].description}</p>
          <p className="rz-small">{t("supplierEta")}: {d.parts[0].supplier_eta || "—"}</p>
        </div>
      )}
      <Err msg={err} onClose={() => setErr("")} />

      {d.ticket.state === "reported" && !d.escalation && (
        <button className="rz-btn rz-btn-primary" onClick={() => act(() => api.accept(id))}>
          <Check size={16} /> {t("accept")}
        </button>
      )}

      {d.escalation && (
        <div className="rz-card" style={{ cursor: "default" }}>
          <span className="rz-spread">
            <span className="rz-cardtitle">
              <Building size={17} aria-hidden /> {tradeLabel(d.escalation.trade, l)}
            </span>
          </span>
          <span className="rz-small">{escReason(d.escalation.reason, l)}</span>
          {d.escalation.note && <p className="rz-quote">{d.escalation.note}</p>}
          <p className="rz-small rz-mono">
            {t("raisedOn")} {fmtDT(d.escalation.raised_at, l)}
            {" · "}
            {d.escalation.commissioned_at
              ? `${t("commissionedTo")} ${d.escalation.contractor}`
              : t("notCommissioned")}
          </p>
          <button className="rz-btn rz-btn-ghost" onClick={() => act(() => api.deescalate(id))}>
            {t("giveBack")}
          </button>
        </div>
      )}

      {d.ticket.state === "accepted" && mode === "main" && !d.escalation && d.events.length > 2 && (
        <div className="err">{t("noTimesLeft")}</div>
      )}

      {d.ticket.state === "accepted" && mode === "main" && !d.escalation && (
        <>
          <button className="rz-btn rz-btn-primary" onClick={() => setMode("times")}>
            <Calendar size={16} /> {t("chooseTimes")}
          </button>
          {/* No appointment needed in a stairwell or laundry — but offering
              times stays available, because the caretaker may still want the
              residents to know when he's coming. */}
          {!d.ticket.needs_access && (
            <button className="rz-actionitem" onClick={() => setMode("close")}>
              <Wrench size={16} /> {t("goFix")}
            </button>
          )}
          <button className="rz-actionitem" onClick={() => setMode("part")}>
            <Package size={16} aria-hidden /> {t("partNeeded")}
          </button>
        </>
      )}

      {mode === "times" && (
        <SlotPicker l={l} t={t} rules={rules}
          onCancel={() => setMode("main")}
          onOffer={async (slots) => {
            setErr(""); setNotice("");
            try {
              const r = await api.offer(id, slots);
              if (r.skipped > 0) setNotice(t("skippedBusy"));
              setMode("main");
              await load();
            } catch (e: any) { setErr(e.message); }
          }} />
      )}

      {notice && <div className="flash" onClick={() => setNotice("")}>{notice}</div>}

      {d.ticket.state === "slots_offered" && mode !== "times" && (
        <div className="rz-offered">
          <p className="rz-overline">{t("slotsOffered")}</p>
          {d.slots.map((sl: any) => (
            <p key={sl.id} className="rz-offeredtime">{fmtDT(sl.starts_at, l)}</p>
          ))}
          <p className="rz-small">{t("awaitingPick")}</p>
          <button className="rz-btn rz-btn-ghost" style={{ alignSelf: "flex-start" }}
            onClick={() => setMode("times")}>{t("reoffer")}</button>
        </div>
      )}

      {d.ticket.state === "waiting_for_parts" && !appt && (
        <button className="rz-btn rz-btn-primary" onClick={() => act(() => api.partArrived(id))}>
          <Package size={16} /> {t("partArrived")}
        </button>
      )}

      {appt && mode === "main" && (
        <>
          <div className="rz-appt">
            <Calendar size={22} strokeWidth={1.6} aria-hidden />
            <div>
              <p className="rz-small" style={{ color: "rgba(255,255,255,.72)" }}>{t("appointment")}</p>
              <p className="rz-apptwhen">{fmtDT(appt.starts_at, l)}</p>
            </div>
          </div>
          <button className="rz-btn rz-btn-primary" onClick={() => setMode("close")}>
            <Wrench size={17} /> {t("markDone")}
          </button>
          <button className="rz-actionitem rz-actionitem-danger" onClick={() => act(() => api.noAccess(id))}>
            <AlertTriangle size={16} /> {t("noAccess")}
          </button>
          <button className="rz-actionitem" onClick={() => setMode("part")}>
            <Package size={16} aria-hidden /> {t("partNeeded")}
          </button>
          {/* The resident is expecting him, so cancelling has to be possible
              and has to tell them. */}
          <button className="rz-actionitem" onClick={() => act(() => api.reschedule(id))}>
            <CalendarX size={16} aria-hidden /> {t("cancelAppointment")}
          </button>
        </>
      )}

      {mode === "main" && !d.escalation && d.ticket.state !== "done" && (
        <button className="rz-btn rz-btn-ghost" onClick={() => setMode("escalate")}>
          <Building size={16} aria-hidden /> {t("cantFixMyself")}
        </button>
      )}

      {mode === "escalate" && (
        <>
          <button className="rz-scrim" aria-label={t("cancel")} onClick={() => setMode("main")} />
          <div className="rz-sheet" role="dialog" aria-modal="true" aria-label={t("whichTrade")}>
            <div className="rz-sheethead">
              <p className="rz-cardtitle">{t("whichTrade")}</p>
              <button className="rz-sheetcancel" onClick={() => setMode("main")}>{t("cancel")}</button>
            </div>
            <div className="rz-choices">
              {Object.keys(TRADE).map((k) => (
                <button key={k} className="rz-choice" aria-pressed={trade === k}
                  onClick={() => setTrade(k)}>
                  {tradeLabel(k, l)}
                  <Check className="rz-choicetick" size={19} strokeWidth={2.4} aria-hidden />
                </button>
              ))}
            </div>

            <p className="rz-overline">{t("whyExternal")}</p>
            <div className="rz-choices">
              {Object.keys(ESC_REASON).map((k) => (
                <button key={k} className="rz-choice" aria-pressed={escWhy === k}
                  onClick={() => setEscWhy(k)}>
                  {escReason(k, l)}
                  <Check className="rz-choicetick" size={19} strokeWidth={2.4} aria-hidden />
                </button>
              ))}
            </div>

            <textarea className="rz-note" rows={2} placeholder={t("noteOptional")}
              value={escNote} onChange={(e) => setEscNote(e.target.value)} />

            <button className="rz-btn rz-btn-primary" disabled={!trade || !escWhy}
              onClick={() => act(() => api.escalate(id, trade!, escWhy!, escNote), true)}>
              <Send size={17} aria-hidden /> {t("sendToTrade")}
            </button>
          </div>
        </>
      )}

      {mode === "close" && (
        <>
          <button className="rz-scrim" aria-label={t("cancel")} onClick={() => setMode("main")} />
          <div className="rz-sheet" role="dialog" aria-modal="true" aria-label={t("causeQ")}>
            <div className="rz-sheethead">
              <p className="rz-cardtitle">{t("causeQ")}</p>
              <button className="rz-sheetcancel" onClick={() => setMode("main")}>{t("cancel")}</button>
            </div>
            <div className="rz-choices">
              {causes.map((c: string) => (
                <button key={c} className="rz-choice" aria-pressed={cause === c}
                  onClick={() => setCause(c)}>
                  {causeLabel(c, l)}
                  <Check className="rz-choicetick" size={19} strokeWidth={2.4} aria-hidden />
                </button>
              ))}
            </div>
            <button className="rz-btn rz-btn-primary" disabled={!cause}
              onClick={() => act(() => api.done(id, cause!), true)}>
              <Check size={17} /> {t("markDone")}
            </button>
          </div>
        </>
      )}

      {/* Ordering a part used to live inside the "Done" panel, which meant
          saying "not done, waiting for a part" started with tapping Done. */}
      {mode === "part" && (
        <>
          <button className="rz-scrim" aria-label={t("cancel")} onClick={() => setMode("main")} />
          <div className="rz-sheet" role="dialog" aria-modal="true" aria-label={t("partWhat")}>
            <div className="rz-sheethead">
              <p className="rz-cardtitle">{t("partWhat")}</p>
              <button className="rz-sheetcancel" onClick={() => setMode("main")}>{t("cancel")}</button>
            </div>
            <label className="rz-field">
              <span className="rz-overline">{t("partWhat")}</span>
              <input value={what} onChange={(e) => setWhat(e.target.value)}
                placeholder="Siphon-Dichtung" />
            </label>
            <label className="rz-field">
              <span className="rz-overline">{t("supplierEta")}</span>
              <input value={eta} onChange={(e) => setEta(e.target.value)} placeholder="KW 34" />
            </label>
            <p className="rz-small">{t("etaHint")}</p>
            <button className="rz-btn rz-btn-primary" disabled={!what}
              onClick={() => act(() => api.orderPart(id, what, eta), true)}>
              <Package size={17} /> {t("orderPart")}
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

/* app shell                                                        */
/* ---------------------------------------------------------------- */

/** Minimal path router: /r/:slug is a scanned sticker, /t/:token a report link. */
export default function App() {
  const [l, setL] = useState<Locale>(() => (navigator.language.startsWith("de") ? "de" : "en"));
  const [session, setSession] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [route, setRoute] = useState<Route>(() => parse());
  const [query, setQuery] = useState(readQuery);

  /**
   * The only way to change where you are.
   *
   * pushState plus a state update, with a popstate listener so the browser's
   * back and forward buttons work. Everything used to be React state, so back
   * left the app entirely and a refresh lost your place.
   */
  const navigate = useCallback((to: Route, q?: string, replace = false) => {
    const url = href(to) + (q ?? "");
    if (replace) history.replaceState({}, "", url);
    else history.pushState({}, "", url);
    setRoute(to);
    setQuery(readQuery());
  }, []);

  useEffect(() => {
    const onPop = () => { setRoute(parse()); setQuery(readQuery()); };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const [bellOpen, setBellOpen] = useState(false);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [stickerBuilding, setStickerBuilding] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; token?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [homeKey, setHomeKey] = useState(0);

  const goScan = useCallback((slug: string) => navigate({ kind: "scan", slug }), [navigate]);

  /**
   * The logo is "home". Each role view keeps its own screen state, so bumping
   * homeKey remounts it — that's what takes a resident back to My reports and
   * a caretaker back to the queue, from wherever they were.
   */
  // The sticky panel has to start below the header, and the header's height
  // changes with the viewport (it wraps on narrow screens). Measured rather
  // than hardcoded, so the panel never overlaps it or floats away from it.
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () =>
      document.documentElement.style.setProperty("--hdr", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const signedIn = !!session && session.principal.kind !== "anonymous";

  useEffect(() => {
    // An operator's home is the dashboard, so the URL should say so. Replace
    // rather than push, or back would bounce between / and /dashboard.
    if (signedIn && session?.principal?.kind === "operator" && route.kind === "home"
        && !session.orgBlocked) {
      navigate({ kind: "dashboard" }, "", true);
    }
  }, [signedIn, session, route.kind, navigate]);

  useEffect(() => {
    // Signing in on /signin or /demo should leave you at your own home rather
    // than on a page that no longer applies. Replace rather than push, so back
    // doesn't return to the sign-in form you just used.
    if (signedIn && ["signin", "demo", "signup", "forgot", "about"].includes(route.kind)) {
      navigate({ kind: "home" }, "", true);
    }
  }, [signedIn, route.kind, navigate]);
  const { items: notifItems, unread, reload: reloadNotifs } = useNotifications(signedIn);

  // Bumped by goHome and used as OperatorView's key. The operator view holds its
  // own section, drill-down and building state; resetting `screen` left all of
  // that untouched, so clicking the logo from Access codes appeared to do
  // nothing. Remounting clears everything at once, and nothing new has to be
  // remembered when another sub-screen is added later.
  const [opKey, setOpKey] = useState(0);

  const goHome = useCallback(() => {
    navigate({ kind: "home" });
    setSent(null);
    setHomeKey((n) => n + 1);
    setOpKey((n) => n + 1);
  }, [navigate]);

  const goApp = useCallback(() => navigate({ kind: "home" }), [navigate]);
  const t = (k: StrKey) => (T[k] as any)?.[l] ?? k;

  const loadSession = useCallback(async () => {
    const s = await api.session();
    setSession(s);
    if (s.principal.kind !== "anonymous" && s.principal.kind !== "operator") {
      try { setTickets((await api.tickets()).tickets); } catch { setTickets([]); }
    }
  }, []);

  const reload = useCallback(async () => {
    try { setTickets((await api.tickets()).tickets); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  if (!session) return <div className="app"><main className="narrow"><p className="muted">…</p></main></div>;

  const kind = session.principal.kind;
  const roleLabel = kind === "operator" ? t("operator") : kind === "staff" ? t("staff") : t("tenant");
  const RoleIcon = kind === "operator" ? LayoutDashboard : kind === "staff" ? Wrench : User;
  const isStaffKind = kind === "staff" || kind === "operator";
  /*
   * Which wrapper the page gets.
   *
   * `operatorOwnView` has to mean exactly "OperatorView is what's on screen",
   * because that's the only view that brings its own left panel and manages its
   * own width. The first version tested `screen === "main"`, which was wrong:
   * OperatorView renders in the final else of a long branch chain, so it shows
   * for several screen values. Two conditions that had to agree, and didn't —
   * hence a centred column with a gap beside the panel.
   */
  // Exactly the routes OperatorView renders for, which is the only view that
  // brings its own left panel and manages its own width.
  /*
   * Every operator route now renders inside OperatorView, which brings its own
   * left panel and manages its own width — so the whole role gets the wrapper
   * rather than a list of routes that has to be kept in step with the view.
   *
   * The exceptions are the screens that aren't the operator's own: the account
   * pages and About, which are shared with everyone.
   */
  const SHARED: Route["kind"][] = ["account", "password", "about"];
  const operatorOwnView = kind === "operator" && !SHARED.includes(route.kind);

  /*
   * The landing page is a full-width marketing page with its own gutters, so it
   * opts out of main's centred column the same way the dashboard does.
   *
   * It covers the overlay routes too: on /demo the page is still rendered
   * behind the modal, and without this it fell back to the 560px column and
   * laid itself out as if on a phone — a mobile page blurred behind a desktop
   * modal.
   */
  const LANDING_ROUTES: Route["kind"][] = ["home", "demo", "signup", "signin"];
  const fullBleed =
    kind === "anonymous" && LANDING_ROUTES.includes(route.kind) && !session?.needsSetup;

  const wideView = kind === "operator" || route.kind === "stickers";

  const whoLabel =
    kind === "tenant" && session.home
      ? `${session.home.building_code}-${session.home.unit_code}`
      : (session.principal as any).name ?? roleLabel;

  return (
    <div className="app">
      {/*
        A demo you can only leave by signing out is a trap, and "sign out" is
        the wrong word for somebody who never signed in. It also says whose data
        this is — without it, someone could reasonably think they were looking
        at a real building.

        Only ever the demo organisation, so a real Studierendenwerk never sees it.
      */}
      {signedIn && session.org?.status === "demo" && (
        <div className="demobar">
          <FlaskConical size={16} strokeWidth={1.8} aria-hidden />
          <span className="demobartext">
            <span className="demobarorg">{t("demoBarLabel")}</span>
            {" · "}{session.org.name}
            <span className="demobarnote"> — {t("demoBarNote")}</span>
          </span>
          <button className="demoleave" onClick={async () => {
            /*
             * Session first, then navigate.
             *
             * The other order raced: navigating to "/" while the session still
             * said operator let the redirect effect fire and push straight back
             * to /dashboard, so leaving the demo appeared to do nothing.
             */
            await api.logout();
            await loadSession();
            navigate({ kind: "home" });
          }}>
            {t("demoLeave")}
          </button>
        </div>
      )}

      {/* One header for all three roles, because it's one component and three
          versions of it would drift.
          
          Hidden entirely on the landing page and its overlays: that page has its
          own nav carrying the logo, the language and both actions, so the app
          header would be a second one stacked above it. */}
      {!fullBleed && (
      <header className="topbar topbar-rz" ref={headerRef}>
        <button className="brand brandbtn" onClick={goHome} aria-label={t("appName")}>
          <Logo size={22} /><span>{t("appName")}</span>
        </button>
        <div className="row">
          {kind !== "anonymous" && (
            <>
              {/* Residents scan from the action bar at the bottom, where the
                  thumb already is. Keeping it here too was two ways to do one
                  thing, and the header one was the harder to reach. */}
              {kind !== "tenant" && (
                <button className="lang" onClick={() => setScanning(true)} aria-label={t("scanOpen")}>
                  <Camera size={14} aria-hidden />
                </button>
              )}
              {/* Caretakers only: an operator reaches stickers from the left
                  panel, so having it here as well was one of two ways to do
                  the same thing. */}
              {kind === "staff" && (
                <button className="lang"
                  onClick={() => navigate(route.kind === "stickers" ? { kind: "home" } : { kind: "stickers" })}
                  aria-label={t("stickers")}><QrCode size={14} aria-hidden /></button>
              )}
              <BellButton t={t} unread={unread} onClick={() => setBellOpen(true)} />
              {/* Operators reach Account from the left panel, which also shows
                  the organisation and the person. Keeping it here as well meant
                  the same name twice on one screen. */}
              {kind !== "operator" && (
                <button className="who whobtn" onClick={() => navigate({ kind: "account" })}
                  aria-label={t("account")}>
                  <RoleIcon size={14} strokeWidth={1.75} aria-hidden /> {whoLabel}
                </button>
              )}
            </>
          )}
          {/* Language stays in the header while signed out: someone who can't
              read German needs it before they can read anything else. */}
          {kind === "anonymous" && (
            <button className="lang" onClick={() => setL(l === "de" ? "en" : "de")}>
              <Languages size={14} aria-hidden /> {l.toUpperCase()}
            </button>
          )}
        </div>
      </header>
      )}

      <main className={
        (operatorOwnView || fullBleed ? "opview" : wideView ? "wide" : "narrow")
        /* The landing page runs edge to edge and owns its gutters, so it opts
           out of the narrow-screen padding the operator's screens want. */
        + (fullBleed ? " lzview" : "")
      }>
        {/*
          One switch on the route, rather than a chain testing two overlapping
          pieces of state. Every screen has a URL now, so back, forward and
          refresh all behave, and a view can be linked to.
        */}
        {(() => {
          const r = route;

          /* Link paths first: they work whoever is holding them. */
          if (r.kind === "reset") {
            return <ResetPassword t={t} token={r.token}
              onDone={async () => { goApp(); await loadSession(); }} />;
          }
          if (r.kind === "invite") {
            return <AcceptInvite t={t} token={r.token}
              onDone={async () => { goApp(); await loadSession(); }} />;
          }
          if (r.kind === "scan") {
            return <ScanLanding l={l} t={t} slug={r.slug} principal={session.principal}
              onSignIn={goApp}
              onDone={(id, token) => { setSent({ id, token }); navigate({ kind: "sent" }); reload(); }} />;
          }

          /* An empty database has nobody to sign in as. */
          if (kind === "anonymous" && session.needsSetup) {
            return <FirstRunSetup t={t} onDone={loadSession} />;
          }

          if (kind === "anonymous") {
            if (r.kind === "forgot") return <ForgotPassword t={t} onBack={() => navigate({ kind: "home" })} />;
            if (r.kind === "about") return <About t={t} onBack={() => navigate({ kind: "home" })} />;

            /*
             * Sign in, the demo and signup all open over a blurred landing page.
             * They're decisions made while reading it, so keeping the page
             * behind them costs nothing and losing it would cost the reader
             * their place. Each keeps its own URL, so back closes the overlay
             * rather than leaving the site.
             */
            const landing = (
              <Landing l={l} t={t} setL={setL}
                onDemo={() => navigate({ kind: "demo" })}
                onSignUp={() => navigate({ kind: "signup" })}
                onSignIn={() => navigate({ kind: "signin" })}
                onAbout={() => navigate({ kind: "about" })} />
            );

            const overlaid = ["demo", "signup", "signin"].includes(r.kind);

            return (
              <>
                {/* `inert` keeps tab out of the blurred page; aria-hidden alone
                    hides it from a screen reader but not from the keyboard. */}
                {/* The export blurs the page element rather than using a
                    backdrop-filter on the scrim: one composite instead of one
                    per scroll frame, and the scrim's own edges stay crisp. */}
                <div className={overlaid ? "dt-page-behind" : undefined}
                  aria-hidden={overlaid || undefined}
                  {...(overlaid ? { inert: "" } : {})}>
                  {landing}
                </div>
                {r.kind === "signin" && (
                  <SignInModal t={t}
                    onClose={() => navigate({ kind: "home" })}
                    onDone={loadSession}
                    onScan={() => setScanning(true)}
                    onDemo={() => navigate({ kind: "demo" })}
                    onForgot={() => navigate({ kind: "forgot" })} />
                )}
                {r.kind === "demo" && (
                  <DemoModal t={t}
                    onClose={() => navigate({ kind: "home" })}
                    onDone={loadSession}
                    onSignIn={() => navigate({ kind: "signin" })} />
                )}
                {/* /signup stays a real path — an emailed or bookmarked link has
                    to land somewhere — but the page's own button scrolls to the
                    form rather than navigating. */}
                {r.kind === "signup" && (
                  <>
                    <button className="dt-scrim" aria-label={t("close")}
                      onClick={() => navigate({ kind: "home" })} />
                    <div className="dt-modal" role="dialog" aria-modal="true">
                      <SignUpOrg t={t} onBack={() => navigate({ kind: "home" })} />
                    </div>
                  </>
                )}
              </>
            );
          }

          /* Signed in, but the organisation isn't switched on yet. */
          if (session.orgBlocked) {
            return <OrgWaiting t={t} status={session.org?.status ?? "pending"}
              onSignOut={async () => { await api.logout(); await loadSession(); navigate({ kind: "home" }); }} />;
          }

          if (r.kind === "sent") return <ReportDone t={t} token={sent?.token} onHome={goApp} />;

          if (r.kind === "account") {
            return <Account l={l} t={t} session={session}
              onBack={goApp}
              onLanguage={() => setL(l === "de" ? "en" : "de")}
              onPassword={() => navigate({ kind: "password" })}
              onPlatform={session.principal.isPlatformAdmin ? () => navigate({ kind: "orgs" }) : undefined}
              onAbout={() => navigate({ kind: "about" })}
              onSignOut={async () => { await api.logout(); await loadSession(); navigate({ kind: "home" }); }} />;
          }
          if (r.kind === "password") return <ChangePassword t={t} onBack={() => navigate({ kind: "account" })} />;
          if (r.kind === "about") return <About t={t} onBack={() => navigate({ kind: "account" })} />;

          /*
           * A caretaker gets the sticker sheet on its own, with a back button:
           * they have no left panel to return to.
           *
           * An operator does have one, so their copy renders inside
           * OperatorView with everything else — see below.
           */
          if (r.kind === "stickers" && isStaffKind && kind !== "operator") {
            return <StickerSheet l={l} t={t} buildings={session.buildings}
              initialBuilding={r.code ?? null}
              onPick={(code) => navigate({ kind: "stickers", code: code ?? undefined })}
              onBack={() => navigate({ kind: "home" })} />;
          }

          /*
           * Every operator destination goes through OperatorView, so the left
           * panel is on all of them.
           *
           * Access codes already rendered inside it while buildings, staff,
           * stickers and organisations rendered as siblings — so the panel
           * vanished on four of six destinations and an in-app back button
           * appeared instead. The panel is permanent navigation; it shouldn't
           * come and go, and where it's present the back button is redundant.
           */
          if (kind === "operator") {
            return <OperatorView key={opKey} l={l} t={t} session={session} route={r} query={query}
              navigate={navigate} />;
          }

          if (kind === "tenant") {
            return <TenantView key={homeKey} l={l} t={t} tickets={tickets} reload={reload}
              home={session.home} onScan={() => setScanning(true)}
              recentDays={session.retention?.residentRecentDays ?? 90}
              openTicket={r.kind === "ticket" ? r.id : null}
              onOpenTicket={(id) => navigate(id ? { kind: "ticket", id } : { kind: "home" })}
              wizard={
                r.kind === "reportObject" ? { step: "symptom", roomId: r.roomId, objectId: r.objectId }
                : r.kind === "reportRoom" ? { step: "objects", roomId: r.roomId }
                : r.kind === "report" ? { step: "rooms" }
                : { step: "none" }
              }
              onWizard={(roomId, objectId) =>
                navigate(
                  objectId && roomId ? { kind: "reportObject", roomId, objectId }
                  : roomId ? { kind: "reportRoom", roomId }
                  : roomId === "" ? { kind: "report" }
                  : { kind: "home" },
                )
              } />;
          }

          return <StaffView key={homeKey} l={l} t={t} tickets={tickets} reload={reload}
            rules={session.slotRules}
            openTicket={r.kind === "ticket" ? r.id : null}
            onOpenTicket={(id) => navigate(id ? { kind: "ticket", id } : { kind: "home" })} />;
        })()}
      </main>

      {bellOpen && (
        <NotificationPanel l={l} t={t} items={notifItems}
          onClose={() => setBellOpen(false)}
          onReadAll={async () => { await api.markAllRead(); await reloadNotifs(); }}
          onOpenTicket={async (notifId) => {
            const n = notifItems.find((x: any) => x.id === notifId);
            try { await api.markRead(notifId); } catch { /* ignore */ }
            await reloadNotifs();
            setBellOpen(false);
            if (n?.ticket_id) navigate({ kind: "ticket", id: n.ticket_id });
          }} />
      )}

      {scanning && (
        <ScannerModal t={t} onClose={() => setScanning(false)}
          onFound={(slug) => { setScanning(false); goScan(slug); }} />
      )}
    </div>
  );
}
