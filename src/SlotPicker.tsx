import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Check } from "lucide-react";
import { api, fmtDay, fmtTime, type Locale, type StrKey } from "./lib";

type T = (k: StrKey) => string;

export type SlotRules = {
  hours: number[];
  minutes: number;
  maxOffers: number;
  horizonDays: number;
};

/**
 * Offer appointment times.
 *
 * Two steps on one screen: pick a day, tap the hours. Nothing to type.
 *
 * Hours the caretaker is already committed to are greyed out *before* he
 * submits. An earlier version accepted them and then reported that some had
 * been skipped, which is a confusing way to find out you're double-booked.
 */
export function SlotPicker({ l, t, rules, onOffer, onCancel }: {
  l: Locale;
  t: T;
  rules: SlotRules;
  onOffer: (slots: number[]) => void;
  onCancel: () => void;
}) {
  const [day, setDay] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState<{ starts_at: number; ends_at: number }[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.mySchedule().then((d) => setBusy(d.busy || [])).catch(() => setBusy([]));
  }, []);

  const days = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < Math.min(rules.horizonDays, 10); i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      out.push(d.getTime());
    }
    return out;
  }, [rules.horizonDays]);

  const slotAt = (dayMs: number, hour: number) => {
    const d = new Date(dayMs);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };

  const isBusy = (ms: number) =>
    busy.some((b) => ms < b.ends_at && ms + rules.minutes * 60e3 > b.starts_at);

  const toggle = (ms: number) =>
    setPicked((prev) =>
      prev.includes(ms)
        ? prev.filter((x) => x !== ms)
        : prev.length >= rules.maxOffers ? prev : [...prev, ms].sort((a, b) => a - b)
    );

  const atCap = picked.length >= rules.maxOffers;

  return (
    <div className="card">
      <p className="cardtitle"><Calendar size={15} aria-hidden /> {t("offerSlots")}</p>

      <p className="steplabel">{t("step1Day")}</p>
      <div className="daystrip">
        {days.map((ms, i) => (
          <button key={ms} className={"daychip" + (i === day ? " daychip-on" : "")}
            onClick={() => setDay(i)}>
            <span className="dayname">{fmtDay(ms, l).split(" ")[0]}</span>
            <span className="daynum">{new Date(ms).getDate()}</span>
          </button>
        ))}
      </div>

      <p className="steplabel">
        {t("step2Times")}
        <span className="stepnote">{t("upToN").replace("{n}", String(rules.maxOffers))}</span>
      </p>
      <div className="hourgrid">
        {rules.hours.map((h) => {
          const ms = slotAt(days[day], h);
          const past = ms < Date.now();
          const taken = isBusy(ms);
          const on = picked.includes(ms);
          return (
            <button key={h} disabled={past || taken || (atCap && !on)}
              className={"hourchip" + (on ? " hourchip-on" : "") + (taken ? " hourchip-busy" : "")}
              onClick={() => toggle(ms)}>
              <span>{String(h).padStart(2, "0")}:00</span>
              {taken && <span className="chipnote">{t("alreadyBooked")}</span>}
            </button>
          );
        })}
      </div>

      <div className="hr" />

      {picked.length === 0 ? (
        <p className="muted">{t("pickAtLeastOne")}</p>
      ) : (
        <>
          <p className="steplabel">{t("youAreOffering")}</p>
          {picked.map((ms) => (
            <div className="offerline" key={ms}>
              <Check size={14} aria-hidden />
              <span>{fmtDay(ms, l)}</span>
              <span className="mono">{fmtTime(ms, l)}–{fmtTime(ms + rules.minutes * 60e3, l)}</span>
              <button className="offerx" onClick={() => toggle(ms)} aria-label={t("cancel")}>×</button>
            </div>
          ))}
          <p className="muted">{t("residentPicksOne")}</p>
        </>
      )}

      <div className="row">
        <button className="btn" onClick={onCancel}>{t("cancel")}</button>
        <button className="btn btn-primary" disabled={picked.length === 0 || sending}
          onClick={() => { setSending(true); onOffer(picked); }}>
          {t("sendOffer")}
        </button>
      </div>
    </div>
  );
}
