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
        <QrCode size={34} strokeWidth={1.25} aria-hidden />
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

export function SignIn({ l, t, session, onDone }: { l: Locale; t: T; session: any; onDone: () => Promise<void> }) {
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
      .then((d) => { setData(d); setObjectId(d.object.id); })
      .catch((e) => setErr(e.message));
  }, [slug]);

  if (err) return <div className="col"><div className="err">{err}</div></div>;
  if (!data) return <p className="muted">…</p>;

  const o = data.object;
  const needsAuth = o.room_kind === "private" && principal.kind === "anonymous";
  const current = data.siblings.find((s: any) => s.id === objectId) || o;
  const syms = SYMPTOMS_FOR[current.object_type] ?? ["BROKEN"];

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
          {o.building_code}-{o.unit_code} · {roomLabel(o.room_type, l)}
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
                  <span>{objLabel(s.object_type, l)}</span>
                </button>
              );
            })}
          </div>

          <h2>{t("whatWrong")}</h2>
          <div className="grid2">
            {syms.map((s) => (
              <button key={s} className={"tile tile-text" + (symptom === s ? " tile-on" : "")}
                onClick={() => setSymptom(s)}>
                <span>{symptomLabel(s, l)}</span>
              </button>
            ))}
          </div>

          <textarea className="ta" rows={2} placeholder={t("noteOptional")}
            value={note} onChange={(e) => setNote(e.target.value)} />

          {err && <div className="err">{err}</div>}
          <button className="btn btn-primary" disabled={!symptom || busy} onClick={send}>
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

export function StickerSheet({ l, t, buildings, onBack }: {
  l: Locale; t: T; buildings: any[]; onBack: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!code) return;
    setData(null); setErr("");
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

  return (
    <div className="col">
      <div className="rowspread noprint">
        <button className="linkback" onClick={() => setCode(null)}>
          <ChevronLeft size={16} /> {t("backToApp")}
        </button>
        {data && (
          <div className="row">
            <span className="muted">{data.stickers.length} {t("stickerCount")}</span>
            <button className="btn" onClick={() => window.print()}>
              <Printer size={16} /> {t("printSheet")}
            </button>
          </div>
        )}
      </div>

      {err && <div className="err">{err}</div>}
      {!data && !err && <p className="muted">…</p>}

      {data && (
        <div className="sheet">
          {data.stickers.map((s: any) => (
            <div className="stickercard" key={s.qr_slug}>
              <Qr text={`${origin}/r/${s.qr_slug}`} />
              <div className="stickermeta">
                <span className="stickerplate">
                  {data.building.code}-{s.unit_code} · {s.room_code}
                </span>
                <span className="stickerobj">{objLabel(s.object_type, l)}</span>
                <span className="stickerhint">{t("reportProblem")} · Schaden melden</span>
                <span className="stickerslug mono">{s.qr_slug}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
