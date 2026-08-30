import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  QrCode, Calendar, Clock, Check, ChevronLeft, Package, AlertTriangle, Key,
  Wrench, LayoutDashboard, Languages, User, Users, ArrowRight, Plus,
  LogOut, Camera, Building, Send, Settings, CalendarX,
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
import { Landing, DemoPicker, SignUpOrg, OrgWaiting } from "./Landing";
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
      <div className="col">
        <button className="linkback" onClick={() => onWizard()}><ChevronLeft size={16} /> {t("back")}</button>

        <div>
          <h2>{t("reportProblem")}</h2>
          {home && <p className="muted">{home.building_code}-{home.unit_code} · {t("yourFlat")}</p>}
        </div>

        <div className="scancard">
          <div className="scanhead">
            <QrCode size={22} strokeWidth={1.5} aria-hidden />
            <div>
              <p className="scanheadtitle">{t("scanQrTitle")}</p>
              <p className="scanheadsub">{t("scanKnowsItem")}</p>
            </div>
          </div>
          <button className="btn btn-scan" onClick={onScan}>
            <Camera size={16} aria-hidden /> {t("openCamera")}
          </button>
        </div>

        <div className="divider"><span>{t("orChooseRoom")}</span></div>

        <div className="col" style={{ gap: 6 }}>
          {ordered.map((r) => {
            const Icon = roomIcon(r.room_type);
            return (
              <button key={r.room_id} className="roomrow"
                onClick={() => { setSymptom(null); onWizard(r.room_id); }}>
                <span className="roomname">
                  <Icon size={18} strokeWidth={1.5} aria-hidden />
                  {roomLabel(r.room_type, l)}
                </span>
                <Pill tone={r.room_kind === "private" ? "info" : "neutral"}>
                  {r.room_kind === "private" ? t("yourRoom") : t("sharedTag")}
                </Pill>
              </button>
            );
          })}
        </div>

        <p className="muted">{t("outsideFlat")}</p>
      </div>
    );
  }

  if (screen === "object" && roomId) {
    const room = rooms.find((r) => r.room_id === roomId);
    return (
      <div className="col">
        <button className="linkback" onClick={() => onWizard()}><ChevronLeft size={16} /> {t("back")}</button>
        <Plate>{roomLabel(room?.room_type ?? "", l)}</Plate>
        <h2>{t("whatBroken")}</h2>
        <div className="grid2">
          {objects.map((o) => (
            <Tile key={o.object_id} icon={objIcon(o.object_type)}
              label={objLabel(o.object_type, l)}
              onClick={() => onWizard(roomId ?? undefined, o.object_id)} />
          ))}
        </div>
      </div>
    );
  }

  if (screen === "symptom" && currentObj) {
    const syms = SYMPTOMS_FOR[currentObj.object_type] ?? ["BROKEN"];
    return (
      <div className="col">
        <button className="linkback" onClick={() => onWizard(roomId ?? undefined)}><ChevronLeft size={16} /> {t("back")}</button>
        <Plate>{roomLabel(currentObj.room_type, l)} · {objLabel(currentObj.object_type, l)}</Plate>
        <h2>{t("whatWrong")}</h2>
        <Err msg={err} onClose={() => setErr("")} />
        <div className="grid2">
          {syms.map((s) => (
            <Tile key={s} label={symptomLabel(s, l)} active={symptom === s} onClick={() => setSymptom(s)} />
          ))}
        </div>
        <textarea className="ta" rows={2}
          placeholder={symptom === "OTHER" ? t("noteWanted") : t("noteOptional")}
          value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-primary"
          disabled={!symptom || (symptom === "OTHER" && !note.trim())}
          onClick={async () => {
            try {
              const r = await api.report(objectId!, symptom!, note);
              setNote(""); setSymptom(null); onWizard();
              setFlash(r.merged ? t("merged") : "");
              await reload();
              setOpenId(r.id);
            } catch (e: any) { setErr(e.message); }
          }}>
          {t("send")} <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const Card = ({ x }: any) => (
    <button key={x.ticket_id} className="card cardlink" onClick={() => setOpenId(x.ticket_id)}>
      <div className="rowspread">
        <Plate sm>{plate(x, l)}</Plate>
        <Pill tone={STATE_TONE[x.state]}>{t(("st_" + x.state) as StrKey)}</Pill>
      </div>
      <p className="cardtitle">{title(x, x.symptom, l)}</p>
      {x.appt_at && <p className="mono muted"><Calendar size={13} /> {fmtDT(x.appt_at, l)}</p>}
      {x.part_what && (
        <p className="mono muted">
          <Package size={13} /> {x.part_what}{x.part_eta ? ` · ${t("supplierEta")}: ${x.part_eta}` : ""}
        </p>
      )}
      {x.trade && <p className="muted">{t("externalNote")}</p>}
      {x.state === "slots_offered" && <p className="cta">{t("pickSlot")} →</p>}
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

  return (
    <div className="col tenantlist">
      <h2>{t("myReports")}</h2>
      {flash && <div className="flash" onClick={() => setFlash("")}>{flash}</div>}

      {tickets.length === 0 && (
        <div className="empty"><p>{t("noReports")}</p><p className="muted">{t("noReportsCta")}</p></div>
      )}

      {groups.filter((g) => g.rows.length > 0).map((g) => (
        <React.Fragment key={g.key}>
          <p className="eyebrow">{t(g.key as StrKey)} <span className="grpcount">{g.rows.length}</span></p>
          {g.rows.map((x: any) => <Card key={x.ticket_id} x={x} />)}
        </React.Fragment>
      ))}

      {older.length > 0 && (
        <>
          <button className="linkmore" onClick={() => setShowOlder((v) => !v)}>
            {showOlder ? t("hideOlder") : `${t("showOlder")} (${older.length})`}
          </button>
          {showOlder && older.map((x: any) => <Card key={x.ticket_id} x={x} />)}
        </>
      )}

      {/*
        Fixed, so the one thing a resident came to do is always in reach — they
        arrive to report something, not to read a list. The list scrolls behind
        it, with padding at the end so the last card isn't hidden underneath.

        Two controls, deliberately different shapes: a wide pill for reporting,
        a round button for scanning. They do different jobs and looked
        interchangeable when both were icons in the header.
      */}
      <div className="actionbar">
        <button className="btn btn-primary actionmain" onClick={() => onWizard("")}>
          <Plus size={17} aria-hidden /> {t("newReport")}
        </button>
        <button className="actionscan" onClick={onScan} aria-label={t("scanQrTitle")}>
          <QrCode size={19} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function TenantTicket({ l, t, id, onBack }: any) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.ticket(id).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="col"><p className="muted">…</p></div>;

  const appt = d.appointments.find((a: any) => a.status === "booked");
  const act = async (fn: () => Promise<any>) => {
    setErr("");
    try { await fn(); await load(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="col">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("back")}</button>
      <Plate>{plate(d.loc, l)}</Plate>
      <h2>{title(d.loc, d.ticket.symptom, l)}</h2>
      {d.reporterCount > 1 && <p className="muted"><Users size={13} /> {d.reporterCount} {t("reports")}</p>}
      {d.ticket.note && <p className="quote">{d.ticket.note}</p>}
      <Err msg={err} onClose={() => setErr("")} />

      <div className="timeline">
        {d.events.map((e: any) => (
          <div className="tl" key={e.id}>
            <div className={"tldot" + (e.reason === "no_access" ? " tldot-warn" : "")} />
            <div>
              <p>{reasonLabel(e.reason, l)}</p>
              <p className="mono muted">{fmtDT(e.created_at, l)}</p>
            </div>
          </div>
        ))}
        {d.ticket.state === "waiting_for_parts" && d.parts[0] && (
          <div className="tl">
            <div className="tldot tldot-warn" />
            <div>
              <p>{t("st_waiting_for_parts")}</p>
              <p className="mono muted">
                {d.parts[0].description} · {t("supplierEta")}: {d.parts[0].supplier_eta || "—"}
              </p>
            </div>
          </div>
        )}
      </div>

      {!d.escalation && d.ticket.state === "accepted" && d.events.length > 2 && (
        <div className="card">
          <p className="cardtitle">{t("awaitingTimes")}</p>
        </div>
      )}

      {/* Escalating cancels the caretaker's appointment and withdraws its slot,
          so the picker rendered with nothing in it — which reads as broken. The
          two states are worth distinguishing: waiting on the operator to
          commission a firm is different news from waiting on the firm. */}
      {d.escalation && (
        <div className="card extcard">
          <p className="cardtitle">{t("externalNote")}</p>
          <p className="muted">{tradeLabel(d.escalation.trade, l)}</p>
          <p className="muted">
            {d.escalation.commissioned_at ? t("firmWillConfirm") : t("awaitingCommission")}
          </p>
        </div>
      )}

      {!d.escalation && d.ticket.state === "slots_offered" && (
        <div className="card">
          <p className="cardtitle">{t("pickSlot")}</p>
          <p className="muted">{d.canBook ? t("pickSlotHint") : t("onlyPrimary")}</p>
          {d.canBook && d.slots.map((s: any) => (
            <button key={s.id} className="slot" onClick={() => act(() => api.book(id, s.id))}>
              <Clock size={16} strokeWidth={1.5} aria-hidden />
              <span>{fmtDay(s.starts_at, l)}</span>
              <span className="mono">{fmtTime(s.starts_at, l)}</span>
            </button>
          ))}
        </div>
      )}

      {appt && !d.escalation && (
        <div className="card">
          <p className="cardtitle"><Calendar size={15} aria-hidden /> {fmtDT(appt.starts_at, l)}</p>
          {d.canBook && (
            <button className="btn" onClick={() => act(() => api.reschedule(id))}>{t("changeAppt")}</button>
          )}
        </div>
      )}

      {d.ticket.needs_access ? (
        <button className="consent" disabled={!d.canBook}
          onClick={() => act(() => api.consent(id, !d.ticket.access_consent))}>
          <Key size={16} strokeWidth={1.5} aria-hidden />
          <span>{t("enterWithoutMe")}</span>
          <Pill tone={d.ticket.access_consent ? "ok" : "neutral"}>
            {d.ticket.access_consent ? t("allowed") : t("notAllowed")}
          </Pill>
        </button>
      ) : (
        <p className="muted"><Users size={13} /> {t("sharedRoom")}</p>
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
    <button className="job" onClick={() => setOpenId(x.ticket_id)}>
      <div className={"jobbar jobbar-" + STATE_TONE[x.state]} />
      <div className="jobmain">
        <div className="rowspread">
          <span className="mono">{x.appt_at ? fmtTime(x.appt_at, l) + " · " : ""}{plate(x, l)}</span>
          <Pill tone={STATE_TONE[x.state]}>{t(("st_" + x.state) as StrKey)}</Pill>
        </div>
        <p className="muted">
          {title(x, x.symptom, l)}
          {x.trade && ` · ${tradeLabel(x.trade, l)}`}
          {x.reporter_count > 1 && ` · ${x.reporter_count} ${t("reports")}`}
          {!!x.access_consent && <> · <Key size={12} aria-hidden /></>}
        </p>
        {(oldestFirst || days(x) >= 14) && (
          <p className="muted mono">{days(x)} {t("daysOpen")}</p>
        )}
      </div>
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
    <div className="col">
      <div className="rowspread">
        <h2>{t("queueToday")}</h2>
        <span className="muted">
          {filtering ? `${shown.length} / ${all.length}` : all.length} {t("jobs")}
        </span>
      </div>

      <div className="queuefilters">
        <input className="in queuesearch" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchQueue")} aria-label={t("searchQueue")} />

        {/* Selects rather than a row of chips: three controls that name
            themselves take less room than eight toggles, and they don't push the
            first actual job below the fold on a phone. */}
        {buildingCodes.length > 1 && (
          <select className="in queuesel" value={buildingF} aria-label={t("buildingLabel")}
            onChange={(e) => setBuildingF(e.target.value)}>
            <option value="">{t("allBuildings")}</option>
            {buildingCodes.map((c: any) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <select className="in queuesel" value={stateF} aria-label={t("statusLabel")}
          onChange={(e) => setStateF(e.target.value)}>
          <option value="">{t("allJobs")}</option>
          <option value="needs_time">{t("queueNew")}</option>
          <option value="booked">{t("grpBooked")}</option>
          <option value="parts">{t("queueWaiting")}</option>
          <option value="external">{t("withExternal")}</option>
        </select>

        <select className="in queuesel" value={oldestFirst ? "age" : "day"} aria-label={t("sortLabel")}
          onChange={(e) => setOldestFirst(e.target.value === "age")}>
          <option value="day">{t("sortByDay")}</option>
          <option value="age">{t("oldestFirst")}</option>
        </select>
      </div>

      {(filtering || oldestFirst) && (
        <button className="linkmore" onClick={() => {
          setQ(""); setBuildingF(""); setStateF(""); setOldestFirst(false);
        }}>{t("clearFilter")}</button>
      )}

      {shown.length === 0 && (
        <div className="empty"><p className="muted">{t("nothingHere")}</p></div>
      )}

      {oldestFirst ? (
        byAge.map((x: any) => <Row key={x.ticket_id} x={x} />)
      ) : (
        <>
          {booked.map((x: any) => <Row key={x.ticket_id} x={x} />)}
          {noSlot.length > 0 && <p className="eyebrow">{t("queueNew")}</p>}
          {noSlot.map((x: any) => <Row key={x.ticket_id} x={x} />)}
          {waiting.length > 0 && <p className="eyebrow">{t("queueWaiting")}</p>}
          {waiting.map((x: any) => <Row key={x.ticket_id} x={x} />)}
          {external.length > 0 && <p className="eyebrow">{t("withExternal")}</p>}
          {external.map((x: any) => <Row key={x.ticket_id} x={x} />)}
        </>
      )}
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
  if (!d) return <div className="col"><p className="muted">…</p></div>;

  const appt = d.appointments.find((a: any) => a.status === "booked");
  const causes = CAUSES_FOR[d.loc.object_type] ?? (Object.keys(CAUSE) as any);
  const act = async (fn: () => Promise<any>, close = false) => {
    setErr("");
    try { await fn(); if (close) onBack(); else await load(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="col">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("back")}</button>
      <Plate>{plate(d.loc, l)} · {objLabel(d.loc.object_type, l)}</Plate>
      <h2>{title(d.loc, d.ticket.symptom, l)}</h2>
      {d.ticket.note && <p className="quote">{d.ticket.note}</p>}
      <p className="mono muted">
        {fmtDT(d.ticket.reported_at, l)}
        {d.reporterCount > 1 && ` · ${d.reporterCount} ${t("reports")}`}
      </p>
      {!!d.ticket.access_consent && <p className="muted"><Key size={13} /> {t("enterWithoutMe")}: {t("allowed")}</p>}
      {d.parts[0] && !d.parts[0].arrived_at && (
        <p className="muted"><Package size={13} /> {d.parts[0].description} · {t("supplierEta")}: {d.parts[0].supplier_eta || "—"}</p>
      )}
      <Err msg={err} onClose={() => setErr("")} />

      {d.ticket.state === "reported" && !d.escalation && (
        <button className="btn btn-primary" onClick={() => act(() => api.accept(id))}>
          <Check size={16} /> {t("accept")}
        </button>
      )}

      {d.escalation && (
        <div className="card extcard">
          <p className="cardtitle">
            <Building size={15} aria-hidden /> {tradeLabel(d.escalation.trade, l)}
          </p>
          <p className="muted">{escReason(d.escalation.reason, l)}</p>
          {d.escalation.note && <p className="quote">{d.escalation.note}</p>}
          <p className="muted mono">
            {t("raisedOn")} {fmtDT(d.escalation.raised_at, l)}
            {" · "}
            {d.escalation.commissioned_at
              ? `${t("commissionedTo")} ${d.escalation.contractor}`
              : t("notCommissioned")}
          </p>
          <button className="btn" onClick={() => act(() => api.deescalate(id))}>
            {t("giveBack")}
          </button>
        </div>
      )}

      {d.ticket.state === "accepted" && mode === "main" && !d.escalation && d.events.length > 2 && (
        <div className="err">{t("noTimesLeft")}</div>
      )}

      {d.ticket.state === "accepted" && mode === "main" && !d.escalation && (
        <>
          <button className="btn btn-primary" onClick={() => setMode("times")}>
            <Calendar size={16} /> {t("chooseTimes")}
          </button>
          {/* No appointment needed in a stairwell or laundry — but offering
              times stays available, because the caretaker may still want the
              residents to know when he's coming. */}
          {!d.ticket.needs_access && (
            <button className="btn" onClick={() => setMode("close")}>
              <Wrench size={16} /> {t("goFix")}
            </button>
          )}
          <button className="btn" onClick={() => setMode("part")}>
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
        <div className="card">
          <p className="cardtitle">{t("slotsOffered")}</p>
          {d.slots.map((s: any) => <p key={s.id} className="mono muted">{fmtDT(s.starts_at, l)}</p>)}
          <p className="muted">{t("awaitingPick")}</p>
          <button className="btn" onClick={() => setMode("times")}>{t("reoffer")}</button>
        </div>
      )}

      {d.ticket.state === "waiting_for_parts" && !appt && (
        <button className="btn btn-primary" onClick={() => act(() => api.partArrived(id))}>
          <Package size={16} /> {t("partArrived")}
        </button>
      )}

      {appt && mode === "main" && (
        <>
          <div className="card"><p className="cardtitle"><Calendar size={15} aria-hidden /> {fmtDT(appt.starts_at, l)}</p></div>
          <button className="btn btn-primary" onClick={() => setMode("close")}><Wrench size={16} /> {t("markDone")}</button>
          <button className="btn btn-warn" onClick={() => act(() => api.noAccess(id))}>
            <AlertTriangle size={16} /> {t("noAccess")}
          </button>
          <button className="btn" onClick={() => setMode("part")}>
            <Package size={16} aria-hidden /> {t("partNeeded")}
          </button>
          {/* The resident is expecting him, so cancelling has to be possible
              and has to tell them. */}
          <button className="btn" onClick={() => act(() => api.reschedule(id))}>
            <CalendarX size={16} aria-hidden /> {t("cancelAppointment")}
          </button>
        </>
      )}

      {mode === "main" && !d.escalation && d.ticket.state !== "done" && (
        <button className="btn" onClick={() => setMode("escalate")}>
          <Building size={16} aria-hidden /> {t("cantFixMyself")}
        </button>
      )}

      {mode === "escalate" && (
        <div className="card">
          <p className="cardtitle">{t("whichTrade")}</p>
          <div className="grid2">
            {Object.keys(TRADE).map((k) => (
              <Tile key={k} label={tradeLabel(k, l)} active={trade === k} onClick={() => setTrade(k)} />
            ))}
          </div>
          <p className="cardtitle">{t("whyExternal")}</p>
          <div className="grid2">
            {Object.keys(ESC_REASON).map((k) => (
              <Tile key={k} label={escReason(k, l)} active={escWhy === k} onClick={() => setEscWhy(k)} />
            ))}
          </div>
          <textarea className="ta" rows={2} placeholder={t("noteOptional")}
            value={escNote} onChange={(e) => setEscNote(e.target.value)} />
          <div className="row">
            <button className="btn" onClick={() => setMode("main")}>{t("cancel")}</button>
            <button className="btn btn-primary" disabled={!trade || !escWhy}
              onClick={() => act(() => api.escalate(id, trade!, escWhy!, escNote), true)}>
              <Send size={16} aria-hidden /> {t("sendToTrade")}
            </button>
          </div>
        </div>
      )}

      {mode === "close" && (
        <div className="card">
          <p className="cardtitle">{t("causeQ")}</p>
          <div className="grid2">
            {causes.map((c: string) => (
              <Tile key={c} label={causeLabel(c, l)} active={cause === c} onClick={() => setCause(c)} />
            ))}
          </div>
          <div className="row">
            <button className="btn" onClick={() => setMode("main")}>{t("cancel")}</button>
            <button className="btn btn-primary" disabled={!cause}
              onClick={() => act(() => api.done(id, cause!), true)}>
              <Check size={16} /> {t("markDone")}
            </button>
          </div>
        </div>
      )}

      {/* Ordering a part used to live inside the "Done" panel, which meant
          saying "not done, waiting for a part" started with tapping Done. */}
      {mode === "part" && (
        <div className="card">
          <p className="cardtitle"><Package size={15} aria-hidden /> {t("partWhat")}</p>
          <input className="in" value={what} onChange={(e) => setWhat(e.target.value)}
            placeholder="Siphon-Dichtung" />
          <input className="in" value={eta} onChange={(e) => setEta(e.target.value)}
            placeholder={t("supplierEta")} />
          <p className="muted">{t("etaHint")}</p>
          <div className="row">
            <button className="btn" onClick={() => setMode("main")}>{t("cancel")}</button>
            <button className="btn btn-warn" disabled={!what}
              onClick={() => act(() => api.orderPart(id, what, eta), true)}>
              <Package size={16} /> {t("orderPart")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* operator                                                         */
/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
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
  const OPERATOR_OWN: Route["kind"][] =
    ["home", "dashboard", "drill", "month", "repeat", "codes", "ticket"];
  const operatorOwnView = kind === "operator" && OPERATOR_OWN.includes(route.kind);
  const wideView = kind === "operator" || route.kind === "stickers";

  const whoLabel =
    kind === "tenant" && session.home
      ? `${session.home.building_code}-${session.home.unit_code}`
      : (session.principal as any).name ?? roleLabel;

  return (
    <div className="app">
      <header className="topbar" ref={headerRef}>
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

      <main className={operatorOwnView ? "opview" : wideView ? "wide" : "narrow"}>
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
            if (r.kind === "demo") return <DemoPicker t={t} onBack={() => navigate({ kind: "home" })} onDone={loadSession} />;
            if (r.kind === "signup") return <SignUpOrg t={t} onBack={() => navigate({ kind: "home" })} />;
            if (r.kind === "about") return <About t={t} onBack={() => navigate({ kind: "home" })} />;
            if (r.kind === "signin") {
              return <SignIn l={l} t={t} session={session} onDone={loadSession}
                onForgot={() => navigate({ kind: "forgot" })}
                onBack={() => navigate({ kind: "home" })} />;
            }
            return <Landing l={l} t={t}
              onDemo={() => navigate({ kind: "demo" })}
              onSignUp={() => navigate({ kind: "signup" })}
              onSignIn={() => navigate({ kind: "signin" })}
              onAbout={() => navigate({ kind: "about" })} />;
          }

          /* Signed in, but the organisation isn't switched on yet. */
          if (session.orgBlocked) {
            return <OrgWaiting t={t} status={session.org?.status ?? "pending"}
              onSignOut={async () => { await api.logout(); navigate({ kind: "home" }); await loadSession(); }} />;
          }

          if (r.kind === "sent") return <ReportDone t={t} token={sent?.token} onHome={goApp} />;

          if (r.kind === "account") {
            return <Account l={l} t={t} session={session}
              onBack={goApp}
              onLanguage={() => setL(l === "de" ? "en" : "de")}
              onPassword={() => navigate({ kind: "password" })}
              onPlatform={session.principal.isPlatformAdmin ? () => navigate({ kind: "orgs" }) : undefined}
              onAbout={() => navigate({ kind: "about" })}
              onSignOut={async () => { await api.logout(); navigate({ kind: "home" }); await loadSession(); }} />;
          }
          if (r.kind === "password") return <ChangePassword t={t} onBack={() => navigate({ kind: "account" })} />;
          if (r.kind === "about") return <About t={t} onBack={() => navigate({ kind: "account" })} />;

          if (r.kind === "stickers" && isStaffKind) {
            return <StickerSheet l={l} t={t} buildings={session.buildings}
              initialBuilding={r.code ?? null}
              onPick={(code) => navigate({ kind: "stickers", code: code ?? undefined })}
              onBack={() => navigate(kind === "operator" ? { kind: "dashboard" } : { kind: "home" })} />;
          }

          if (kind === "operator") {
            if (r.kind === "orgs" && session.principal.isPlatformAdmin) {
              return <Platform l={l} t={t} onBack={() => navigate({ kind: "dashboard" })} />;
            }
            if (r.kind === "staff") {
              return <StaffPage l={l} t={t} me={session.principal.staffId}
                onBack={() => navigate({ kind: "dashboard" })} />;
            }
            if (r.kind === "buildings" || r.kind === "building") {
              return <BuildingsPage l={l} t={t}
                onBack={() => navigate({ kind: "dashboard" })}
                openCode={r.kind === "building" ? r.code : null}
                onOpen={(code) => navigate(code ? { kind: "building", code } : { kind: "buildings" })} />;
            }
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
