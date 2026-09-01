import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Package, AlertTriangle, Clock, X, Building, Check, Lock,
  SlidersHorizontal } from "lucide-react";
import {
  api, objLabel, roomLabel, causeLabel, fmtDay, fmtDT, STATE_TONE, tradeLabel, escReason,
  type Locale, type StrKey,
} from "./lib";
import { BuildingCard } from "./BuildingEdit";
import { Sidebar, type OpSection } from "./Sidebar";
import { StaffPage, BuildingsPage } from "./Admin";
import { StickerSheet } from "./Auth";
import { Platform } from "./Platform";
import { type Route, queryString } from "./router";
import { BuildingCodes } from "./Codes";

type T = (k: StrKey) => string;

/* ------------------------------------------------------------------ */
/* trend chart — hand-rolled SVG, no charting dependency              */
/* ------------------------------------------------------------------ */

function monthName(bucket: string, l: Locale) {
  const [y, m] = bucket.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(l === "de" ? "de-DE" : "en-GB", { month: "short" });
}

/**
 * Reported against fixed, month by month.
 *
 * A grouped vertical bar chart, from the design export, and its reasoning is
 * worth keeping: the months are discrete buckets and an operator compares the
 * pair within each one, not a trajectory across them. So bars, not a line.
 *
 * Two empty states, deliberately different. No data at all keeps the twelve
 * slots with a baseline stub, because the empty grid is itself the message.
 * Months before the estate went live are hatched instead, so "nothing broke"
 * and "we weren't running yet" don't look the same.
 */
function TrendChart({ l, t, data, selected, onSelect, mode = "bars" }: {
  l: Locale; t: T; data: any[]; selected: string | null;
  onSelect: (b: string | null) => void; mode?: string;
}) {
  const max = Math.max(...data.map((d) => Math.max(d.reported, d.fixed)), 1);
  const any = data.some((d) => d.reported > 0 || d.fixed > 0);

  return (
    <>
      <div className="opd-chart-trend" role="img" aria-label={t("reportedVsFixed")}>
        {data.map((d) => {
          /* A month with no rows at all, before anything was recorded, is not
             the same as a month where nothing broke. */
          const blank = d.reported === 0 && d.fixed === 0 && !d.live;
          return (
            <button className="opd-bargroup" key={d.bucket}
              aria-pressed={selected === d.bucket}
              onClick={() => onSelect(selected === d.bucket ? null : d.bucket)}>
              <span className={"opd-bar opd-bar-reported"
                + (blank ? " opd-bar-nodata" : d.reported === 0 ? " opd-bar-zero" : "")}
                style={{ height: `${(d.reported / max) * 100}%` }} />
              <span className={"opd-bar opd-bar-fixed"
                + (blank ? " opd-bar-nodata" : d.fixed === 0 ? " opd-bar-zero" : "")}
                style={{ height: `${(d.fixed / max) * 100}%` }} />
              <span className="opd-bar-label">{monthName(d.bucket, l)}</span>
            </button>
          );
        })}
      </div>

      {!any && <p className="opd-chart-empty">{t("opdNoTrend")}</p>}

      <div className="opd-legend">
        <span className="opd-legend-item">
          <i className="opd-swatch opd-swatch-reported" aria-hidden /> {t("opdReported")}
        </span>
        <span className="opd-legend-item">
          <i className="opd-swatch opd-swatch-fixed" aria-hidden /> {t("opdFixedLeg")}
        </span>
        <span className="opd-chart-note">{t("opdTapMonth")}</span>
      </div>
    </>
  );
}

function MiniBars({ rows, label }: { rows: { key: string; n: number }[]; label: (k: string) => string }) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <>
      {rows.map((r) => (
        <div className="typerow" key={r.key}>
          <span className="typename">{label(r.key)}</span>
          <div className="typebar"><div style={{ width: `${(r.n / max) * 100}%` }} /></div>
          <span className="mono typecount">{r.n}</span>
        </div>
      ))}
    </>
  );
}

/**
 * Reports by trade.
 *
 * Four groups that are parts of a real whole, so a donut is legitimate here in a
 * way it isn't for the eight-fixture ranking — where three are tied and angles
 * would hide what bar lengths make obvious.
 */

/**
 * Which trade has the most.
 *
 * Two readings of the same numbers, chosen in Customise.
 *
 * The bar list is the safer default and the design export argues why: the
 * question is an ORDER, and a donut encodes order only through angle, which
 * stops being readable once two segments are within a few percent. Ties share a
 * rank and sort alphabetically, so nothing is silently promoted.
 *
 * The donut is offered because these four groups are also parts of a real
 * whole — and the export allows it on one condition: the sorted numbers are
 * printed beside it, and that list is the source of truth.
 */
function TradePanel({ l, t, data, mode = "bars" }: {
  l: Locale; t: T; data: any[]; mode?: string;
}) {
  if (!data || data.length === 0) {
    return <p className="opd-chart-empty">{t("opdNoData")}</p>;
  }

  const total = data.reduce((n, x) => n + x.n, 0) || 1;
  const max = Math.max(...data.map((x) => x.n), 1);

  const rows = [...data].sort((a, b) =>
    b.n - a.n || tradeLabel(a.trade, l).localeCompare(tradeLabel(b.trade, l)));

  const ranks = rows.map((r, i) => (i > 0 && rows[i - 1].n === r.n ? -1 : i + 1));
  ranks.forEach((v, i) => { if (v === -1) ranks[i] = ranks[i - 1]; });
  const tied = (i: number) => rows.some((r, j) => j !== i && r.n === rows[i].n);

  const COLOURS = ["var(--op-primary)", "var(--op-primary-400)",
                   "var(--op-primary-700)", "var(--op-warning)"];

  if (mode === "donut") {
    const R = 46, C = 2 * Math.PI * R;
    let acc = 0;
    return (
      <div className="opd-donutwrap">
        <svg viewBox="0 0 120 120" className="opd-donut" role="img" aria-label={t("byTradeWord")}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--op-border)" strokeWidth="15" />
          <g transform="rotate(-90 60 60)" fill="none" strokeWidth="15">
            {rows.map((x, i) => {
              const len = (x.n / total) * C;
              const seg = (
                <circle key={x.trade} cx="60" cy="60" r={R}
                  stroke={COLOURS[i % COLOURS.length]}
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
              );
              acc += len;
              return seg;
            })}
          </g>
        </svg>

        {/* The sorted numbers beside the ring: the export's condition for using
            a donut at all, and the part a reader can actually compare. */}
        <div className="opd-donutlegend">
          {rows.map((x, i) => (
            <div className="opd-legendrow" key={x.trade}>
              <i className="opd-legenddot"
                style={{ background: COLOURS[i % COLOURS.length] }} aria-hidden />
              <span className="opd-legendname">{tradeLabel(x.trade, l)}</span>
              <span className="opd-legendn">{x.n}</span>
              <span className="opd-legendpct">{Math.round((x.n / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="opd-chart-trades">
      {rows.map((x, i) => (
        <div className="opd-rankrow" key={x.trade}>
          <span className={"opd-rank" + (tied(i) ? " opd-rank-tie" : "")}>{ranks[i]}.</span>
          <span className="opd-rank-label">{tradeLabel(x.trade, l)}</span>
          <span className="opd-rank-track">
            <span className="opd-rank-fill" style={{ width: `${(x.n / max) * 100}%` }} />
          </span>
          <span className="opd-rank-value">{x.n}</span>
        </div>
      ))}
    </div>
  );
}


function MonthPanel({ l, t, bucket, building, onClose }: {
  l: Locale; t: T; bucket: string; building: string | null; onClose: () => void;
}) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    setD(null); setErr("");
    api.dashboardMonth(bucket, building).then(setD).catch((e) => setErr(e.message));
  }, [bucket, building]);

  const [y, m] = bucket.split("-").map(Number);
  const title = new Date(y, m - 1, 1)
    .toLocaleDateString(l === "de" ? "de-DE" : "en-GB", { month: "long", year: "numeric" });

  return (
    <div className="card monthpanel">
      <div className="rowspread">
        <p className="cardtitle">{title}</p>
        <button className="iconbtn" onClick={onClose} aria-label={t("closeMonth")}><X size={16} /></button>
      </div>

      {err && <div className="err">{err}</div>}
      {!d && !err && <p className="muted">…</p>}

      {d && (
        <>
          <div className="monthstats">
            <div><span className="mono big2">{d.totals.reported}</span><span className="muted">{t("reported")}</span></div>
            <div><span className="mono big2">{d.totals.fixed}</span><span className="muted">{t("fixed")}</span></div>
            <div><span className="mono big2">{d.totals.stillOpen}</span><span className="muted">{t("stillOpenN")}</span></div>
            <div>
              <span className="mono big2">{d.totals.medianDays ?? "–"}{d.totals.medianDays ? " d" : ""}</span>
              <span className="muted">{t("medianFix")}</span>
            </div>
          </div>

          {d.byBuilding.length > 1 && (
            <>
              <p className="steplabel">{t("perBuilding")}</p>
              <MiniBars rows={d.byBuilding.map((x: any) => ({ key: x.building_code, n: x.n }))}
                label={(k) => `Haus ${k}`} />
            </>
          )}

          <p className="steplabel">{t("byObject")}</p>
          <MiniBars rows={d.byType.map((x: any) => ({ key: x.object_type, n: x.n }))}
            label={(k) => objLabel(k, l)} />

          <p className="steplabel">{t("perCause")}</p>
          {d.byCause.length === 0
            ? <p className="muted">{t("noCauseYet")}</p>
            : <MiniBars rows={d.byCause.map((x: any) => ({ key: x.cause, n: x.n }))}
                label={(k) => causeLabel(k, l)} />}

          <button className="btn" onClick={() => setShowList((v) => !v)}>
            {showList ? t("hideTickets") : `${t("showTickets")} (${d.tickets.length})`}
          </button>

          {showList && d.tickets.map((r: any) => (
            /* Tapping a month is a drill-down too, so it uses the same row. */
            <div className="opd-trow" key={r.ticket_id}>
              <span className="opd-tcard-plate">
                {r.building_code}-{r.unit_code} · {roomLabel(r.room_type, l)}
              </span>
              <span className="opd-trow-obj">{objLabel(r.object_type, l)}</span>
              <span className={"opd-tpill opd-tpill-" + (STATE_TONE[r.state] || "neutral")}>
                {t(("st_" + r.state) as StrKey)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* drill-down list behind a metric card                               */
/* ------------------------------------------------------------------ */

function TicketList({ l, t, which, months, building, onBack }: {
  l: Locale; t: T; which: string; months: number; building: string | null; onBack: () => void;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [firm, setFirm] = useState("");
  const [ref, setRef] = useState("");

  const load = useCallback(() => {
    api.dashboardTickets(which, months, building)
      .then((d) => setRows(d.tickets))
      .catch((e) => setErr(e.message));
  }, [which, months, building]);

  useEffect(() => { load(); }, [load]);

  const heading = which === "parts" ? t("waitingParts")
    : which === "failed" ? t("failedVisits")
    : which === "trade" ? t("awaitingTrade")
    : t("openTickets");

  return (
    /*
      No export for the drill-downs, so they borrow the dashboard's own
      vocabulary rather than inventing a third language: the same card surface,
      the same mono plate, the same status pills.
    */
    <div className="opd-drill">
      {/* Back belongs here: a drill-down is somewhere you went from a metric,
          and the panel can't return you to the card you came from. */}
      <button className="opd-drill-back" onClick={onBack}>
        <ChevronLeft size={16} aria-hidden /> {t("backToDash")}
      </button>

      <header className="opd-head">
        <h1 className="opd-title">{heading}</h1>
        {rows && (
          <p className="opd-sub">
            {rows.length} {rows.length === 1 ? t("ticketWord") : t("ticketsWord")}
          </p>
        )}
      </header>

      {err && <div className="err">{err}</div>}
      {!rows && !err && <p className="opd-chart-empty">…</p>}
      {rows?.length === 0 && (
        <div className="opr-empty">
          <p className="opr-empty-line">{t("nothingHere")}</p>
        </div>
      )}

      {rows?.map((r) => {
        const days = Math.max(0, Math.round((Date.now() - r.reported_at) / 864e5));
        return (
        <div className="opd-tcard" key={r.ticket_id + (r.missed_at || "")}>
          <div className="opd-tcard-head">
            <span className="opd-tcard-plate">
              {r.building_code}-{r.unit_code} · {roomLabel(r.room_type, l)}
            </span>
            <span className={"opd-tpill opd-tpill-" + (STATE_TONE[r.state] || "neutral")}>
              {t(("st_" + r.state) as StrKey)}
            </span>
          </div>

          <p className="opd-tcard-title">{objLabel(r.object_type, l)}</p>

          <p className="opd-tmeta">
            <Clock size={13} aria-hidden /> {t("reportedOn")} {fmtDay(r.reported_at, l)}
            {" · "}
            {/* Past a fortnight the age is the point of the row, so it says so. */}
            <span className={days >= 14 ? "opd-tage-bad" : undefined}>
              {days} {t("daysOpen")}
            </span>
          </p>
          {r.part && (
            <p className="opd-tmeta"><Package size={13} aria-hidden /> {r.part}
              {r.supplier_eta ? ` · ${t("supplierEta")}: ${r.supplier_eta}` : ""}</p>
          )}
          {r.missed_at && (
            <p className="opd-tmeta opd-tmeta-warn">
              <AlertTriangle size={13} aria-hidden /> {fmtDT(r.missed_at, l)}
            </p>
          )}
          {r.appt_at && <p className="opd-tmeta">{fmtDT(r.appt_at, l)}</p>}

          {r.trade && (
            <>
              <p className="muted">
                <Building size={13} aria-hidden /> {tradeLabel(r.trade, l)} · {escReason(r.reason, l)}
              </p>
              {r.note && <p className="quote">{r.note}</p>}
              {r.commissioned_at ? (
                <p className="muted">
                  <Check size={13} aria-hidden /> {t("commissionedTo")} {r.contractor}
                  {r.reference ? ` · ${r.reference}` : ""}
                </p>
              ) : openId === r.ticket_id ? (
                <>
                  <input className="in" placeholder={t("firmName")} value={firm}
                    onChange={(e) => setFirm(e.target.value)} />
                  <input className="in" placeholder={t("orderRef")} value={ref}
                    onChange={(e) => setRef(e.target.value)} />
                  <div className="row">
                    <button className="btn" onClick={() => setOpenId(null)}>{t("cancel")}</button>
                    <button className="btn btn-primary" disabled={!firm.trim()}
                      onClick={async () => {
                        try {
                          await api.commission(r.ticket_id, firm, ref);
                          setFirm(""); setRef(""); setOpenId(null); load();
                        } catch (e: any) { setErr(e.message); }
                      }}>{t("commissionIt")}</button>
                  </div>
                </>
              ) : (
                <button className="btn" onClick={() => setOpenId(r.ticket_id)}>
                  <Building size={16} aria-hidden /> {t("commissionIt")}
                </button>
              )}
            </>
          )}
        </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* dashboard                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* the metric row, and which numbers it holds                         */
/* ------------------------------------------------------------------ */

/** A percentage change, coloured by whether the direction is good news. */
function Delta({ value, goodWhenDown }: { value: number | null; goodWhenDown: boolean }) {
  if (value === null || value === 0) return null;
  const down = value < 0;
  const good = down === goodWhenDown;
  return (
    <span className={"mono metricdelta " + (good ? "deltagood" : "deltabad")}>
      {down ? "−" : "+"}{Math.abs(value)}%
    </span>
  );
}

function CustomisePanel({ t, available, chosen, charts, chartChoices, onSave, onClose }: {
  t: T; available: string[]; chosen: string[];
  charts: Record<string, string>; chartChoices: Record<string, string[]>;
  onSave: (metrics: string[], charts: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(chosen);
  const [ch, setCh] = useState<Record<string, string>>(charts);
  const [busy, setBusy] = useState(false);

  const LABEL: Record<string, StrKey> = {
    failedPct: "failedVisits", waitingParts: "waitingParts", external: "awaitingTrade",
    medianDays: "medianFix", closedCount: "closedInPeriod", perRoom: "perRoom",
    repeatedCount: "repeatedCount",
  };
  const PANEL: Record<string, StrKey> = {
    trend: "reportedVsFixed", trade: "byTradeWord", byType: "byObject",
  };
  const CHART: Record<string, StrKey> = {
    bars: "chartBars", lines: "chartLines", donut: "chartDonut",
  };

  /*
   * Inline on the dashboard, not a modal.
   *
   * The panel is short and the thing it changes is directly below it — a modal
   * would cover the very cards the operator is deciding about. Pills rather
   * than switch rows for the same reason: eight of them fit on two lines, so
   * the whole choice is visible at once.
   *
   * Two metrics have no pill at all. The screen is about open work, and
   * oldest-open is the number that surfaces a ticket everyone stopped seeing —
   * they aren't disabled, they aren't negotiable, so they're stated as a line
   * of text instead of offered as a control.
   */
  return (
    <div className="opd-customise">
      <div className="opd-cust-head">
        <div>
          <p className="opd-cust-title">{t("whichNumbers")}</p>
          <p className="opd-cust-sub">{t("customiseSub")}</p>
        </div>
        <button className="opd-cust-x" onClick={onClose} aria-label={t("close")}>
          <X size={17} aria-hidden />
        </button>
      </div>

      <p className="opd-cust-locked">
        {t("openTickets")} · {t("oldestOpen")} — {t("alwaysShown")}
      </p>

      <div className="opd-pills">
        {available.map((m) => {
          const on = picked.includes(m);
          return (
            <button key={m} className={"opd-pill" + (on ? " opd-pill-on" : "")}
              role="switch" aria-checked={on}
              onClick={() => setPicked((a) => on ? a.filter((x) => x !== m) : [...a, m])}>
              {t(LABEL[m] ?? ("openTickets" as StrKey))}
              <span className="opd-pill-state">{on ? t("yes") : t("no")}</span>
            </button>
          );
        })}
      </div>

      <p className="opd-cust-eyebrow">{t("chartsWord")}</p>

      <div className="opd-chartrows">
        {Object.entries(chartChoices).map(([panel, choices]) => (
          choices.length < 2 ? null : (
            <div className="opd-chartrow" key={panel}>
              <span className="opd-chartname">
                {t(PANEL[panel] ?? ("byObject" as StrKey))}
              </span>
              <div className="opd-seg">
                {choices.map((c) => (
                  <button key={c} className={"opd-segbtn" + (ch[panel] === c ? " opd-segbtn-on" : "")}
                    aria-pressed={ch[panel] === c}
                    onClick={() => setCh((x) => ({ ...x, [panel]: c }))}>
                    {t(CHART[c] ?? ("chartBars" as StrKey))}
                  </button>
                ))}
              </div>
            </div>
          )
        ))}
      </div>

      <div className="opd-cust-foot">
        <button className="opd-cust-ghost" onClick={onClose}>{t("cancel")}</button>
        <button className="opd-cust-save" disabled={busy}
          onClick={async () => { setBusy(true); await onSave(picked, ch); setBusy(false); }}>
          {t("save")}
        </button>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* behind one repeat-fault row                                        */
/* ------------------------------------------------------------------ */

function RepeatDetail({ l, t, riser, object, months, onBack }: {
  l: Locale; t: T; riser: string; object: string; months: number; onBack: () => void;
}) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [span, setSpan] = useState(months);

  useEffect(() => {
    setD(null); setErr("");
    api.repeatDetail(riser, object, span).then(setD).catch((e) => setErr(e.message));
  }, [riser, object, span]);

  return (
    <div className="col">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("backToDash")}</button>
      <div className="rowspread">
        <h2>{riser} · {objLabel(object, l)}</h2>
        <select className="in ctlnarrow" value={span} onChange={(e) => setSpan(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {t("monthsWord")}</option>)}
        </select>
      </div>

      {err && <div className="err">{err}</div>}
      {!d && !err && <p className="muted">…</p>}

      {d && (
        <>
          <div className="metrics">
            <div className="opd-metric">
            <span className="opd-metric-label">{t("ticketsWord")}</span>
            <span className="opd-metric-row">
              <span className="opd-metric-value">{d.total}</span>
            </span>
          </div>
            <div className="opd-metric">
            <span className="opd-metric-label">{t("openTickets")}</span>
            <span className="opd-metric-row">
              <span className="opd-metric-value">{d.openNow}</span>
            </span>
          </div>
            <div className="opd-metric">
            <span className="opd-metric-label">{t("roomsAffected")}</span>
            <span className="opd-metric-row">
              <span className="opd-metric-value">{d.rooms.length}</span>
            </span>
          </div>
          </div>

          {/* Eleven tickets across seven rooms is a riser problem; eleven in one
              room is one bad fixture. That distinction is the whole point. */}
          <div className="card">
            <p className="cardtitle">{t("roomsAffected")}</p>
            {d.rooms.map((r: any) => (
              <div className="typerow" key={r.room}>
                <span className="typename mono">{r.room}</span>
                <div className="typebar">
                  <div style={{ width: `${(r.n / Math.max(...d.rooms.map((x: any) => x.n), 1)) * 100}%` }} />
                </div>
                <span className="mono typecount">{r.n}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <p className="cardtitle">{t("causesLogged")}</p>
            {d.causes.length === 0 ? <p className="muted">{t("noCauseYet")}</p> : d.causes.map((c: any) => (
              <div className="typerow" key={c.cause}>
                <span className="typename">{causeLabel(c.cause, l)}</span>
                <div className="typebar">
                  <div style={{ width: `${(c.n / Math.max(...d.causes.map((x: any) => x.n), 1)) * 100}%` }} />
                </div>
                <span className="mono typecount">{c.n}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <p className="cardtitle">{t("whenTheyHappened")}</p>
            <div className="chart">
              {d.months_.map((m: any) => {
                const max = Math.max(...d.months_.map((x: any) => x.n), 1);
                return (
                  <div className="chartcol" key={m.month} style={{ width: `${100 / Math.max(d.months_.length, 1)}%` }}>
                    <span className="chartvalue">{m.n}</span>
                    <span className="barstack">
                      <span className="barreported" style={{ height: `${(m.n / max) * 100}%` }} />
                    </span>
                    <span className="chartlabel">{m.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="eyebrow">{t("ticketsWord")}</p>
          {d.tickets.map((x: any) => (
            <div className="monthrow" key={x.ticket_id}>
              <span className="plate plate-sm">
                {x.building_code}-{x.unit_code} · {x.room_label || roomLabel(x.room_type, l)}
              </span>
              <span className="monthobj">{fmtDay(x.reported_at, l)}</span>
              {x.cause && <span className="muted">{causeLabel(x.cause, l)}</span>}
              <span className={"pill pill-" + (STATE_TONE[x.state] || "neutral")}>
                {t(("st_" + x.state) as StrKey)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function OperatorView({ l, t, session, route, query, navigate }: {
  l: Locale; t: T; session: any;
  route: Route;
  query: { months: number; building: string | null; rooms: string | null };
  navigate: (to: Route, q?: string, replace?: boolean) => void;
}) {
  /*
   * No screen state of its own any more.
   *
   * Which section, which drill-down, which building's codes — all of it used to
   * live here, so the browser's back button did nothing and a refresh dropped
   * you on the dashboard. It's all in the URL now, which means back works,
   * refresh keeps your place, and a view can be linked to.
   */
  const { months, building, rooms } = query;
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [customising, setCustomising] = useState(false);
  const [choices, setChoices] = useState<any>(null);

  const section: OpSection =
    route.kind === "codes" ? "codes"
    : route.kind === "buildings" || route.kind === "building" ? "buildings"
    : route.kind === "staff" ? "staff"
    : route.kind === "stickers" ? "stickers"
    : route.kind === "orgs" ? "orgs"
    : "dashboard";
  const month = route.kind === "month" ? route.bucket : null;

  /** Keeps the filters in the query string wherever you are. */
  const go = (to: Route) => navigate(to, queryString({ months, building, rooms }));
  const setFilter = (next: Partial<{ months: number; building: string | null; rooms: string | null }>) =>
    navigate({ kind: "dashboard" }, queryString({ months, building, rooms, ...next }));

  const load = useCallback(() => {
    setD(null); setErr("");
    api.dashboard(months, building, rooms).then(setD).catch((e) => setErr(e.message));
  }, [months, building, rooms]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.dashPrefs().then(setChoices).catch(() => {}); }, []);

  const rangeLabel = (m: number) =>
    m === 1 ? t("range1") : m === 3 ? t("range3") : m === 6 ? t("range6") : t("range12");

  const shows = (m: string) => (d?.prefs?.metrics ?? []).includes(m);
  const chartFor = (panel: string) => d?.prefs?.charts?.[panel] ?? "bars";

  /** Everything that isn't the dashboard, rendered inside the same shell. */
  const inner = () => {
    /* These four used to render as siblings of this view, which meant the left
       panel disappeared on them. They're destinations like any other. */
    if (route.kind === "buildings" || route.kind === "building") {
      return <BuildingsPage l={l} t={t}
        openCode={route.kind === "building" ? route.code : null}
        onOpen={(code) => navigate(code ? { kind: "building", code } : { kind: "buildings" })} />;
    }
    if (route.kind === "staff") {
      return <StaffPage l={l} t={t} me={session.principal.staffId} />;
    }
    if (route.kind === "stickers") {
      return <StickerSheet l={l} t={t} buildings={session.buildings}
        initialBuilding={route.code ?? null}
        onPick={(code) => navigate({ kind: "stickers", code: code ?? undefined })} />;
    }
    if (route.kind === "orgs" && session.principal.isPlatformAdmin) {
      return <Platform l={l} t={t} />;
    }

    if (route.kind === "codes" && route.code) {
      const b = (d?.buildings ?? []).find((x: any) => x.code === route.code);
      if (!d) return <p className="muted">…</p>;
      if (!b) return <div className="err">{t("noData")}</div>;
      /* No back arrow: the left panel is the way out, and two of them is one
         too many. Returning to the building picker is what the panel's own
         Access codes item does. */
      return <BuildingCodes l={l} t={t} building={b} />;
    }
    if (route.kind === "repeat") {
      return <RepeatDetail l={l} t={t} riser={route.riser} object={route.object}
        months={months} onBack={() => go({ kind: "dashboard" })} />;
    }
    if (route.kind === "drill") {
      return <TicketList l={l} t={t} which={route.which} months={months} building={building}
        onBack={() => go({ kind: "dashboard" })} />;
    }
    if (err) return <div className="err">{err}</div>;
    if (!d) return <p className="muted">…</p>;

    if (route.kind === "codes") {
      return (
        <div className="col">
          {/* No back arrow: the left panel is the way out. */}
          <header className="opc-head">
            <div>
              <h1 className="opc-title">{t("accessCodes")}</h1>
              <p className="opc-sub">{t("pickBuilding")}</p>
            </div>
          </header>
          <div className="opc-picklist">
            {d.buildings.map((b: any) => (
              <button className="opc-pickrow" key={b.id}
                onClick={() => go({ kind: "codes", code: b.code })}>
                <span className="opc-pick-name">{b.name}</span>
                <span className="opc-pick-code">{b.code}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return dashboard();
  };

  const dashboard = () => (
    <div className="col">
      {customising && choices && (
        <CustomisePanel t={t} available={choices.available}
          chosen={d.prefs.metrics} charts={d.prefs.charts} chartChoices={choices.chartChoices}
          onClose={() => setCustomising(false)}
          onSave={async (metrics, charts) => {
            await api.saveDashPrefs(metrics, charts);
            setCustomising(false); load();
          }} />
      )}

      <header className="opd-head">
        <h1 className="opd-title">{t("opNavDash")}</h1>
        <p className="opd-sub">{t("opdSub")}</p>
      </header>

      {/*
        A filter that's doing something looks chosen, not merely selected: the
        label takes a dot and the control an outline. Otherwise an operator
        reading a filtered dashboard has no way to tell it's filtered.
      */}
      <div className="opf-root">
        <div className="opf-row">
          <div className={"opf-control" + (months !== 12 ? " opf-control-active" : "")}>
            <label className={"opf-label" + (months !== 12 ? " opf-label-active" : "")}
              htmlFor="opf-period">
              {months !== 12 && <span className="opf-dot" aria-hidden />}
              <span>{t("period")}</span>
            </label>
            <select className={"opf-select" + (months !== 12 ? " opf-select-active" : "")}
              id="opf-period" value={months}
              onChange={(e) => setFilter({ months: Number(e.target.value) })}>
              {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{rangeLabel(m)}</option>)}
            </select>
          </div>

          <div className={"opf-control" + (building ? " opf-control-active" : "")}>
            <label className={"opf-label" + (building ? " opf-label-active" : "")}
              htmlFor="opf-building">
              {building && <span className="opf-dot" aria-hidden />}
              <span>{t("buildingLabel")}</span>
            </label>
            <select className={"opf-select" + (building ? " opf-select-active" : "")}
              id="opf-building" value={building ?? ""}
              onChange={(e) => setFilter({ building: e.target.value || null })}>
              <option value="">{t("allBuildings")}</option>
              {(d.buildings ?? []).map((b: any) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>

          <button className="opf-customise" onClick={() => setCustomising((v) => !v)}>
            <SlidersHorizontal className="opf-customise-icon" size={15} aria-hidden />
            {t("customise")}
          </button>
        </div>
      </div>

      <section className="opd-metrics">
        {/* Always shown: what the screen is for, and the one number that
            surfaces a ticket everybody stopped seeing. */}
        <button className="opd-metric opd-metric-link" onClick={() => go({ kind: "drill", which: "open" })}>
          <span className="opd-metric-label">{t("openTickets")}</span>
          <span className="opd-metric-row"><span className="opd-metric-value">{d.metrics.open}</span></span>
          <span className="opd-metric-hint">
            <Delta value={d.deltas?.open ?? null} goodWhenDown />
            {" "}{t("seeList")} →
          </span>
        </button>

        <button className="opd-metric opd-metric-link" onClick={() => go({ kind: "drill", which: "open" })}>
          <span className="opd-metric-label">{t("oldestOpen")}</span>
          <span className="opd-metric-row">
            {/* Two weeks is where an open ticket stops being a backlog item and
                starts being one nobody is looking at. */}
            <span className={"opd-metric-value"
              + ((d.oldestDays ?? 0) >= 14 ? " opd-metric-bad" : "")}>
              {d.oldestDays ?? "–"}{d.oldestDays !== null ? " d" : ""}
            </span>
          </span>
          <span className="opd-metric-hint">
            {d.oldest
              ? `${d.oldest.building_code}-${d.oldest.unit_code} · ${objLabel(d.oldest.object_type, l)}`
              : t("nothingFlagged")}
          </span>
        </button>

        {shows("failedPct") && (
          <button className="opd-metric opd-metric-link" onClick={() => go({ kind: "drill", which: "failed" })}>
            <span className="opd-metric-label">{t("failedVisits")}</span>
            <span className="opd-metric-row"><span className="opd-metric-value">{d.metrics.failedPct}%</span></span>
            <span className="opd-metric-hint">{d.metrics.failedCount} {t("visits")} →</span>
          </button>
        )}

        {shows("waitingParts") && (
          <button className="opd-metric opd-metric-link" onClick={() => go({ kind: "drill", which: "parts" })}>
            <span className="opd-metric-label">{t("waitingParts")}</span>
            <span className="opd-metric-row"><span className="opd-metric-value">{d.metrics.waitingParts}</span></span>
            <span className="opd-metric-hint">{t("seeList")} →</span>
          </button>
        )}

        {shows("external") && (
          <button className="opd-metric opd-metric-link" onClick={() => go({ kind: "drill", which: "trade" })}>
            <span className="opd-metric-label">{t("awaitingTrade")}</span>
            <span className="opd-metric-row"><span className="opd-metric-value">{d.metrics.external}</span></span>
            <span className="opd-metric-hint">{d.metrics.awaitingCommission} {t("toCommission")} →</span>
          </button>
        )}

        {shows("medianDays") && (
          <div className="opd-metric">
            <span className="opd-metric-label">{t("medianFix")}</span>
            <span className="opd-metric-row"><span className="opd-metric-value">{d.metrics.medianDays} d</span></span>
            <span className="opd-metric-hint">{d.metrics.closedCount} {t("closedInPeriod")}</span>
          </div>
        )}

        {shows("closedCount") && (
          <div className="opd-metric">
            <span className="opd-metric-label">{t("closedInPeriod")}</span>
            <span className="opd-metric-row">
              <span className="opd-metric-value">{d.metrics.closedCount}</span>
            </span>
          </div>
        )}

        {shows("perRoom") && (
          <div className="opd-metric">
            <span className="opd-metric-label">{t("perRoom")}</span>
            <span className="opd-metric-row">
              <span className="opd-metric-value">{d.metrics.perRoom ?? "–"}</span>
            </span>
          </div>
        )}

        {shows("repeatedCount") && (
          <div className="opd-metric">
            <span className="opd-metric-label">{t("repeatedCount")}</span>
            <span className="opd-metric-row">
              <span className="opd-metric-value">{d.metrics.repeatedCount}</span>
            </span>
          </div>
        )}
      </section>

      {/*
        Building cards, from the design export.
        
        The grid wraps and nothing is capped: twelve buildings lay out as twelve,
        rather than scrolling sideways with no sign there's more. And a building
        with no caretaker says so in amber rather than leaving a blank — the
        export is explicit that a vacancy is information, not a missing value.
      */}
      <section className="opd-buildings">
        {d.buildings.map((b: any) => (
          <button className="opd-bcard" key={b.id}
            aria-pressed={building === b.code}
            onClick={() => setFilter({ building: building === b.code ? null : b.code })}>
            <span className="opd-bcard-head">
              <span className="opd-bcard-name">{b.name}</span>
              <span className="opd-bcard-code">{b.code}</span>
            </span>
            <span className="opd-bcard-figs">
              <span className="opd-fig">
                <span className="opd-fig-n">{b.unit_count ?? 0}</span>
                <span className="opd-fig-l">{t("opdUnits")}</span>
              </span>
              <span className="opd-fig">
                <span className="opd-fig-n">{b.room_count ?? 0}</span>
                <span className="opd-fig-l">{t("opdRooms")}</span>
              </span>
              <span className="opd-fig">
                <span className={"opd-fig-n"
                  + ((b.open_count ?? 0) > 0 ? " opd-fig-bad" : " opd-fig-zero")}>
                  {b.open_count ?? 0}
                </span>
                <span className="opd-fig-l">{t("opdOpenShort")}</span>
              </span>
            </span>
            <span className={"opd-bcard-care"
              + (b.caretaker_names ? "" : " opd-bcard-care-vacant")}>
              {b.caretaker_names || t("opdVacant")}
            </span>
          </button>
        ))}
      </section>

      {/* Side by side on a wide screen, stacked below it. They answer related
          questions, so a scroll between them is a waste of a big monitor. */}
      <div className="dashpair">
        <div className="card">
          <div className="rowspread">
            <p className="cardtitle">{t("reportedVsFixed")}</p>
            <span className="muted mono">{d.metrics.closedCount} {t("closedInPeriod")}</span>
          </div>
          <TrendChart l={l} t={t} data={d.trend} selected={month} onSelect={(b) => go(b ? { kind: "month", bucket: b } : { kind: "dashboard" })}
            mode={chartFor("trend")} />
        </div>

        <div className="card">
          <p className="cardtitle">{t("byTradeWord")}</p>
          <TradePanel l={l} t={t} data={d.byTrade} mode={chartFor("trade")} />
        </div>
      </div>

      {month && (
        <MonthPanel l={l} t={t} bucket={month} building={building} onClose={() => go({ kind: "dashboard" })} />
      )}

      <div className="card">
        <div className="rowspread">
          <p className="cardtitle">{t("byObject")}</p>
          {/* Panel-local, not a third global filter: "where do faults happen"
              is a question about this panel alone. */}
          <select className="in ctlnarrow" value={rooms ?? ""} aria-label={t("byObject")}
            onChange={(e) => setFilter({ rooms: e.target.value || null })}>
            <option value="">{t("allRooms2")}</option>
            {(d.filter.roomOptions ?? []).map((r: string) => (
              <option key={r} value={r}>
                {r === "BEDROOM" ? t("roomBedroom") : r === "KITCHEN" ? t("roomKitchen")
                  : r === "BATHROOM" ? t("roomBathroom") : t("roomCommon")}
              </option>
            ))}
          </select>
        </div>
        {d.byType.length === 0 && <p className="opd-chart-empty">{t("opdNoData")}</p>}

        {/* A horizontal bar list, from the export. Ties keep a stable order —
            equal bars that reshuffle between polls make the list look unstable
            when nothing has changed. */}
        <div className="opd-chart-objects">
          {[...d.byType]
            .sort((a: any, b: any) =>
              b.n - a.n || objLabel(a.object_type, l).localeCompare(objLabel(b.object_type, l)))
            .map((x: any) => {
              const max = Math.max(...d.byType.map((y: any) => y.n), 1);
              return (
                <div className="opd-objrow" key={x.object_type}>
                  <span className="opd-obj-label">{objLabel(x.object_type, l)}</span>
                  <span className="opd-obj-track">
                    <span className="opd-obj-fill" style={{ width: `${(x.n / max) * 100}%` }} />
                  </span>
                  <span className="opd-obj-value">{x.n}</span>
                </div>
              );
            })}
        </div>
      </div>

      <div className="card">
        <div className="rowspread">
          <p className="cardtitle">{t("repeatFaults")}</p>
          <span className="muted">{rangeLabel(months)}</span>
        </div>
        {/*
          Nothing repeated is a flat statement, not an error and not a
          celebration — and it's only ever true of a timeframe, so the period
          is named alongside it.
        */}
        {d.repeats.length === 0 && (
          <div className="opr-empty">
            <p className="opr-empty-line">{t("nothingFlagged")}</p>
            <p className="opr-empty-sub">{rangeLabel(months)}</p>
          </div>
        )}

        <div className={"opr-list" + (d.repeats.length === 1 ? " opr-list-single" : "")}>
          {d.repeats.map((g: any, i: number) => {
            /* The alarm: a cause logged as the riser in most of the tickets.
               That's the same pipe rather than the same tap, which is the whole
               reason this panel exists. */
            const flagged = g.systemic >= 3;
            return (
              <button key={i} className={"opr-row" + (flagged ? " opr-row-alarm" : "")}
                onClick={() => go({ kind: "repeat", riser: g.riser, object: g.object_type })}>
                <span className="opr-rowtop">
                  <span className="opr-key">
                    {g.building_code} · {g.riser} · {objLabel(g.object_type, l)}
                  </span>
                  <span className="opr-figs">
                    <span className="opr-fig">
                      <span className="opr-fig-n">{g.rooms_affected}</span>
                      <span className="opr-fig-l">{t("roomsAffected")}</span>
                    </span>
                    <span className="opr-fig">
                      <span className={"opr-fig-n" + (flagged ? " opr-fig-alarm" : "")}>
                        {g.ticket_count}
                      </span>
                      <span className="opr-fig-l">{t("ticketsWord")}</span>
                    </span>
                    <ChevronRight className="opr-chev" size={15} aria-hidden />
                  </span>
                </span>

                {flagged ? (
                  <span className="opr-cause">
                    <AlertTriangle className="opr-cause-icon" size={15} aria-hidden />
                    <span className="opr-cause-text">
                      {t("systemicHint")} {g.systemic} {t("ofWord")} {g.ticket_count}
                    </span>
                  </span>
                ) : (
                  /* No cause recorded reads as "not yet", never as "no problem". */
                  <span className="opr-nocause">{t("noCauseYet")}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="opshell">
      <Sidebar t={t} section={section} orgName={session?.org?.name}
        personName={session?.principal?.name}
        isPlatformAdmin={session?.principal?.isPlatformAdmin}
        onGo={(next) => {
          navigate(
            next === "codes" ? { kind: "codes" }
            : next === "account" ? { kind: "account" }
            : next === "staff" ? { kind: "staff" }
            : next === "orgs" ? { kind: "orgs" }
            : next === "buildings" ? { kind: "buildings" }
            : next === "stickers" ? { kind: "stickers" }
            : { kind: "dashboard" },
            next === "dashboard" ? queryString({ months, building, rooms }) : "",
          );
        }} />
      <div className="opmain">{inner()}</div>
    </div>
  );
}
