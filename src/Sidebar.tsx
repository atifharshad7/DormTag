import React from "react";
import { LayoutGrid, Building2, Users, QrCode, KeyRound, ShieldCheck, User,
} from "lucide-react";
import { type StrKey } from "./lib";

type T = (k: StrKey) => string;

export type OpSection =
  | "dashboard" | "buildings" | "staff" | "stickers" | "codes" | "orgs" | "account";

/**
 * The operator's left panel, built from the design export.
 *
 * 240px fixed — never fluid, never a percentage — sticky under the app bar, and
 * scrolling independently so a long list can't push Konto out of reach.
 *
 * The organisation name wraps to two or three lines rather than truncating. The
 * export is explicit about why: an operator may run several Studierendenwerke
 * and needs to see the city, so an ellipsis would remove the one word that
 * distinguishes them.
 *
 * Below 1024px it collapses to a 64px icon rail rather than disappearing —
 * the export's own answer, and better than the bottom strip I had: the panel
 * stays where it is and only sheds its words, so nothing moves.
 */
export function Sidebar({ t, section, onGo, isPlatformAdmin, orgName, personName }: {
  t: T; section: OpSection; onGo: (s: OpSection) => void;
  isPlatformAdmin?: boolean; orgName?: string; personName?: string;
}) {
  const Item = ({ id, Icon, label, badge }: {
    id: OpSection; Icon: any; label: string; badge?: number;
  }) => (
    <button className={"opp-item" + (section === id ? " opp-item-active" : "")}
      aria-current={section === id ? "page" : undefined}
      onClick={() => onGo(id)}
      /* Below 1024px the panel is icons only, so the label becomes the tooltip
         and the accessible name. */
      title={label} aria-label={label}>
      <Icon className="opp-icon" size={19} strokeWidth={1.75} aria-hidden />
      <span className="opp-label">{label}</span>
      {badge !== undefined && badge > 0 && <span className="opp-badge">{badge}</span>}
    </button>
  );

  /* Organisations is platform-admin only, so it isn't in the design's list. */
  const main = (
    <>
      <Item id="dashboard" Icon={LayoutGrid} label={t("opNavDash")} />
      <Item id="buildings" Icon={Building2} label={t("buildings")} />
      <Item id="staff" Icon={Users} label={t("staff")} />
      <Item id="stickers" Icon={QrCode} label={t("stickers")} />
      <Item id="codes" Icon={KeyRound} label={t("accessCodes")} />
      {isPlatformAdmin && <Item id="orgs" Icon={ShieldCheck} label={t("orgsWord")} />}
    </>
  );

  return (
    <>
      <nav className="opp-root" aria-label={t("operator")}>
        <div className="opp-org">
          <span className="opp-org-eyebrow">{t("opPanelOperator")}</span>
          {/* Wraps rather than truncates: the city is what tells two
              Studierendenwerke apart. */}
          <span className="opp-org-name">{orgName ?? t("appName")}</span>
          {personName && <span className="opp-org-sub">{personName}</span>}
        </div>

        <ul className="opp-list">{main}</ul>

        <div className="opp-foot">
          <Item id="account" Icon={User} label={t("account")} />
        </div>
      </nav>

    </>
  );
}
