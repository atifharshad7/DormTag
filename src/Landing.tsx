import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ChevronLeft, ArrowRight, Play, Building2, LogIn, QrCode,
  ListChecks, BarChart3, User, Wrench, LayoutDashboard, Check, X,
  Mail, Lock, AlertTriangle } from "lucide-react";
import { api, objLabel, roomLabel, symptomLabel, type Locale, type StrKey } from "./lib";
import { Logo } from "./Logo";
import { Gallery } from "./Gallery";
import { PrintBlock } from "./PrintBlock";

type T = (k: StrKey) => string;

/**
 * The front door.
 *
 * The demo comes first on purpose: someone arriving cold will click that before
 * they'd fill in a signup form, and it's the thing most likely to convince them.
 */
export function Landing({ l, t, setL, onDemo, onSignUp, onSignIn, onAbout }: {
  l: Locale; t: T; setL: (l: Locale) => void;
  onDemo: () => void; onSignUp: () => void; onSignIn: () => void; onAbout: () => void;
}) {
  /* Which side the phone and the step row are showing. Both switch together,
     so the page tells one story at a time rather than two half-stories. */
  const [role, setRole] = useState<"tenant" | "staff" | "operator">("tenant");

  /* Smooth, and it respects a reduced-motion preference: somebody who asked
     for less movement should still get there, just without the travel. */
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  };

  /* The two sides do different work, so the toggle changes the steps as well
     as the phone. Showing a resident's four steps under a Caretaker tab would
     make the toggle decorative. */
  const STEPS: Record<"tenant" | "staff" | "operator", [StrKey, StrKey, StrKey][]> = {
    tenant: [
      ["lzS1", "lzS1P", "lzT1"], ["lzS2", "lzS2P", "lzT2"],
      ["lzS3", "lzS3P", "lzT3"], ["lzS4", "lzS4P", "lzT4"],
    ],
    staff: [
      ["lzC1", "lzC1P", "lzCT1"], ["lzC2", "lzC2P", "lzCT2"],
      ["lzC3", "lzC3P", "lzCT3"], ["lzC4", "lzC4P", "lzCT4"],
    ],
    /*
     * The operator's four are one-off setup rather than a repeating loop, which
     * is why the stamps read "one-off" and "ongoing" instead of tap counts:
     * nobody does this every week.
     */
    operator: [
      ["lzO1", "lzO1P", "lzOT1"], ["lzO2", "lzO2P", "lzOT2"],
      ["lzO3", "lzO3P", "lzOT3"], ["lzO4", "lzO4P", "lzOT4"],
    ],
  };
  const steps = STEPS[role];

  return (
    <div className="lz">
      <nav className="lz-nav">
        <div className="lz-navin">
          <span className="lz-brand"><Logo size={28} /> {t("appName")}</span>

          <span className="lz-navlinks">
            {/* All three scroll. "What is DormTag" used to navigate to the
                About page while its section was already on this page. */}
            {[["what", "aboutLink"], ["flow", "lzNavFlow"], ["operators", "lzNavFor"]]
              .map(([id, key]) => (
                <button className="lz-navlink" key={id} onClick={() => scrollTo(id)}>
                  {t(key as StrKey)}
                </button>
              ))}
          </span>

          <span className="lz-navright">
            {/* Both languages visible, so nobody has to press it to find out
                what it does. */}
            <span className="lz-lang">
              {(["de", "en"] as Locale[]).map((code) => (
                <button key={code} className={"lz-langbtn" + (l === code ? " on" : "")}
                  aria-pressed={l === code} onClick={() => setL(code)}>
                  {code.toUpperCase()}
                </button>
              ))}
            </span>
            <button className="lz-btn lz-btn-outline lz-btn-sm" onClick={onSignIn}>
              {t("landingSignIn")}
            </button>
            <button className="lz-btn lz-btn-primary lz-btn-sm" onClick={onDemo}>
              {t("lzDemoBtn")}
            </button>
          </span>
        </div>
      </nav>

      {/*
        Stacked, not side by side.
        
        The heading runs to two lines at full width instead of four in a column,
        and the devices get the whole width beneath — which a laptop needs and a
        phone doesn't mind.
      */}
      <section className="lz-hero lz-hero-stacked">
        <div className="lz-herocopy">
          <span className="lz-pill">{t("lzFor")}</span>
          <h1 className="lz-h1">{t("lzH1")}</h1>
          <p className="lz-lede">{t("lzLede")}</p>

          <div className="lz-ctas">
            <button className="lz-btn lz-btn-primary" onClick={onDemo}>
              {t("lzDemoBtn")} <ArrowRight size={17} aria-hidden />
            </button>
            {/* Scrolls rather than navigates: the form is on the page, and
                sending somebody away to find it loses the argument they were
                halfway through reading. */}
            <button className="lz-btn lz-btn-outline"
              onClick={() => scrollTo("operators")}>
              {t("lzRegister")}
            </button>
          </div>

          {/* Three numbers instead of a paragraph of claims: they're checkable. */}
          <div className="lz-stats">
            {[["lzStatA", "lzStatAL"], ["lzStatB", "lzStatBL"], ["lzStatC", "lzStatCL"]]
              .map(([n, lbl]) => (
                <div key={n}>
                  <p className="lz-statn">{t(n as StrKey)}</p>
                  <p className="lz-statl">{t(lbl as StrKey)}</p>
                </div>
              ))}
          </div>
        </div>

        {/* Ten slides, five per role, with the toggle, dots, arrows, swipe and
            the 6s auto-advance the export specified in numbers. */}
        <Gallery l={l} t={t} />
      </section>

      <div className="lz-band" id="what">
        <div className="lz-wrap lz-section">
          <p className="lz-eyebrow">{t("lzWhatEyebrow")}</p>
          <h2 className="lz-h2">{t("lzWhatH")}</h2>
          <p className="lz-lede">{t("lzWhatP")}</p>

          <div className="lz-cards">
            {[
              [QrCode, "lzWho1", "lzWho1P"],
              [ListChecks, "lzWho2", "lzWho2P"],
              [BarChart3, "lzWho3", "lzWho3P"],
            ].map(([Icon, title, body]: any) => (
              <div className="lz-card" key={title}>
                <span className="lz-cardicon"><Icon size={21} strokeWidth={1.8} aria-hidden /></span>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lz-wrap lz-section" id="flow">
        <div className="lz-stephead">
          <div>
            <p className="lz-eyebrow">{t("lzFlowEyebrow")}</p>
            <h2 className="lz-h2">{t("lzFlowH")}</h2>
          </div>
          {/* Three now, matching the gallery above. */}
          <div className="lz-roletabs">
            {([["tenant", "tenant"], ["staff", "staff"], ["operator", "operator"]] as const)
              .map(([id, label]) => (
                <button key={id} className={"lz-roletab" + (role === id ? " on" : "")}
                  aria-pressed={role === id} onClick={() => setRole(id)}>
                  {t(label)}
                </button>
              ))}
          </div>
        </div>

        <div className="lz-steps">
          {steps.map(([title, body, stamp], i) => (
            <div className={"lz-step" + (i === 0 ? " on" : "")} key={title}>
              <div className="lz-steprail">
                <span className="lz-stepn">{String(i + 1).padStart(2, "0")}</span>
                <span className="lz-stepline" />
              </div>
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
              <span className="lz-stamp">{t(stamp)}</span>
            </div>
          ))}
        </div>

        <PrintBlock l={l} t={t} onDemo={onDemo} />
      </div>

      {/*
        The one section addressed to a different reader, so it gets a different
        surface. The form is the real signup — organisation, name, email, then a
        setup link — rather than an enquiry: the account exists immediately and
        waits for approval, which is what the app actually does.
      */}
      <div className="lz-dark" id="operators">
        <div className="lz-opgrid">
          <div>
            <p className="lz-eyebrow">{t("lzNavFor")}</p>
            <h2 className="lz-h2">{t("lzOpH")}</h2>
            <p className="lz-lede">{t("lzOpP")}</p>
            <ul className="lz-ticks">
              {["lzOpT1", "lzOpT2", "lzOpT3"].map((k) => (
                <li className="lz-tick" key={k}>
                  <span className="lz-tickmark"><Check size={14} strokeWidth={3} aria-hidden /></span>
                  {t(k as StrKey)}
                </li>
              ))}
            </ul>
          </div>

          <SignupCard t={t} />
        </div>
      </div>

      <div className="lz-band">
        <footer className="lz-footer">
          <span>© DormTag</span>
          <span className="lz-footlinks">
            <button onClick={onAbout}>{t("aboutLink")}</button>
            <button onClick={onSignIn}>{t("landingSignIn")}</button>
            <button onClick={() => scrollTo("operators")}>{t("lzRegister")}</button>
          </span>
        </footer>
      </div>
    </div>
  );
}

/**
 * Sign in, over the page rather than instead of it.
 *
 * Two tabs because two kinds of credential exist: a resident has a code from
 * their door, staff have an email and a password. One form asking for "your
 * login" would suit neither.
 */
export function SignInModal({ t, onClose, onDone, onScan, onDemo, onForgot }: {
  t: T; onClose: () => void; onDone: () => Promise<void>;
  onScan: () => void; onDemo: () => void; onForgot: () => void;
}) {
  /*
   * Built from the design export, class for class.
   *
   * The two tabs exist because two kinds of credential do: a resident has a
   * code from their door, staff have an email and a password. One form asking
   * for "your login" would suit neither.
   */
  const [tab, setTab] = useState<"tenant" | "staff">("tenant");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = tab === "tenant" ? code.trim().length > 3 : !!email && !!password;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true); setErr("");
    try {
      if (tab === "tenant") await api.residentLogin(code.trim());
      else await api.staffLogin(email, password);
      await onDone();
    } catch (e: any) {
      // The export gives a written message per tab; the server's wording is
      // deliberately vague about which half was wrong.
      setErr(t(tab === "tenant" ? "siCodeBad" : "siStaffBad"));
    } finally { setBusy(false); }
  };

  const Tab = ({ id, label }: { id: "tenant" | "staff"; label: string }) => (
    <button type="button" className={"dt-tab" + (tab === id ? " dt-tab-on" : "")}
      role="tab" aria-selected={tab === id}
      onClick={() => { setTab(id); setErr(""); }}>
      {label}
    </button>
  );

  return (
    <>
      <button className="dt-scrim" aria-label={t("close")} onClick={onClose} />

      <div className="dt-modal" role="dialog" aria-modal="true"
        aria-label={t("signInTitle2")}>
        <div className="dt-modal-head">
          <div className="dt-modal-titles">
            <h2 className="dt-modal-title">{t("signInTitle2")}</h2>
            <p className="dt-modal-sub">
              {t(tab === "tenant" ? "siSubTenant" : "siSubStaff")}
            </p>
          </div>
          <button type="button" className="dt-close" onClick={onClose} aria-label={t("close")}>
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="dt-tabs" role="tablist">
          <Tab id="tenant" label={t("siTabTenant")} />
          <Tab id="staff" label={t("siTabStaff")} />
        </div>

        {tab === "tenant" ? (
          <div className="dt-panel">
            <label className="dt-field">
              <span className="dt-label">{t("siCodeLabel")}</span>
              {/* Mono, centred and spaced like the printed slip it's copied
                  from, so the two read as the same thing. */}
              <input className={"dt-code" + (err ? " dt-code-invalid" : "")}
                inputMode="text" maxLength={14} autoComplete="off"
                placeholder="B-312 XK4M" value={code}
                onChange={(e) => { setCode(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
            </label>

            <p className="dt-hint">
              {t("siCodeHint")} <span className="dt-hint-strong">{t("siCodeHintB")}</span>.
            </p>

            {err && (
              <p className="dt-error">
                <AlertTriangle className="dt-error-icon" size={17} aria-hidden />
                {err}
              </p>
            )}

            <button type="button" className="dt-btn dt-btn-primary dt-btn-block"
              disabled={!canSubmit || busy} onClick={submit}>
              {busy && <span className="dt-spinner" aria-hidden />}
              {t("siSeeReports")}
            </button>

            <div className="dt-rule">
              <span className="dt-rule-line" />
              <span className="dt-rule-word">{t("siOr")}</span>
              <span className="dt-rule-line" />
            </div>

            <button type="button" className="dt-btn dt-btn-ghost dt-btn-block" onClick={onScan}>
              <QrCode size={19} aria-hidden /> {t("siScan")}
            </button>

            <p className="dt-fine">{t("siScanFine")}</p>
          </div>
        ) : (
          <div className="dt-panel">
            <label className="dt-field">
              <span className="dt-label">{t("emailLabel")}</span>
              <span className={"dt-pill" + (err ? " dt-pill-invalid" : "")}>
                <Mail className="dt-pill-icon" size={18} aria-hidden />
                <input className="dt-input" type="email" autoComplete="username"
                  placeholder="name@werk.de" value={email}
                  onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
              </span>
            </label>

            <label className="dt-field">
              <span className="dt-label">{t("passwordLabel")}</span>
              <span className={"dt-pill" + (err ? " dt-pill-invalid" : "")}>
                <Lock className="dt-pill-icon" size={18} aria-hidden />
                <input className="dt-input" type="password" autoComplete="current-password"
                  placeholder="••••••••" value={password}
                  onChange={(e) => { setPassword(e.target.value); setErr(""); }}
                  onKeyDown={(e) => e.key === "Enter" && submit()} />
              </span>
            </label>

            {err && (
              <p className="dt-error">
                <AlertTriangle className="dt-error-icon" size={17} aria-hidden />
                {err}
              </p>
            )}

            <button type="button" className="dt-btn dt-btn-primary dt-btn-block"
              disabled={!canSubmit || busy} onClick={submit}>
              {busy && <span className="dt-spinner" aria-hidden />}
              {t("signInTitle2")}
            </button>

            <div className="dt-row">
              <button type="button" className="dt-link" onClick={onForgot}>
                {t("siForgot")}
              </button>
              <button type="button" className="dt-link-quiet" onClick={() => setTab("tenant")}>
                {t("siImResident")}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The demo picker.
 *
 * A row per role, each saying what you would be doing rather than only who you
 * would be — "queue, offer times, close jobs" tells somebody whether it's worth
 * a look in a way that "as a caretaker" doesn't.
 */
export function DemoModal({ t, onClose, onDone, onSignIn }: {
  t: T; onClose: () => void; onDone: () => Promise<void>; onSignIn: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  // Escape closes it. A mouse user never notices this is missing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = async (as: "tenant" | "staff" | "operator") => {
    setBusy(as); setErr("");
    try {
      if (as === "tenant") await api.residentLogin("B312-Z2-DEMO");
      else if (as === "staff") await api.staffLogin("hausmeister@wohnheim.test", "hausmeister-demo-2026");
      else await api.staffLogin("verwaltung@wohnheim.test", "verwaltung-demo-2026");
      await onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const Row = ({ as, Icon, name, what }: any) => (
    <button type="button" className="lz-rolerow" disabled={!!busy} onClick={() => go(as)}>
      <span className="lz-roleicon"><Icon size={19} strokeWidth={1.8} aria-hidden /></span>
      <span className="lz-roletext">
        <span className="lz-rolename">{name}</span>
        <span className="lz-rolewhat">{what}</span>
      </span>
      {busy === as ? <span className="dt-spinner" aria-hidden /> : <ArrowRight size={17} aria-hidden />}
    </button>
  );

  return (
    /* Same shell as sign-in, from the same export: one modal object rather
       than two that drift apart. */
    <>
      <button className="dt-scrim" aria-label={t("close")} onClick={onClose} />
      <div className="dt-modal" role="dialog" aria-modal="true" aria-label={t("lzDemoBtn")}>
        <div className="dt-modal-head">
          <div className="dt-modal-titles">
            <h2 className="dt-modal-title">{t("lzDemoBtn")}</h2>
            <p className="dt-modal-sub">{t("lzDemoSub")}</p>
          </div>
          <button type="button" className="dt-close" onClick={onClose} aria-label={t("close")}>
            <X size={18} aria-hidden />
          </button>
        </div>

        {err && (
          <p className="dt-error">
            <AlertTriangle className="dt-error-icon" size={17} aria-hidden />
            {err}
          </p>
        )}

        {/* Wrapped, because .dt-modal is a flex column: as direct children the
            three rows became flex items sharing a line. */}
        <div className="dt-panel">
          <Row as="tenant" Icon={QrCode} name={t("lzAsResident")} what={t("lzAsResidentP")} />
          <Row as="staff" Icon={ListChecks} name={t("lzAsStaff")} what={t("lzAsStaffP")} />
          {/* The operator demo works, so it isn't marked "soon". */}
          <Row as="operator" Icon={BarChart3} name={t("lzAsOperator")} what={t("lzAsOperatorP")} />
        </div>

        <div className="dt-row">
          <span className="dt-fine">{t("lzDemoNote")}</span>
          <button type="button" className="dt-link" onClick={onSignIn}>
            {t("signInTitle2")}
          </button>
        </div>
      </div>
    </>
  );
}

/** The real signup, in the design's card. */
function SignupCard({ t }: { t: T }) {
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string | null>(null);

  if (done !== null) {
    return (
      <div className="lz-form">
        <h3 className="lz-formh">{t("signupSent")}</h3>
        <p className="lz-formp">{t("signupHint")}</p>
        {/* Demo mode returns the link so the flow can be walked without a mail
            sender. Never returned in production. */}
        {done && <p className="lz-formnote" style={{ wordBreak: "break-all" }}>
          {location.origin}/setup/{done}
        </p>}
      </div>
    );
  }

  const ok = org.trim() && name.trim() && email.includes("@");

  return (
    <div className="lz-form">
      <h3 className="lz-formh">{t("lzFormH")}</h3>
      <p className="lz-formp">{t("lzFormP")}</p>
      {err && <p className="lz-formnote" style={{ color: "#b4442f" }}>{err}</p>}

      <div>
        <label className="lz-label" htmlFor="lz-org">{t("lzOrgLabel")}</label>
        <input id="lz-org" className="lz-input" value={org} placeholder={t("lzOrgPh")}
          onChange={(e) => setOrg(e.target.value)} />
      </div>
      <div>
        <label className="lz-label" htmlFor="lz-name">{t("lzNameLabel")}</label>
        <input id="lz-name" className="lz-input" value={name}
          onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="lz-label" htmlFor="lz-email">{t("emailLabel")}</label>
        <input id="lz-email" className="lz-input" type="email" value={email}
          placeholder={t("lzEmailPh")} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <button className="lz-btn lz-btn-primary lz-btn-block" disabled={!ok || busy}
        style={!ok ? { background: "#e4e8ed", color: "#a6afb8" } : undefined}
        onClick={async () => {
          setBusy(true); setErr("");
          try {
            const r = await api.signupOrg(org, name, email);
            setDone(r.setupToken ?? "");
          } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }}>
        {t("lzSendReq")}
      </button>
      <p className="lz-formnote">{t("lzFormNote")}</p>
    </div>
  );
}

/**
 * A real QR code, not a drawing of one.
 *
 * The app already depends on `qrcode` for the sticker sheet that actually gets
 * printed, so using it here costs nothing and the codes on the landing page
 * resolve to real URLs. My first version was a hand-drawn matrix, which is why
 * it didn't look right: no finder patterns in the corners, no quiet zone, wrong
 * proportions.
 */
function QrMark({ payload, className }: { payload: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, payload, {
      margin: 1,                 // the quiet zone a scanner needs
      width: 160,                // 2× what it's shown at: crisp without being heavy
      color: { dark: "#16191b", light: "#ffffff" },
    }).catch(() => {});
  }, [payload]);

  return <canvas ref={ref} className={className}
    style={{ width: "100%", aspectRatio: "1", display: "block", borderRadius: 4 }}
    aria-label="QR" />;
}


/** One tap per role, so nobody has to copy a password out of the page. */
export function DemoPicker({ t, onBack, onDone }: {
  t: T; onBack: () => void; onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const go = async (as: "resident" | "staff" | "operator") => {
    setBusy(as); setErr("");
    try {
      if (as === "resident") await api.residentLogin("B312-Z2-DEMO");
      else if (as === "staff") await api.staffLogin("hausmeister@wohnheim.test", "hausmeister-demo-2026");
      else await api.staffLogin("verwaltung@wohnheim.test", "verwaltung-demo-2026");
      await onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const Row = ({ as, Icon, label }: any) => (
    <button className="rz-btn rz-btn-ghost" disabled={!!busy} onClick={() => go(as)}>
      <Icon size={17} strokeWidth={1.75} aria-hidden /> {label} <ArrowRight size={15} />
    </button>
  );

  return (
    <div className="rz"><div className="col rz-body signin">
      <button className="rz-btn rz-btn-back" onClick={onBack}><ChevronLeft size={16} /> {t("back")}</button>
      <h2 className="rz-display">{t("demoPick")}</h2>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      <Row as="resident" Icon={User} label={t("tenant")} />
      <Row as="staff" Icon={Wrench} label={t("staff")} />
      <Row as="operator" Icon={LayoutDashboard} label={t("operator")} />
      <p className="rz-small">{t("demoNote")}</p>
    </div>
    </div>
  );
}

/* Reached only by a direct link now; the landing page's own button scrolls to
   the form in the operator band instead. */
export function SignUpOrg({ t, onBack }: { t: T; onBack: () => void }) {
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  if (sent !== null) {
    return (
      <div className="rz"><div className="col rz-body signin">
        <h2 className="rz-display">{t("signupSent")}</h2>
        <p className="rz-small">{t("signupHint")}</p>
        {/* Demo mode returns the link so the flow can be walked through without
            a mail sender. Never returned in production. */}
        {sent && (
          <div className="rz-card" style={{ cursor: "default" }}>
            <p className="rz-mono" style={{ wordBreak: "break-all" }}>{location.origin}/setup/{sent}</p>
          </div>
        )}
        <button className="rz-btn rz-btn-ghost" onClick={onBack}>{t("backToSignIn")}</button>
      </div>
      </div>
    );
  }

  return (
    <div className="rz"><div className="col rz-body signin">
      <button className="rz-btn rz-btn-back" onClick={onBack}><ChevronLeft size={16} /> {t("back")}</button>
      <h2 className="rz-display">{t("signupTitle")}</h2>
      <p className="rz-small">{t("signupHint")}</p>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}

      <label className="rz-field"><span>{t("signupOrgName")}</span>
        <input  value={orgName} placeholder="Studierendenwerk Magdeburg"
          onChange={(e) => setOrgName(e.target.value)} /></label>
      <label className="rz-field"><span>{t("nameLabel")}</span>
        <input  value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="rz-field"><span>{t("emailLabel")}</span>
        <input  type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} /></label>

      <button className="rz-btn rz-btn-primary"
        disabled={busy || !orgName.trim() || !name.trim() || !email.includes("@")}
        onClick={async () => {
          setBusy(true); setErr("");
          try {
            const r = await api.signupOrg(orgName, name, email);
            setSent(r.setupToken ?? "");
          } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }}>
        {t("signupBtn")} <ArrowRight size={16} />
      </button>
    </div>
    </div>
  );
}

/** Signed in, but the organisation isn't usable yet. */
export function OrgWaiting({ t, status, onSignOut }: {
  t: T; status: string; onSignOut: () => void;
}) {
  const suspended = status === "suspended" || status === "rejected";
  return (
    <div className="rz"><div className="col rz-body signin">
      <Logo size={44} />
      <h2 className="rz-display">{suspended ? t("suspendedTitle") : t("pendingTitle")}</h2>
      <p className="rz-small">{suspended ? t("suspendedBody") : t("pendingBody")}</p>
      <button className="rz-btn rz-btn-ghost" onClick={onSignOut}>{t("logout")}</button>
    </div>
    </div>
  );
}
