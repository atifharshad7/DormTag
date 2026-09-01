import React, { useState } from "react";
import { LayoutGrid, Building2, Users, QrCode, KeyRound, ShieldCheck, User,
  MoreHorizontal, X } from "lucide-react";
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
 * Three layouts, because a phone and a laptop want different things:
 *
 *   above 1024px   the full 240px panel
 *   640–1024px     a 64px icon rail — the export's answer, and right for a
 *                  landscape tablet, which has the horizontal room
 *   below 640px    a bottom bar, because a rail on a phone costs width there
 *                  isn't any of and leaves six unlabelled icons
 *
 * The bar carries three destinations plus More; six across a phone would be
 * unreadable, and the three are what an operator opens daily.
 */
export function Sidebar({ t, section, onGo, isPlatformAdmin, orgName, personName }: {
  t: T; section: OpSection; onGo: (s: OpSection) => void;
  isPlatformAdmin?: boolean; orgName?: string; personName?: string;
}) {
  /* Only the phone's More sheet uses this. */
  const [more, setMore] = useState(false);
  const Item = ({ id, Icon, label, badge }: {
    id: OpSection; Icon: any; label: string; badge?: number;
  }) => (
    <button className={"opp-item" + (section === id ? " opp-item-active" : "")}
      aria-current={section === id ? "page" : undefined}
      onClick={() => { setMore(false); onGo(id); }}
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

  /* Only the bar needs this; the panel and the rail show everything. */

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

      {/*
        Below 640px, a bottom bar instead of the rail.

        A 64px icon rail is the export's answer and it suits a landscape tablet,
        but on a phone it spends horizontal space there isn't any of and drops
        the labels — six unlabelled icons is not navigation. The bar is where a
        thumb already is.

        Four items: Dashboard, Buildings, Staff, More. Five gets cramped at
        360px, and "Zugangscodes" is long.
      */}
      <nav className="opp-bar" aria-label={t("operator")}>
        <BarItem id="dashboard" Icon={LayoutGrid} label={t("opNavDash")} />
        <BarItem id="buildings" Icon={Building2} label={t("buildings")} />
        <BarItem id="staff" Icon={Users} label={t("staff")} />
        <button className={"opp-baritem" + (more ? " opp-baritem-on" : "")}
          aria-expanded={more} onClick={() => setMore((v) => !v)}>
          {more ? <X size={20} strokeWidth={1.9} aria-hidden />
                : <MoreHorizontal size={20} strokeWidth={1.9} aria-hidden />}
          <span className="opp-barlabel">{t("moreWord")}</span>
        </button>
      </nav>

      {more && (
        <>
          <button className="opp-sheetscrim" aria-label={t("close")}
            onClick={() => setMore(false)} />
          <div className="opp-sheet" role="dialog" aria-modal="true">
            <SheetItem id="stickers" Icon={QrCode} label={t("stickers")} />
            <SheetItem id="codes" Icon={KeyRound} label={t("accessCodes")} />
            {isPlatformAdmin && <SheetItem id="orgs" Icon={ShieldCheck} label={t("orgsWord")} />}
            <SheetItem id="account" Icon={User} label={t("account")} />
          </div>
        </>
      )}
    </>
  );

  /* Icon above label. No badge: there is no room for one at this size. */
  function BarItem({ id, Icon, label }: { id: OpSection; Icon: any; label: string }) {
    return (
      <button className={"opp-baritem" + (section === id ? " opp-baritem-on" : "")}
        aria-current={section === id ? "page" : undefined}
        onClick={() => { setMore(false); onGo(id); }}>
        <Icon size={20} strokeWidth={1.9} aria-hidden />
        <span className="opp-barlabel">{label}</span>
      </button>
    );
  }

  function SheetItem({ id, Icon, label }: { id: OpSection; Icon: any; label: string }) {
    return (
      <button className={"opp-sheetitem" + (section === id ? " opp-sheetitem-on" : "")}
        onClick={() => { setMore(false); onGo(id); }}>
        <Icon size={19} strokeWidth={1.8} aria-hidden />
        <span>{label}</span>
      </button>
    );
  }
}
