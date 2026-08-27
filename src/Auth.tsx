import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  User, Wrench, ArrowRight, Database, QrCode, Printer, ChevronLeft, Copy, Check,
  LayoutDashboard, HelpCircle,
} from "lucide-react";
import {
  api, roomLabel, objLabel, objIcon, symptomLabel, SYMPTOMS_FOR,
  type Locale, type StrKey,
} from "./lib";
import { Logo } from "./Logo";

type T = (k: StrKey) => string;

/* ================================================================== */
/* About — a short explanation, reachable from the sign-in screen      */
/* ================================================================== */

export function About({ t, onBack }: { t: T; onBack: () => void }) {
  return (
    <div className="col about">
      <button className="linkback" onClick={onBack}>
        <ChevronLeft size={16} /> {t("back")}
      </button>

      <div className="aboutmark">
        <Logo size={62} label="DormTag" />
      </div>
      <h2 className="abouttitle">{t("aboutTitle")}</h2>

      <p className="aboutlead">{t("aboutLead")}</p>
      <p className="aboutlead">{t("aboutLead2")}</p>

      <div className="aboutcard">
        <p className="aboutcardtitle"><User size={15} strokeWidth={1.75} aria-hidden /> {t("aboutResident")}</p>
        <p className="muted">{t("aboutResidentTxt")}</p>
      </div>

      <div className="aboutcard">
        <p className="aboutcardtitle"><Wrench size={15} strokeWidth={1.75} aria-hidden /> {t("aboutStaff")}</p>
        <p className="muted">{t("aboutStaffTxt")}</p>
      </div>

      <div className="aboutcard">
        <p className="aboutcardtitle">
          <LayoutDashboard size={15} strokeWidth={1.75} aria-hidden /> {t("aboutOperator")}
        </p>
        <p className="muted">{t("aboutOperatorTxt")}</p>
      </div>

      <p className="aboutfooter">{t("aboutFooter")}</p>
      <p className="abouttag">{t("aboutTag1")}<br />{t("aboutTag2")}</p>
    </div>
  );
}

/* ================================================================== */
/* Sign in — two real credential paths, no role switching             */
/* ================================================================== */

export function SignIn({ l, t, session, onDone, onForgot, onBack }: {
  l: Locale; t: T; session: any; onDone: () => Promise<void>;
  onForgot?: () => void; onBack?: () => void;
}) {
  const [showAbout, setShowAbout] = useState(false);
  const [tab, setTab] = useState<"resident" | "staff">("resident");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hints = session?.demoHints;

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      if (tab === "resident") await api.residentLogin(code);
      else await api.staffLogin(email, password);
      await onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const seed = async () => {
    setBusy(true); setErr("");
    try { await api.seed(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (showAbout) return <About t={t} onBack={() => setShowAbout(false)} />;

  return (
    <div className="col signin">
      {onBack && (
        <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("back")}</button>
      )}
      <h2>{t("signInTitle")}</h2>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "resident"}
          className={"tab" + (tab === "resident" ? " tab-on" : "")}
          onClick={() => { setTab("resident"); setErr(""); }}>
          <User size={15} strokeWidth={1.75} aria-hidden /> {t("iLiveHere")}
        </button>
        <button role="tab" aria-selected={tab === "staff"}
          className={"tab" + (tab === "staff" ? " tab-on" : "")}
          onClick={() => { setTab("staff"); setErr(""); }}>
          <Wrench size={15} strokeWidth={1.75} aria-hidden /> {t("iWorkHere")}
        </button>
      </div>

      {err && <div className="err" role="alert" onClick={() => setErr("")}>{err}</div>}

      {tab === "resident" ? (
        <>
          <label className="field">
            <span>{t("accessCode")}</span>
            <input className="in" value={code} autoCapitalize="characters" autoComplete="one-time-code"
              placeholder="B312-Z2-XXXX" onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </label>
          <p className="muted">{t("codeHint")}</p>
        </>
      ) : (
        <>
          <label className="field">
            <span>{t("emailLabel")}</span>
            <input className="in" type="email" value={email} autoComplete="username"
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("passwordLabel")}</span>
            <input className="in" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </label>
        </>
      )}

      <button className="btn btn-primary btn-big" disabled={busy} onClick={submit}>
        {t("signInBtn")} <ArrowRight size={16} />
      </button>

      {/* Only on the staff tab: residents have a room code, not a password. */}
      {tab === "staff" && onForgot && (
        <button className="aboutlink" onClick={onForgot}>{t("forgotLink")}</button>
      )}

      <button className="aboutlink" onClick={() => setShowAbout(true)}>
        <HelpCircle size={14} aria-hidden /> {t("aboutLink")}
      </button>

      {hints && (
        <div className="card demo">
          <p className="cardtitle">{t("demoCreds")}</p>
          <button className="demorow" onClick={() => { setTab("resident"); setCode(hints.resident.code); }}>
            <span>{t("tenant")}</span><span className="mono">{hints.resident.code}</span>
          </button>
          <button className="demorow" onClick={() => { setTab("staff"); setEmail(hints.staff.email); setPassword(hints.staff.password); }}>
            <span>{t("staff")}</span><span className="mono">{hints.staff.email}</span>
          </button>
          <button className="demorow" onClick={() => { setTab("staff"); setEmail(hints.operator.email); setPassword(hints.operator.password); }}>
            <span>{t("operator")}</span><span className="mono">{hints.operator.email}</span>
          </button>
          <button className="btn" disabled={busy} onClick={seed}>
            <Database size={16} /> {t("seedFirst")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Scanned sticker — the QR landing page at /r/:slug                  */
/* ================================================================== */

export function ScanLanding({ l, t, slug, principal, onSignIn, onDone }: {
  l: Locale; t: T; slug: string; principal: any;
  onSignIn: () => void; onDone: (ticketId: string, token?: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [objectId, setObjectId] = useState<string | null>(null);
  const [symptom, setSymptom] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.sticker(slug)
      .then((d) => {
        setData(d);
        // Room stickers leave the choice open; object stickers preselect.
        setObjectId(d.object?.id ?? null);
      })
      .catch((e) => setErr(e.message));
  }, [slug]);

  if (err) return <div className="col"><div className="err">{err}</div></div>;
  if (!data) return <p className="muted">…</p>;

  const room = data.room;
  const needsAuth = room.room_kind === "private" && !room.is_common && principal.kind === "anonymous";
  const current = data.siblings.find((s: any) => s.id === objectId) ?? null;
  const syms = current ? (SYMPTOMS_FOR[current.object_type] ?? ["BROKEN"]) : [];

  const send = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.report(objectId!, symptom!, note);
      onDone(r.id, r.token);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="col">
      <div className="scanned">
        <QrCode size={20} strokeWidth={1.5} aria-hidden />
        <span className="plate">
          {room.building_code}-{room.unit_code} · {roomLabel(room.room_type, l)}
        </span>
      </div>

      {needsAuth ? (
        <>
          <p className="muted">{t("signInToReport")}</p>
          <button className="btn btn-primary" onClick={onSignIn}>{t("signInBtn")}</button>
        </>
      ) : (
        <>
          <h2>{t("whatBroken")}</h2>
          <div className="grid2">
            {data.siblings.map((s: any) => {
              const Icon = objIcon(s.object_type);
              return (
                <button key={s.id}
                  className={"tile" + (objectId === s.id ? " tile-on" : "")}
                  onClick={() => { setObjectId(s.id); setSymptom(null); }}>
                  {Icon && <Icon size={26} strokeWidth={1.5} aria-hidden />}
                  <span>
                    {objLabel(s.object_type, l)}
                    {data.siblings.filter((x: any) => x.object_type === s.object_type).length > 1
                      ? ` ${s.ordinal}` : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {current && (
            <>
              <h2>{t("whatWrong")}</h2>
              <div className="grid2">
                {syms.map((s) => (
                  <button key={s} className={"tile tile-text" + (symptom === s ? " tile-on" : "")}
                    onClick={() => setSymptom(s)}>
                    <span>{symptomLabel(s, l)}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {current && (
            <textarea className="ta" rows={2}
              placeholder={symptom === "OTHER" ? t("noteWanted") : t("noteOptional")}
              value={note} onChange={(e) => setNote(e.target.value)} />
          )}

          {err && <div className="err">{err}</div>}
          {/* "Something else" carries no information on its own, so the note
              stops being optional when it's chosen. */}
          <button className="btn btn-primary"
            disabled={!objectId || !symptom || busy || (symptom === "OTHER" && !note.trim())}
            onClick={send}>
            {t("send")} <ArrowRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}

/** Shown after an anonymous report: the capability link is the only way back. */
export function ReportDone({ t, token, onHome }: { t: T; token?: string; onHome: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = token ? `${location.origin}/t/${token}` : null;
  return (
    <div className="col">
      <div className="flash">{t("reportSent")}</div>
      {url && (
        <div className="card">
          <p className="muted">{t("saveLink")}</p>
          <p className="mono breakall">{url}</p>
          <button className="btn" onClick={async () => {
            try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* ignore */ }
          }}>
            {copied ? <><Check size={16} /> {t("copied")}</> : <><Copy size={16} /> {t("copyLink")}</>}
          </button>
        </div>
      )}
      <button className="btn" onClick={onHome}>{t("backToApp")}</button>
    </div>
  );
}

/* ================================================================== */
/* Printable QR sticker sheet                                         */
/* ================================================================== */

function Qr({ text, size = 132 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "Q",
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {});
  }, [text, size]);
  return <canvas ref={ref} width={size} height={size} className="qr" />;
}

export function StickerSheet({ l, t, buildings, onBack, initialBuilding }: {
  l: Locale; t: T; buildings: any[]; onBack: () => void;
  /** Set when arriving from a building card: skip the picker entirely. */
  initialBuilding?: string | null;
}) {
  const [code, setCode] = useState<string | null>(initialBuilding ?? null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  // Filters, because the common job is reprinting one damaged sticker in a
  // building of 240 rooms, not printing the building.
  const [floor, setFloor] = useState<string>("");
  const [unitQ, setUnitQ] = useState("");
  const [roomType, setRoomType] = useState<string>("");
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!code) return;
    setData(null); setErr(""); setPicked([]);
    setFloor(""); setUnitQ(""); setRoomType("");
    api.stickerSheet(code).then(setData).catch((e) => setErr(e.message));
  }, [code]);

  const origin = useMemo(() => location.origin, []);

  if (!code) {
    return (
      <div className="col">
        <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("backToApp")}</button>
        <h2>{t("stickers")}</h2>
        <p className="muted">{t("pickBuilding")}</p>
        {buildings.map((b) => (
          <button key={b.code} className="card cardlink" onClick={() => setCode(b.code)}>
            <div className="rowspread">
              <span className="cardtitle">{b.name}</span>
              <span className="plate plate-sm">{b.code}</span>
            </div>
          </button>
        ))}
      </div>
    );
  }

  const all: any[] = data?.stickers ?? [];
  const floors = [...new Set(all.map((x) => x.floor))].sort((a, b) => a - b);
  const roomTypes = [...new Set(all.map((x) => x.room_type).filter(Boolean))];

  const q = unitQ.trim().toLowerCase();
  const shown = all.filter((x) =>
    (floor === "" || String(x.floor) === floor) &&
    (roomType === "" || x.room_type === roomType) &&
    (q === "" ||
      String(x.unit_code).toLowerCase().includes(q) ||
      String(x.room_code).toLowerCase().includes(q) ||
      String(x.qr_slug).toLowerCase().includes(q))
  );

  // Selection is optional: with nothing picked, printing gives you everything
  // currently shown, so filtering alone is enough for the usual case.
  const toPrint = picked.length
    ? shown.filter((x) => picked.includes(x.qr_slug))
    : shown;
  const toggle = (slug: string) =>
    setPicked((a) => a.includes(slug) ? a.filter((x) => x !== slug) : [...a, slug]);

  const filtered = floor !== "" || roomType !== "" || q !== "";

  return (
    <div className="col">
      <div className="rowspread noprint">
        {/* Arriving from a building card means there is no picker behind this,
            so Back must leave the sheet rather than drop into one. */}
        <button className="linkback"
          onClick={() => (initialBuilding ? onBack() : setCode(null))}>
          <ChevronLeft size={16} /> {initialBuilding ? t("backToApp") : t("pickBuilding")}
        </button>
        <div className="row">
          <span className="muted">
            {toPrint.length}{toPrint.length !== all.length ? ` / ${all.length}` : ""} {t("stickerCount")}
          </span>
          <button className="btn" disabled={toPrint.length === 0} onClick={() => window.print()}>
            <Printer size={16} aria-hidden /> {t("printSheet")}
          </button>
        </div>
      </div>

      <div className="controls noprint">
        <label className="ctl">
          <span>{t("floorLabel")}</span>
          <select className="in" value={floor} onChange={(e) => setFloor(e.target.value)}>
            <option value="">{t("allFloors")}</option>
            {floors.map((f) => <option key={f} value={String(f)}>{t("floorShort")}{f}</option>)}
          </select>
        </label>
        <label className="ctl">
          <span>{t("roomsInUnit")}</span>
          <select className="in" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
            <option value="">{t("allRooms")}</option>
            {roomTypes.map((rt) => <option key={rt} value={rt}>{roomLabel(rt, l)}</option>)}
          </select>
        </label>
        <label className="ctl">
          <span>{t("findUnit")}</span>
          <input className="in mono" value={unitQ} placeholder="204"
            onChange={(e) => setUnitQ(e.target.value)} />
        </label>
      </div>

      {(picked.length > 0 || filtered) && (
        <div className="row noprint">
          <span className="muted">
            {picked.length > 0 ? `${picked.length} ${t("selectedWord")}` : t("filteredWord")}
          </span>
          {picked.length > 0 && (
            <button className="linkmore" onClick={() => setPicked([])}>{t("clearSelection")}</button>
          )}
          {filtered && (
            <button className="linkmore" onClick={() => { setFloor(""); setRoomType(""); setUnitQ(""); }}>
              {t("clearFilter")}
            </button>
          )}
        </div>
      )}

      {err && <div className="err">{err}</div>}
      {!data && !err && <p className="muted">…</p>}
      {data && shown.length === 0 && (
        <div className="empty"><p className="muted">{t("nothingHere")}</p></div>
      )}

      {data && (
        <div className="sheet">
          {shown.map((s2: any) => {
            const on = picked.includes(s2.qr_slug);
            // When something is selected, everything else is dropped from the
            // printed page but stays on screen so you can keep choosing.
            const printable = picked.length === 0 || on;
            return (
              <button key={s2.qr_slug} type="button"
                className={"stickercard" + (on ? " stickerpicked" : "") + (printable ? "" : " noprint")}
                onClick={() => toggle(s2.qr_slug)}>
                <Qr text={`${origin}/r/${s2.qr_slug}`} />
                <div className="stickermeta">
                  <span className="stickerplate">
                    {data.building.code}-{s2.unit_code}
                    {s2.is_common ? ` · ${t("floorShort")}${s2.floor}` : ""}
                  </span>
                  <span className="stickerobj">
                    {s2.kind === "room"
                      ? (s2.room_label || roomLabel(s2.room_type, l))
                      : `${objLabel(s2.object_type, l)} ${s2.ordinal}`}
                  </span>
                  <span className="stickerhint">{t("reportProblem")} · Schaden melden</span>
                  <span className="stickerslug mono">{s2.qr_slug}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
