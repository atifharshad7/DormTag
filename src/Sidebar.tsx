import React, { useState } from "react";
import { LayoutGrid, Building2, Users, QrCode, KeyRound, ShieldCheck, User,
  MoreHorizontal, X } from "lucide-react";
import { type StrKey } from "./lib";

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
export function Sidebar({ t, section, onGo, isPlatformAdmin, orgName, personName }: {
  t: T; section: OpSection; onGo: (s: OpSection) => void;
  isPlatformAdmin?: boolean; orgName?: string; personName?: string;
}) {
  const Item = ({ id, Icon, label }: { id: OpSection; Icon: any; label: string }) => (
    <button className={"sbnav" + (section === id ? " sbnav-on" : "")}
      aria-current={section === id ? "page" : undefined}
      onClick={() => { setMore(false); onGo(id); }}>
      <Icon size={15} strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
    </button>
  );

  const [more, setMore] = useState(false);

  /*
   * Two shapes, one component.
   *
   * On a phone the panel is a bottom tab bar: four destinations in thumb reach
   * and the rest behind More. A horizontal scrolling strip hid items with no
   * indication there were any, which was the worst property of the first
   * attempt.
   */
  const Tab = ({ id, Icon, label }: { id: OpSection; Icon: any; label: string }) => (
    <button className={"tabbtn" + (section === id ? " tabbtn-on" : "")}
      aria-current={section === id ? "page" : undefined}
      onClick={() => { setMore(false); onGo(id); }}>
      <Icon size={19} strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
    </button>
  );

  return (
    <>
    <nav className="tabbar" aria-label={t("dashboardWord")}>
      <Tab id="dashboard" Icon={LayoutGrid} label={t("dashboardWord")} />
      <Tab id="buildings" Icon={Building2} label={t("buildings")} />
      <Tab id="staff" Icon={Users} label={t("staffWord")} />
      <button className={"tabbtn" + (more ? " tabbtn-on" : "")}
        aria-expanded={more} onClick={() => setMore((v) => !v)}>
        {more ? <X size={19} aria-hidden /> : <MoreHorizontal size={19} aria-hidden />}
        <span>{t("moreWord")}</span>
      </button>
    </nav>

    {more && (
      <div className="tabsheet" role="dialog" aria-label={t("moreWord")}>
        {orgName && (
          <div className="sborg">
            <p className="mono sborgrole">{t("operator")}</p>
            <p className="sborgname">{orgName}</p>
            {personName && <p className="sborgperson">{personName}</p>}
          </div>
        )}
        <Item id="stickers" Icon={QrCode} label={t("stickers")} />
        <Item id="codes" Icon={KeyRound} label={t("accessCodes")} />
        {isPlatformAdmin && <Item id="orgs" Icon={ShieldCheck} label={t("orgsWord")} />}
        <Item id="account" Icon={User} label={t("account")} />
      </div>
    )}

    <nav className="sidebar" aria-label={t("dashboardWord")}>
      {/* No logo or name here: the header two centimetres above already says
          DormTag, and repeating it cost a whole block of vertical space. */}
      {/* The organisation and the person, because the header no longer carries
          either: it showed the same name twice over. Knowing which account
          you're in matters when you hold more than one. */}
      {orgName && (
        <div className="sborg">
          <p className="mono sborgrole">{t("operator")}</p>
          <p className="sborgname">{orgName}</p>
          {personName && <p className="sborgperson">{personName}</p>}
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
    </>
  );
}
