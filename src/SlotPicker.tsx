import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Check } from "lucide-react";
import {
  api, buildingDays, msAtBuildingHour, fmtDayTZ, fmtTimeTZ,
  type Locale, type StrKey,
} from "./lib";

type T = (k: StrKey) => string;

export type SlotRules = {
  hours: number[];
  minutes: number;
  maxOffers: number;
  horizonDays: number;
  /** Appointment hours are the building's local hours, not the browser's. */
  timeZone: string;
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
  onOffer: (slots: number[]) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [day, setDay] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState<{ starts_at: number; ends_at: number }[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.mySchedule().then((d) => setBusy(d.busy || [])).catch(() => setBusy([]));
  }, []);

  const tz = rules.timeZone;
  const days = useMemo(
    () => buildingDays(Math.min(rules.horizonDays, 10), tz),
    [rules.horizonDays, tz]
  );

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
    /* A sheet, so the job it belongs to stays visible above. Days across the
       top, times as pills beneath: the design's day × time grid. */
    <>
      <button className="rz-scrim" aria-label={t("cancel")} onClick={onCancel} />
      <div className="rz-sheet" role="dialog" aria-modal="true" aria-label={t("offerSlots")}>
        <div className="rz-sheethead">
          <p className="rz-cardtitle">
            <Calendar size={17} aria-hidden /> {t("offerSlots")}
          </p>
          <button className="rz-sheetcancel" onClick={onCancel}>{t("cancel")}</button>
        </div>

        <div className="rz-day">
          <div className="rz-dayhead">
            <span className="rz-daylabel">{t("step1Day")}</span>
          </div>
          <div className="rz-times">
            {days.map((d, i) => (
              <button key={d.ms} className="rz-time" aria-pressed={i === day}
                onClick={() => setDay(i)}>
                {fmtDayTZ(d.ms, l, tz).split(" ")[0]} {d.day}
              </button>
            ))}
          </div>
        </div>

        <div className="rz-day">
          <div className="rz-dayhead">
            <span className="rz-daylabel">{t("step2Times")}</span>
            <span className="rz-small">{t("upToN").replace("{n}", String(rules.maxOffers))}</span>
          </div>
          <div className="rz-times">
            {rules.hours.map((h) => {
              const ms = msAtBuildingHour(days[day], h, tz);
              const past = ms < Date.now();
              const taken = isBusy(ms);
              const on = picked.includes(ms);
              return (
                <button key={h} className="rz-time" aria-pressed={on}
                  disabled={past || taken || (atCap && !on)}
                  style={past || taken ? { opacity: .4 } : undefined}
                  onClick={() => toggle(ms)}>
                  {String(h).padStart(2, "0")}:00
                </button>
              );
            })}
          </div>
        </div>

        {picked.length === 0 ? (
          <p className="rz-small">{t("pickAtLeastOne")}</p>
        ) : (
          <div className="rz-offered">
            <p className="rz-overline">{t("youAreOffering")}</p>
            {picked.map((ms) => (
              <div className="rz-spread" key={ms}>
                <span className="rz-offeredtime">
                  {fmtDayTZ(ms, l, tz)} · {fmtTimeTZ(ms, l, tz)}–{fmtTimeTZ(ms + rules.minutes * 60e3, l, tz)}
                </span>
                <button className="rz-sheetcancel" onClick={() => toggle(ms)}
                  aria-label={t("cancel")}>×</button>
              </div>
            ))}
            <p className="rz-small">{t("residentPicksOne")}</p>
          </div>
        )}

        <button className="rz-btn rz-btn-primary" disabled={picked.length === 0 || sending}
          onClick={async () => {
            setSending(true);
            // Always clear: a rejected offer must leave the button usable.
            try { await onOffer(picked); } finally { setSending(false); }
          }}>
          {t("sendOffer")}
        </button>
      </div>
    </>
  );
}
