import React, { useCallback, useEffect, useState } from "react";
import {
  QrCode, Calendar, Clock, Check, ChevronLeft, Package, AlertTriangle, Key,
  Building2, Wrench, LayoutDashboard, Languages, User, Users, ArrowRight, Plus,
  LogOut, Camera,
} from "lucide-react";
import {
  api, T, SYMPTOMS_FOR, CAUSE, CAUSES_FOR,
  roomLabel, roomIcon, objLabel, objIcon, symptomLabel, causeLabel, reasonLabel,
  fmtDay, fmtDT, fmtTime, plate, title, STATE_TONE, type Locale, type StrKey,
} from "./lib";
import { SignIn, ScanLanding, ReportDone, StickerSheet } from "./Auth";
import { ScannerModal } from "./Scanner";
import { SlotPicker, type SlotRules } from "./SlotPicker";

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

function TenantView({ l, t, tickets, reload, home, onScan }: { l: Locale; t: (k: StrKey) => string; tickets: any[]; reload: () => Promise<void>; home: any; onScan: () => void }) {
  const [screen, setScreen] = useState<"list" | "scan" | "object" | "symptom">("list");
  const [rows, setRows] = useState<any[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [objectId, setObjectId] = useState<string | null>(null);
  const [symptom, setSymptom] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { api.myRooms().then((d) => setRows(d.rows)).catch(() => {}); }, []);

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
        <button className="linkback" onClick={() => setScreen("list")}><ChevronLeft size={16} /> {t("back")}</button>

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
                onClick={() => { setRoomId(r.room_id); setObjectId(null); setSymptom(null); setScreen("object"); }}>
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
        <button className="linkback" onClick={() => setScreen("scan")}><ChevronLeft size={16} /> {t("back")}</button>
        <Plate>{roomLabel(room?.room_type ?? "", l)}</Plate>
        <h2>{t("whatBroken")}</h2>
        <div className="grid2">
          {objects.map((o) => (
            <Tile key={o.object_id} icon={objIcon(o.object_type)}
              label={objLabel(o.object_type, l)}
              onClick={() => { setObjectId(o.object_id); setScreen("symptom"); }} />
          ))}
        </div>
      </div>
    );
  }

  if (screen === "symptom" && currentObj) {
    const syms = SYMPTOMS_FOR[currentObj.object_type] ?? ["BROKEN"];
    return (
      <div className="col">
        <button className="linkback" onClick={() => setScreen("object")}><ChevronLeft size={16} /> {t("back")}</button>
        <Plate>{roomLabel(currentObj.room_type, l)} · {objLabel(currentObj.object_type, l)}</Plate>
        <h2>{t("whatWrong")}</h2>
        <Err msg={err} onClose={() => setErr("")} />
        <div className="grid2">
          {syms.map((s) => (
            <Tile key={s} label={symptomLabel(s, l)} active={symptom === s} onClick={() => setSymptom(s)} />
          ))}
        </div>
        <textarea className="ta" rows={2} placeholder={t("noteOptional")} value={note}
          onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-primary" disabled={!symptom}
          onClick={async () => {
            try {
              const r = await api.report(objectId!, symptom!, note);
              setNote(""); setSymptom(null); setScreen("list");
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

  return (
    <div className="col">
      <div className="rowspread">
        <h2>{t("myReports")}</h2>
        <button className="btn btn-primary" onClick={() => setScreen("scan")}><Plus size={16} /> {t("newReport")}</button>
      </div>
      {flash && <div className="flash" onClick={() => setFlash("")}>{flash}</div>}
      {tickets.length === 0 && (
        <div className="empty"><p>{t("noReports")}</p><p className="muted">{t("noReportsCta")}</p></div>
      )}
      {tickets.map((x: any) => (
        <button key={x.ticket_id} className="card cardlink" onClick={() => setOpenId(x.ticket_id)}>
          <div className="rowspread">
            <Plate sm>{plate(x, l)}</Plate>
            <Pill tone={STATE_TONE[x.state]}>{t(("st_" + x.state) as StrKey)}</Pill>
          </div>
          <p className="cardtitle">{title(x, x.symptom, l)}</p>
          {x.appt_at && <p className="mono muted"><Calendar size={13} /> {fmtDT(x.appt_at, l)}</p>}
          {x.part_what && <p className="mono muted"><Package size={13} /> {x.part_what} · {t("supplierEta")}: {x.part_eta}</p>}
          {x.state === "slots_offered" && <p className="cta">{t("pickSlot")} →</p>}
        </button>
      ))}
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

      {d.ticket.state === "slots_offered" && (
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

      {appt && (
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

function StaffView({ l, t, tickets, reload, rules }: { l: Locale; t: (k: StrKey) => string; tickets: any[]; reload: () => Promise<void>; rules: SlotRules }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (openId) return <StaffTicket l={l} t={t} id={openId} rules={rules} onBack={() => { setOpenId(null); reload(); }} />;

  const live = tickets.filter((x: any) => x.state !== "done" && x.state !== "cancelled");
  const booked = live.filter((x: any) => x.appt_at).sort((a: any, b: any) => a.appt_at - b.appt_at);
  const noSlot = live.filter((x: any) => !x.appt_at && x.state !== "waiting_for_parts");
  const waiting = live.filter((x: any) => !x.appt_at && x.state === "waiting_for_parts");

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
          {x.reporter_count > 1 && ` · ${x.reporter_count} ${t("reports")}`}
          {!!x.access_consent && <> · <Key size={12} aria-hidden /></>}
        </p>
      </div>
    </button>
  );

  return (
    <div className="col">
      <div className="rowspread"><h2>{t("queueToday")}</h2><span className="muted">{live.length} {t("jobs")}</span></div>
      {booked.map((x: any) => <Row key={x.ticket_id} x={x} />)}
      {noSlot.length > 0 && <p className="eyebrow">{t("queueNew")}</p>}
      {noSlot.map((x: any) => <Row key={x.ticket_id} x={x} />)}
      {waiting.length > 0 && <p className="eyebrow">{t("queueWaiting")}</p>}
      {waiting.map((x: any) => <Row key={x.ticket_id} x={x} />)}
    </div>
  );
}

function StaffTicket({ l, t, id, onBack, rules }: any) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"main" | "close" | "times">("main");
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

      {d.ticket.state === "reported" && (
        <button className="btn btn-primary" onClick={() => act(() => api.accept(id))}>
          <Check size={16} /> {t("accept")}
        </button>
      )}

      {d.ticket.state === "accepted" && mode === "main" && (
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
        </>
      )}

      {mode === "times" && (
        <SlotPicker l={l} t={t} rules={rules} busy={false}
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
        </>
      )}

      {mode === "close" && (
        <div className="card">
          <p className="cardtitle">{t("causeQ")}</p>
          <div className="grid2">
            {causes.map((c: string) => (
              <Tile key={c} label={causeLabel(c, l)} active={cause === c} onClick={() => setCause(c)} />
            ))}
          </div>
          <button className="btn btn-primary" disabled={!cause}
            onClick={() => act(() => api.done(id, cause!), true)}>
            <Check size={16} /> {t("markDone")}
          </button>
          <div className="hr" />
          <p className="cardtitle">{t("partWhat")}</p>
          <input className="in" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Siphon-Dichtung" />
          <input className="in" value={eta} onChange={(e) => setEta(e.target.value)} placeholder={t("supplierEta")} />
          <button className="btn btn-warn" disabled={!what}
            onClick={() => act(() => api.orderPart(id, what, eta), true)}>
            <Package size={16} /> {t("orderPart")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* operator                                                         */
/* ---------------------------------------------------------------- */

function OperatorView({ l, t }: any) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.dashboard().then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <Err msg={err} />;
  if (!d) return <p className="muted">…</p>;

  const m = d.metrics;
  return (
    <div className="col">
      <div className="metrics">
        {[[t("openTickets"), m.open], [t("medianFix"), m.medianDays + " d"],
          [t("waitingParts"), m.waitingParts], [t("failedVisits"), m.failedPct + "%"]].map(([lab, v]: any) => (
          <div className="metric" key={lab}><p className="muted">{lab}</p><p className="big mono">{v}</p></div>
        ))}
      </div>

      <div className="card">
        <div className="rowspread">
          <p className="cardtitle">{t("repeatFaults")}</p>
          <span className="muted">{t("last12")}</span>
        </div>
        {d.repeats.length === 0 && <p className="muted">{t("nothingFlagged")}</p>}
        {d.repeats.map((g: any, i: number) => {
          const flagged = g.systemic >= 3;
          return (
            <div key={i} className={"repeat" + (flagged ? " repeat-flag" : "")}>
              <div className="rowspread">
                <span className="mono">{g.building_code} · {g.riser} · {objLabel(g.object_type, l)}</span>
                <span className="mono">{g.ticket_count} {t("ticketsWord")}</span>
              </div>
              <p className="muted">
                {g.rooms_affected} {t("roomsAffected")}
                {flagged && ` · ${t("systemicHint")} ${g.systemic} ${t("ofWord")} ${g.ticket_count}`}
              </p>
            </div>
          );
        })}
      </div>

      <p className="eyebrow">{t("buildings")}</p>
      <div className="bgrid">
        {d.buildings.map((b: any) => {
          const load = Math.min(100, Math.round((b.open_count / 20) * 100));
          return (
            <div className="card" key={b.id}>
              <div className="rowspread">
                <p className="cardtitle">{b.name}</p>
                <Plate sm>{b.code}</Plate>
              </div>
              <p className="muted mono">{b.room_count} {t("roomsWord")} · {b.open_count} {t("openWord")}</p>
              <div className="bar"><div className={"barfill" + (load > 50 ? " barfill-warn" : "")} style={{ width: load + "%" }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* app shell                                                        */
/* ---------------------------------------------------------------- */

/** Minimal path router: /r/:slug is a scanned sticker, /t/:token a report link. */
function readRoute() {
  const m = location.pathname.match(/^\/(r|t)\/([A-Za-z0-9_-]+)\/?$/);
  if (!m) return { kind: "app" as const };
  return m[1] === "r"
    ? { kind: "scan" as const, slug: m[2] }
    : { kind: "token" as const, token: m[2] };
}

export default function App() {
  const [l, setL] = useState<Locale>(() => (navigator.language.startsWith("de") ? "de" : "en"));
  const [session, setSession] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [route, setRoute] = useState(readRoute);
  const [screen, setScreen] = useState<"main" | "stickers" | "sent">("main");
  const [sent, setSent] = useState<{ id: string; token?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [homeKey, setHomeKey] = useState(0);

  const goScan = useCallback((slug: string) => {
    history.pushState({}, "", `/r/${slug}`);
    setRoute({ kind: "scan", slug });
    setScreen("main");
  }, []);

  /**
   * The logo is "home". Each role view keeps its own screen state, so bumping
   * homeKey remounts it — that's what takes a resident back to My reports and
   * a caretaker back to the queue, from wherever they were.
   */
  const goHome = useCallback(() => {
    history.pushState({}, "", "/");
    setRoute({ kind: "app" });
    setScreen("main");
    setSent(null);
    setHomeKey((n) => n + 1);
  }, []);

  const goApp = useCallback(() => {
    history.pushState({}, "", "/");
    setRoute({ kind: "app" });
    setScreen("main");
  }, []);
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

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand brandbtn" onClick={goHome} aria-label={t("appName")}>
          <Building2 size={18} strokeWidth={1.75} aria-hidden /><span>{t("appName")}</span>
        </button>
        <div className="row">
          <button className="lang" onClick={() => setScanning(true)} aria-label={t("scanOpen")}>
            <Camera size={14} aria-hidden />
          </button>
          {isStaffKind && (
            <button className="lang" onClick={() => setScreen(screen === "stickers" ? "main" : "stickers")}
              aria-label={t("stickers")}><QrCode size={14} aria-hidden /></button>
          )}
          {kind !== "anonymous" && (
            <>
              <span className="who"><RoleIcon size={14} strokeWidth={1.75} aria-hidden /> {roleLabel}</span>
              <button className="lang" onClick={async () => { await api.logout(); await loadSession(); }}
                aria-label={t("logout")}><LogOut size={14} /></button>
            </>
          )}
          <button className="lang" onClick={() => setL(l === "de" ? "en" : "de")}>
            <Languages size={14} aria-hidden /> {l.toUpperCase()}
          </button>
        </div>
      </header>

      <main className={kind === "operator" || screen === "stickers" ? "wide" : "narrow"}>
        {screen === "sent" ? (
          <ReportDone t={t} token={sent?.token} onHome={goApp} />
        ) : route.kind === "scan" ? (
          <ScanLanding
            l={l} t={t} slug={route.slug} principal={session.principal}
            onSignIn={goApp}
            onDone={(id, token) => { setSent({ id, token }); setScreen("sent"); reload(); }}
          />
        ) : screen === "stickers" && isStaffKind ? (
          <StickerSheet l={l} t={t} buildings={session.buildings} onBack={() => setScreen("main")} />
        ) : kind === "anonymous" ? (
          <SignIn l={l} t={t} session={session} onDone={loadSession} />
        ) : kind === "tenant" ? (
          <TenantView key={homeKey} l={l} t={t} tickets={tickets} reload={reload} home={session.home} onScan={() => setScanning(true)} />
        ) : kind === "staff" ? (
          <StaffView key={homeKey} l={l} t={t} tickets={tickets} reload={reload} rules={session.slotRules} />
        ) : (
          <OperatorView l={l} t={t} />
        )}
      </main>

      {scanning && (
        <ScannerModal t={t} onClose={() => setScanning(false)}
          onFound={(slug) => { setScanning(false); goScan(slug); }} />
      )}
    </div>
  );
}
