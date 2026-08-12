import React from "react";
import { ChevronLeft, Languages, LogOut, Settings, HelpCircle, User, Wrench, LayoutDashboard } from "lucide-react";
import { type Locale, type StrKey } from "./lib";

type T = (k: StrKey) => string;

/**
 * Account page. Holds everything that used to crowd the header: language,
 * sign out, Manage, About.
 *
 * The language toggle stays in the header while signed out, because someone who
 * can't read German needs it before they can read anything else. Once they're in,
 * the choice is made and it belongs here.
 */
export function Account({ l, t, session, onBack, onLanguage, onManage, onAbout, onSignOut }: {
  l: Locale; t: T; session: any;
  onBack: () => void;
  onLanguage: () => void;
  onManage: () => void;
  onAbout: () => void;
  onSignOut: () => void;
}) {
  const kind = session.principal.kind;
  const home = session.home;
  const RoleIcon = kind === "operator" ? LayoutDashboard : kind === "staff" ? Wrench : User;
  const roleName = kind === "operator" ? t("operator") : kind === "staff" ? t("staff") : t("tenant");

  return (
    <div className="col">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("backToApp")}</button>

      <div className="card">
        <p className="cardtitle"><RoleIcon size={15} strokeWidth={1.75} aria-hidden /> {roleName}</p>
        {kind === "tenant" && home && (
          <>
            <span className="plate">{home.building_code}-{home.unit_code} · {home.room_code}</span>
            <p className="muted">{t("yourFlat")}</p>
          </>
        )}
        {kind === "staff" && (
          <>
            <p className="cardtitle">{session.principal.name}</p>
            <p className="muted">
              {(session.buildings || [])
                .filter((b: any) => (session.principal.buildingIds || []).includes(b.id))
                .map((b: any) => b.name).join(", ") || t("noBuildingsAssigned")}
            </p>
          </>
        )}
        {kind === "operator" && <p className="cardtitle">{session.principal.name}</p>}
      </div>

      <button className="accountrow" onClick={onLanguage}>
        <Languages size={16} strokeWidth={1.75} aria-hidden />
        <span>{t("language")}</span>
        <span className="mono">{l.toUpperCase()}</span>
      </button>

      {kind === "operator" && (
        <button className="accountrow" onClick={onManage}>
          <Settings size={16} strokeWidth={1.75} aria-hidden />
          <span>{t("manageWord")}</span>
          <span className="mono">→</span>
        </button>
      )}

      <button className="accountrow" onClick={onAbout}>
        <HelpCircle size={16} strokeWidth={1.75} aria-hidden />
        <span>{t("aboutLink")}</span>
        <span className="mono">→</span>
      </button>

      <button className="accountrow accountout" onClick={onSignOut}>
        <LogOut size={16} strokeWidth={1.75} aria-hidden />
        <span>{t("logout")}</span>
      </button>
    </div>
  );
}
