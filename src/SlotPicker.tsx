import React, { useMemo, useState } from "react";
import { Calendar, X } from "lucide-react";
import type { Locale, StrKey } from "./lib";
import { fmtDay, fmtTime } from "./lib";

type T = (k: StrKey) => string;

export type SlotRules = {
  hours: number[];
  minutes: number;
  maxOffers: number;
  horizonDays: number;
};

/**
 * The caretaker picks the times. Nothing is generated for him.
 *
 * A day strip plus an hour grid, because he's on a phone in a corridor and a
 * pair of datetime inputs would be four taps per slot. Slots sit on the whole
 * hour so they can never overlap — that's what lets a single unique index on
 * (staff_id, starts_at) prevent double booking without range types.
 */
export function SlotPicker({ l, t, rules, busy, onOffer, onCancel }: {
  l: Locale;
  t: T;
  rules: SlotRules;
  busy: boolean;
  onOffer: (slots: number[]) => void;
  onCancel: () => void;
}) {
  const [day, setDay] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);

  const days = useMemo(() => {
    const out: { offset: number; ms: number }[] = [];
    for (let i = 0; i < Math.min(rules.horizonDays, 10); i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      out.push({ offset: i, ms: d.getTime() });
    }
    return out;
  }, [rules.horizonDays]);

  const slotMs = (dayMs: number, hour: number) => {
    const d = new Date(dayMs);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };

  const toggle = (ms: number) => {
    setPicked((prev) => {
      if (prev.includes(ms)) return prev.filter((x) => x !== ms);
      if (prev.length >= rules.maxOffers) return prev;
      return [...prev, ms].sort((a, b) => a - b);
    });
  };

  const full = picked.length >= rules.maxOffers;
  const currentDay = days[day];

  return (
    <div className="card">
      <div className="rowspread">
        <p className="cardtitle"><Calendar size={15} aria-hidden /> {t("offerSlots")}</p>
        <span className="muted">{picked.length} / {rules.maxOffers}</span>
      </div>

      <div className="daystrip">
        {days.map((d, i) => (
          <button key={d.ms} className={"daychip" + (i === day ? " daychip-on" : "")}
            onClick={() => setDay(i)}>
            <span className="dayname">{fmtDay(d.ms, l).split(" ")[0]}</span>
            <span className="daynum">{new Date(d.ms).getDate()}</span>
          </button>
        ))}
      </div>

      <div className="hourgrid">
        {rules.hours.map((h) => {
          const ms = slotMs(currentDay.ms, h);
          const past = ms < Date.now();
          const on = picked.includes(ms);
          return (
            <button key={h} disabled={past || (full && !on)}
              className={"hourchip" + (on ? " hourchip-on" : "")}
              onClick={() => toggle(ms)}>
              {String(h).padStart(2, "0")}:00
            </button>
          );
        })}
      </div>

      {picked.length > 0 && (
        <div className="pickedlist">
          {picked.map((ms) => (
            <button key={ms} className="pickedchip" onClick={() => toggle(ms)}>
              <span>{fmtDay(ms, l)} · {fmtTime(ms, l)}</span>
              <X size={13} aria-hidden />
            </button>
          ))}
        </div>
      )}

      <p className="muted">{t("slotLength").replace("{n}", String(rules.minutes))}</p>

      <div className="row">
        <button className="btn" onClick={onCancel}>{t("cancel")}</button>
        <button className="btn btn-primary" disabled={picked.length === 0 || busy}
          onClick={() => onOffer(picked)}>
          {t("sendOffer")} ({picked.length})
        </button>
      </div>
    </div>
  );
}
