import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  User, Wrench, ArrowRight, Database, QrCode, Printer, ChevronLeft, Copy, Check,
  LayoutDashboard, HelpCircle, Eye, EyeOff, Package,
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
  const [showPw, setShowPw] = useState(false);
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
            {/* A toggle here too: this is where somebody typed it wrong and
                can't tell why they're being refused. */}
            <div className="pwwrap">
              <input className="in pwin" type={showPw ? "text" : "password"} value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
              <button type="button" className="pweye" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? t("hidePassword") : t("showPassword")}
                aria-pressed={showPw}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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

  const ready = !!objectId && !!symptom && !(symptom === "OTHER" && !note.trim());

  return (
    /*
      The first screen a new resident ever sees, so it says where they are
      before it asks anything: the room comes off the sticker, not from them.
    */
    <div className="rz">
      <div className="col rz-body">
        <div>
          <span className="rz-plate">
            {room.building_code}-{room.unit_code} · {roomLabel(room.room_type, l)}
          </span>
          <h2 className="rz-display" style={{ marginTop: 10 }}>
            {needsAuth ? t("signInToReport") : t("whatBroken")}
          </h2>
        </div>

        {needsAuth ? (
          <button className="rz-btn rz-btn-primary" onClick={onSignIn}>
            {t("signInBtn")} <ArrowRight size={17} aria-hidden />
          </button>
        ) : (
          <>
            <div className="rz-tiles">
              {data.siblings.map((s: any) => {
                const Icon = objIcon(s.object_type) ?? Package;
                const many = data.siblings
                  .filter((x: any) => x.object_type === s.object_type).length > 1;
                return (
                  <button key={s.id} className="rz-tile"
                    aria-pressed={objectId === s.id}
                    style={objectId === s.id
                      ? { boxShadow: "inset 0 0 0 2px var(--primary)", background: "var(--primary-50)" }
                      : undefined}
                    onClick={() => { setObjectId(s.id); setSymptom(null); }}>
                    <Icon size={28} strokeWidth={1.6} aria-hidden />
                    <span className="rz-tilelabel">
                      {objLabel(s.object_type, l)}{many ? ` ${s.ordinal}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            {current && (
              <>
                <div className="rz-grouphead">
                  <p className="rz-overline">{t("whatWrong")}</p>
                  <span className="rz-rule" />
                </div>
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
              </>
            )}

            {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
          </>
        )}
      </div>

      {/* Only once there's something to send. "Something else" carries no
          information on its own, so the note stops being optional with it. */}
      {!needsAuth && current && (
        <div className="rz-actionbar">
          <button className="rz-actionmain" disabled={!ready || busy}
            style={!ready ? { background: "var(--rz-surface-3)", color: "var(--fg-3)", boxShadow: "none" } : undefined}
            onClick={send}>
            {t("send")} <ArrowRight size={17} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** Shown after an anonymous report: the capability link is the only way back. */
export function ReportDone({ t, token, onHome }: { t: T; token?: string; onHome: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = token ? `${location.origin}/t/${token}` : null;
  return (
    /*
      An anonymous report has no account behind it, so this link is the only way
      the person ever sees their own report again. It gets the whole screen
      rather than a line in a card.
    */
    <div className="rz">
      <div className="col rz-body">
        <div className="rz-appt" style={{ alignItems: "flex-start" }}>
          <Check size={22} strokeWidth={2.2} aria-hidden />
          <div>
            <p className="rz-apptwhen">{t("reportSent")}</p>
          </div>
        </div>

        {url && (
          <>
            <div className="rz-grouphead">
              <p className="rz-overline">{t("saveLink")}</p>
              <span className="rz-rule" />
            </div>

            <div className="rz-notewell">
              <p className="rz-mono" style={{ wordBreak: "break-all" }}>{url}</p>
            </div>

            <button className="rz-btn rz-btn-primary" style={{ alignSelf: "flex-start" }}
              onClick={async () => {
                try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* ignore */ }
              }}>
              {copied
                ? <><Check size={17} aria-hidden /> {t("copied")}</>
                : <><Copy size={17} aria-hidden /> {t("copyLink")}</>}
            </button>
          </>
        )}

        <button className="rz-btn rz-btn-ghost" style={{ alignSelf: "flex-start" }}
          onClick={onHome}>
          {t("backToApp")}
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Printable QR sticker sheet                                         */
/* ================================================================== */

function Qr({ text, size = 132 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    QRCode.toCanvas(el, text, {
      width: size,          // the backing store, so print and 3x screens stay sharp
      margin: 1,
      errorCorrectionLevel: "Q",
      color: { dark: "#000000", light: "#ffffff" },
    }).then(() => {
      /*
       * The encoder writes style.width and style.height onto the canvas, and an
       * inline style outranks a class rule — so `.qr { width: 66px }` never
       * applied and the code rendered at its full backing size, squeezing the
       * label column until "Bathroom" became "Bathr". Clearing them hands
       * sizing back to the stylesheet.
       */
      el.style.removeProperty("width");
      el.style.removeProperty("height");
    }).catch(() => {});
  }, [text, size]);
  return <canvas ref={ref} width={size} height={size} className="qr" />;
}

export function StickerSheet({ l, t, buildings, onBack, initialBuilding, onPick }: {
  l: Locale; t: T; buildings: any[]; onBack: () => void;
  /** Set when arriving from a building card, or from /stickers/A. */
  initialBuilding?: string | null;
  /* Picking changes the URL, so /stickers/A is linkable and back returns to the
     picker rather than leaving the sheet entirely. */
  onPick?: (code: string | null) => void;
}) {
  const code = initialBuilding ?? null;
  const setCode = (c: string | null) => onPick?.(c);
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
          onClick={() => setCode(null)}>
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
