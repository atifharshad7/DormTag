import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Check, Ban, X, Building2, Users } from "lucide-react";
import { api, fmtDay, type Locale, type StrKey } from "./lib";

type T = (k: StrKey) => string;

const STATUS_KEY: Record<string, StrKey> = {
  pending: "orgPending", active: "orgActive", suspended: "orgSuspended",
  rejected: "orgRejected", demo: "orgDemo",
};

const TONE: Record<string, string> = {
  pending: "warn", active: "ok", suspended: "bad", rejected: "neutral", demo: "info",
};

/**
 * The platform console: which organisations exist and whether they're switched on.
 *
 * Counts only, never contents. Approving an organisation and reading a few
 * hundred students' repair histories are different powers, and the API refuses
 * the second to this role.
 */
export function Platform({ l, t, onBack }: { l: Locale; t: T; onBack: () => void }) {
  const [orgs, setOrgs] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api.platformOrgs().then((d) => setOrgs(d.orgs)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, status: string) => {
    setBusy(id); setErr("");
    try { await api.setOrgStatus(id, status); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  return (
    <div className="col">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("backToApp")}</button>
      <h2>{t("orgsWord")}</h2>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      {!orgs && !err && <p className="muted">…</p>}

      {orgs?.map((o) => (
        <div className="card" key={o.id}>
          <div className="rowspread">
            <p className="cardtitle">{o.name}</p>
            <span className={"pill pill-" + (TONE[o.status] || "neutral")}>
              {t(STATUS_KEY[o.status] ?? "orgPending")}
            </span>
          </div>

          <p className="muted mono">
            {o.signup_email || "—"}
            {o.signup_domain ? ` · ${o.signup_domain}` : ""}
          </p>
          <p className="muted mono">
            <Building2 size={12} aria-hidden /> {o.buildings} {t("buildingsWord")}
            {" · "}
            <Users size={12} aria-hidden /> {o.staff} {t("peopleWord")}
            {" · "}
            {t("signedUpOn")} {fmtDay(o.created_at, l)}
          </p>
          {o.note && <p className="quote">{o.note}</p>}

          {o.status !== "demo" && (
            <div className="row">
              {o.status !== "active" && (
                <button className="btn btn-primary" disabled={busy === o.id}
                  onClick={() => act(o.id, "active")}>
                  <Check size={15} /> {t("approveWord")}
                </button>
              )}
              {o.status === "active" && (
                <button className="btn btn-warn" disabled={busy === o.id}
                  onClick={() => act(o.id, "suspended")}>
                  <Ban size={15} /> {t("suspendWord")}
                </button>
              )}
              {o.status === "pending" && (
                <button className="btn" disabled={busy === o.id}
                  onClick={() => act(o.id, "rejected")}>
                  <X size={15} /> {t("rejectWord")}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
