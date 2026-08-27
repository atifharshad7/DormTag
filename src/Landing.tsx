import React, { useState } from "react";
import { ChevronLeft, ArrowRight, Play, Building2, LogIn, User, Wrench, LayoutDashboard } from "lucide-react";
import { api, type Locale, type StrKey } from "./lib";
import { Logo } from "./Logo";

type T = (k: StrKey) => string;

/**
 * The front door.
 *
 * The demo comes first on purpose: someone arriving cold will click that before
 * they'd fill in a signup form, and it's the thing most likely to convince them.
 */
export function Landing({ l, t, onDemo, onSignUp, onSignIn, onAbout }: {
  l: Locale; t: T;
  onDemo: () => void; onSignUp: () => void; onSignIn: () => void; onAbout: () => void;
}) {
  return (
    <div className="col landing">
      <div className="landingmark"><Logo size={58} label="DormTag" /></div>
      <h2 className="landingtitle">{t("appName")}</h2>
      <p className="landingtag">{t("aboutTag1")} {t("aboutTag2")}</p>

      <button className="btn btn-primary btn-big" onClick={onDemo}>
        <Play size={17} aria-hidden /> {t("landingTry")}
      </button>
      <button className="btn btn-big" onClick={onSignUp}>
        <Building2 size={17} aria-hidden /> {t("landingRegister")}
      </button>
      <button className="btn btn-big" onClick={onSignIn}>
        <LogIn size={17} aria-hidden /> {t("landingSignIn")}
      </button>

      <div className="landingfoot">
        <button className="aboutlink" onClick={onAbout}>{t("aboutLink")}</button>
        <a className="aboutlink" href="mailto:hallo@dormtag.com">{t("landingAsk")}</a>
      </div>
    </div>
  );
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
    <button className="btn btn-big" disabled={!!busy} onClick={() => go(as)}>
      <Icon size={17} strokeWidth={1.75} aria-hidden /> {label} <ArrowRight size={15} />
    </button>
  );

  return (
    <div className="col signin">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("back")}</button>
      <h2>{t("demoPick")}</h2>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      <Row as="resident" Icon={User} label={t("tenant")} />
      <Row as="staff" Icon={Wrench} label={t("staff")} />
      <Row as="operator" Icon={LayoutDashboard} label={t("operator")} />
      <p className="muted">{t("demoNote")}</p>
    </div>
  );
}

export function SignUpOrg({ t, onBack }: { t: T; onBack: () => void }) {
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  if (sent !== null) {
    return (
      <div className="col signin">
        <h2>{t("signupSent")}</h2>
        <p className="muted">{t("signupHint")}</p>
        {/* Demo mode returns the link so the flow can be walked through without
            a mail sender. Never returned in production. */}
        {sent && (
          <div className="card demo">
            <p className="cardtitle mono breakall">{location.origin}/setup/{sent}</p>
          </div>
        )}
        <button className="btn" onClick={onBack}>{t("backToSignIn")}</button>
      </div>
    );
  }

  return (
    <div className="col signin">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("back")}</button>
      <h2>{t("signupTitle")}</h2>
      <p className="muted">{t("signupHint")}</p>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}

      <label className="field"><span>{t("signupOrgName")}</span>
        <input className="in" value={orgName} placeholder="Studierendenwerk Magdeburg"
          onChange={(e) => setOrgName(e.target.value)} /></label>
      <label className="field"><span>{t("nameLabel")}</span>
        <input className="in" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>{t("emailLabel")}</span>
        <input className="in" type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} /></label>

      <button className="btn btn-primary btn-big"
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
  );
}

/** Signed in, but the organisation isn't usable yet. */
export function OrgWaiting({ t, status, onSignOut }: {
  t: T; status: string; onSignOut: () => void;
}) {
  const suspended = status === "suspended" || status === "rejected";
  return (
    <div className="col signin">
      <div className="landingmark"><Logo size={48} /></div>
      <h2>{suspended ? t("suspendedTitle") : t("pendingTitle")}</h2>
      <p className="muted">{suspended ? t("suspendedBody") : t("pendingBody")}</p>
      <button className="btn" onClick={onSignOut}>{t("logout")}</button>
    </div>
  );
}
