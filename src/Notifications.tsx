import React, { useCallback, useEffect, useState } from "react";
import { Bell, X, CheckCheck } from "lucide-react";
import {
  api, roomLabel, objLabel, tradeLabel, causeLabel, fmtDT,
  type Locale, type StrKey,
} from "./lib";

type T = (k: StrKey) => string;

/** One line per notification kind. The payload fills in the specifics. */
function describe(n: any, l: Locale, t: T): string {
  const pl = (() => { try { return JSON.parse(n.payload || "{}"); } catch { return {}; } })();
  switch (n.kind) {
    case "reported":        return t("nReported");
    case "slots_offered":   return t("nSlotsOffered");
    case "booked":          return t("nBooked");
    case "rebooked":        return t("nRebooked");
    case "tenant_rescheduled": return t("nTenantRescheduled");
    case "staff_cancelled": return t("nStaffCancelled");
    case "part_ordered":    return pl.part ? `${t("nPartOrdered")}: ${pl.part}` : t("nPartOrdered");
    case "part_arrived":    return t("nPartArrived");
    case "fixed":           return pl.cause ? `${t("nFixed")} · ${causeLabel(pl.cause, l)}` : t("nFixed");
    case "escalated":       return pl.trade ? `${t("nEscalated")}: ${tradeLabel(pl.trade, l)}` : t("nEscalated");
    case "reminder":        return `${t("nReminder")} ${pl.startsAt ? fmtDT(pl.startsAt, l) : ""}`.trim();
    default:                return n.kind;
  }
}

function place(n: any, l: Locale) {
  if (!n.building_code) return "";
  const room = n.room_label || roomLabel(n.room_type, l);
  return `${n.building_code}-${n.unit_code} · ${room}`;
}

export function useNotifications(signedIn: boolean) {
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!signedIn) { setItems([]); setUnread(0); return; }
    try {
      const d = await api.notifications();
      setItems(d.notifications); setUnread(d.unread);
    } catch { /* the bell is never worth an error banner */ }
  }, [signedIn]);

  useEffect(() => { load(); }, [load]);
  return { items, unread, reload: load };
}

export function NotificationPanel({ l, t, items, onClose, onOpenTicket, onReadAll }: {
  l: Locale; t: T; items: any[];
  onClose: () => void;
  onOpenTicket: (id: string) => void;
  onReadAll: () => void;
}) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t("notifications")}>
      <div className="sheetcard">
        <div className="rowspread">
          <p className="cardtitle"><Bell size={15} aria-hidden /> {t("notifications")}</p>
          <div className="row">
            {items.some((x) => !x.is_read) && (
              <button className="iconbtn" onClick={onReadAll} aria-label={t("markAllRead")}>
                <CheckCheck size={17} />
              </button>
            )}
            <button className="iconbtn" onClick={onClose} aria-label={t("close")}><X size={18} /></button>
          </div>
        </div>

        {items.length === 0 && (
          <div className="empty"><p className="muted">{t("noNotifications")}</p></div>
        )}

        {items.map((n) => (
          <button key={n.id} className={"notifrow" + (n.is_read ? " notifread" : "")}
            onClick={() => n.ticket_id && onOpenTicket(n.id)}>
            {!n.is_read && <span className="notifdot" aria-hidden />}
            <div className="notifbody">
              <p className="notiftext">{describe(n, l, t)}</p>
              <p className="muted mono">
                {place(n, l)}{n.object_type ? ` · ${objLabel(n.object_type, l)}` : ""}
              </p>
              <p className="muted mono notifwhen">{fmtDT(n.created_at, l)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BellButton({ t, unread, onClick }: { t: T; unread: number; onClick: () => void }) {
  return (
    <button className="lang bellbtn" onClick={onClick}
      aria-label={unread > 0 ? `${t("notifications")} (${unread})` : t("notifications")}>
      <Bell size={14} aria-hidden />
      {unread > 0 && <span className="bellcount">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}
