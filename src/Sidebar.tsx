import React from "react";
import { LayoutGrid, Building2, Users, QrCode, KeyRound, ShieldCheck, User } from "lucide-react";
import { type StrKey } from "./lib";
import { Logo } from "./Logo";

type T = (k: StrKey) => string;

export type OpSection =
  | "dashboard" | "buildings" | "staff" | "stickers" | "codes" | "orgs" | "account";

/**
 * The operator's left panel.
 *
 * Only for operators: the resident and caretaker views are phone-first and keep
 * the header. Building it as a panel is what let the building cards shed four
 * buttons each — the actions became destinations, so the card is a summary again.
 *
 * On a narrow screen it lays out as a horizontal strip rather than disappearing,
 * because an operator checking something on a phone still needs to get around.
 */
export function Sidebar({ t, section, onGo, isPlatformAdmin, orgName }: {
  t: T; section: OpSection; onGo: (s: OpSection) => void;
  isPlatformAdmin?: boolean; orgName?: string;
}) {
  const Item = ({ id, Icon, label }: { id: OpSection; Icon: any; label: string }) => (
    <button className={"sbnav" + (section === id ? " sbnav-on" : "")}
      aria-current={section === id ? "page" : undefined}
      onClick={() => onGo(id)}>
      <Icon size={15} strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
    </button>
  );

  return (
    <nav className="sidebar" aria-label={t("dashboardWord")}>
      <div className="sbbrand">
        <Logo size={20} />
        <span>{t("appName")}</span>
      </div>

      {orgName && (
        <div className="sborg">
          <p className="mono sborgrole">{t("operator")}</p>
          <p className="sborgname">{orgName}</p>
        </div>
      )}

      <Item id="dashboard" Icon={LayoutGrid} label={t("dashboardWord")} />
      <Item id="buildings" Icon={Building2} label={t("buildings")} />
      <Item id="staff" Icon={Users} label={t("staffWord")} />
      <Item id="stickers" Icon={QrCode} label={t("stickers")} />
      <Item id="codes" Icon={KeyRound} label={t("accessCodes")} />

      {isPlatformAdmin && (
        <div className="sbsplit">
          <Item id="orgs" Icon={ShieldCheck} label={t("orgsWord")} />
        </div>
      )}

      <div className="sbfoot">
        <Item id="account" Icon={User} label={t("account")} />
      </div>
    </nav>
  );
}
