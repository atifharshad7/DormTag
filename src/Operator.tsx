import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Package, AlertTriangle, Clock, X, Building, Check,
  SlidersHorizontal } from "lucide-react";
import {
  api, objLabel, roomLabel, causeLabel, fmtDay, fmtDT, STATE_TONE, tradeLabel, escReason,
  type Locale, type StrKey,
} from "./lib";
import { BuildingCard } from "./BuildingEdit";
import { Sidebar, type OpSection } from "./Sidebar";
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

function TrendChart({ l, t, data, selected, onSelect, mode = "bars" }: {
  l: Locale; t: T; data: any[]; selected: string | null;
  onSelect: (b: string | null) => void; mode?: string;
}) {
  if (data.length === 0) return <p className="muted">{t("noData")}</p>;
  const max = Math.max(...data.map((d) => d.reported), 1);

  // Lines show the gap between reported and fixed more directly; bars show each
  // month split into the two. Both are honest readings of the same numbers.
  if (mode === "lines") {
    const w = 100 / Math.max(data.length - 1, 1);
    const pt = (v: number, i: number) => `${i * w},${100 - (v / max) * 92}`;
    return (
      <div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="linechart"
          role="img" aria-label={t("reportedVsFixed")}>
          <polyline points={data.map((d, i) => pt(d.reported, i)).join(" ")}
            fill="none" stroke="var(--muted)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <polyline points={data.map((d, i) => pt(d.fixed, i)).join(" ")}
            fill="none" stroke="var(--green)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="chartaxis">
          {data.map((d) => (
            <button key={d.bucket} className="axtick" onClick={() => onSelect(selected === d.bucket ? null : d.bucket)}
              aria-pressed={selected === d.bucket}>
              {monthName(d.bucket, l)}
            </button>
          ))}
        </div>
        <div className="legend">
          <span><i className="swatch swatch-fixed" /> {t("fixed")}</span>
          <span><i className="swatch swatch-open" /> {t("reportedOn")}</span>
          {!selected && <span className="legendhint">{t("tapMonth")}</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="chart">
        {data.map((d) => {
          const on = selected === d.bucket;
          return (
            <button key={d.bucket}
              className={"chartcol" + (on ? " chartcol-on" : "")}
              style={{ width: `${100 / data.length}%` }}
              aria-pressed={on}
              aria-label={`${monthName(d.bucket, l)}: ${d.reported} ${t("reported")}, ${d.fixed} ${t("fixed")}`}
              onClick={() => onSelect(on ? null : d.bucket)}>
              <span className="chartvalue">{d.reported}</span>
              <span className="barstack">
                <span className="barreported" style={{ height: `${(d.reported / max) * 100}%` }}>
                  <span className="barfixed"
                    style={{ height: `${(d.fixed / Math.max(d.reported, 1)) * 100}%` }} />
                </span>
              </span>
              <span className="chartlabel">{monthName(d.bucket, l)}</span>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span><i className="swatch swatch-fixed" /> {t("fixed")}</span>
        <span><i className="swatch swatch-open" /> {t("stillOpen")}</span>
        {!selected && <span className="legendhint">{t("tapMonth")}</span>}
      </div>
    </div>
  );
}

/** Bars for a small ranked breakdown. Used three times in the month panel. */
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
function TradePanel({ l, t, data, mode }: { l: Locale; t: T; data: any[]; mode: string }) {
  if (!data || data.length === 0) return <p className="muted">{t("noData")}</p>;
  const total = data.reduce((n, x) => n + x.n, 0) || 1;
  const COLOURS = ["var(--blue)", "var(--green)", "var(--red)", "var(--muted)", "var(--amber)"];

  if (mode === "donut") {
    const R = 46, C = 2 * Math.PI * R;
    let acc = 0;
    return (
      <div className="donutwrap">
        <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={t("byTradeWord")}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="15" />
          <g transform="rotate(-90 60 60)" fill="none" strokeWidth="15">
            {data.map((x, i) => {
              const len = (x.n / total) * C;
              const el = (
                <circle key={x.trade} cx="60" cy="60" r={R} stroke={COLOURS[i % COLOURS.length]}
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
              );
              acc += len;
              return el;
            })}
          </g>
          <text x="60" y="58" textAnchor="middle" className="donuttotal">{total}</text>
          <text x="60" y="72" textAnchor="middle" className="donutcap">{t("reports")}</text>
        </svg>
        <div className="donutkey">
          {data.map((x, i) => (
            <div className="keyrow" key={x.trade}>
              <i className="swatch" style={{ background: COLOURS[i % COLOURS.length] }} />
              <span className="keyname">{tradeLabel(x.trade, l)}</span>
              <span className="mono">{x.n} · {Math.round((x.n / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const max = Math.max(...data.map((x) => x.n), 1);
  return (
    <>
      {data.map((x) => (
        <div className="typerow" key={x.trade}>
          <span className="typename">{tradeLabel(x.trade, l)}</span>
          <div className="typebar"><div style={{ width: `${(x.n / max) * 100}%` }} /></div>
          <span className="mono typecount">{x.n}</span>
        </div>
      ))}
    </>
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
            <div className="monthrow" key={r.ticket_id}>
              <span className="plate plate-sm">
                {r.building_code}-{r.unit_code} · {roomLabel(r.room_type, l)}
              </span>
              <span className="monthobj">{objLabel(r.object_type, l)}</span>
              <span className={"pill pill-" + (STATE_TONE[r.state] || "neutral")}>
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
    <div className="col">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("backToDash")}</button>
      <div className="rowspread">
        <h2>{heading}</h2>
        {rows && <span className="muted">{rows.length}</span>}
      </div>
      {err && <div className="err">{err}</div>}
      {!rows && !err && <p className="muted">…</p>}
      {rows?.length === 0 && <div className="empty"><p className="muted">{t("nothingHere")}</p></div>}

      {rows?.map((r) => (
        <div className="card" key={r.ticket_id + (r.missed_at || "")}>
          <div className="rowspread">
            <span className="plate plate-sm">
              {r.building_code}-{r.unit_code} · {roomLabel(r.room_type, l)}
            </span>
            <span className={"pill pill-" + (STATE_TONE[r.state] || "neutral")}>
              {t(("st_" + r.state) as StrKey)}
            </span>
          </div>
          <p className="cardtitle">{objLabel(r.object_type, l)}</p>
          <p className="muted mono">
            <Clock size={12} aria-hidden /> {t("reportedOn")} {fmtDay(r.reported_at, l)}
            {" · "}{Math.max(0, Math.round((Date.now() - r.reported_at) / 864e5))} {t("daysOpen")}
          </p>
          {r.part && (
            <p className="muted"><Package size={13} aria-hidden /> {r.part}
              {r.supplier_eta ? ` · ${t("supplierEta")}: ${r.supplier_eta}` : ""}</p>
          )}
          {r.missed_at && (
            <p className="muted"><AlertTriangle size={13} aria-hidden /> {fmtDT(r.missed_at, l)}</p>
          )}
          {r.appt_at && <p className="muted mono">{fmtDT(r.appt_at, l)}</p>}

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
      ))}
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

  return (
    <div className="card">
      <div className="rowspread">
        <p className="cardtitle">{t("whichNumbers")}</p>
        <button className="iconbtn" onClick={onClose} aria-label={t("close")}><X size={16} /></button>
      </div>

      {/* Open and oldest-open aren't offered: the screen is about open work, and
          oldest-open is the one number that surfaces a forgotten ticket. */}
      <p className="muted">
        {t("openTickets")} · {t("oldestOpen")} — {t("alwaysShown")}
      </p>

      {available.map((m) => (
        <button key={m} className="consent"
          onClick={() => setPicked((a) => a.includes(m) ? a.filter((x) => x !== m) : [...a, m])}>
          <span>{t(LABEL[m] ?? ("openTickets" as StrKey))}</span>
          <span className={"pill pill-" + (picked.includes(m) ? "info" : "neutral")}>
            {picked.includes(m) ? t("yes") : t("no")}
          </span>
        </button>
      ))}

      <p className="steplabel">{t("chartsWord")}</p>
      {Object.entries(chartChoices).map(([panel, choices]) => (
        choices.length < 2 ? null : (
          <div className="row chartrow" key={panel}>
            <span className="chartname">{t(PANEL[panel] ?? ("byObject" as StrKey))}</span>
            <div className="tabs tabs-sm">
              {choices.map((c) => (
                <button key={c} className={"tab" + (ch[panel] === c ? " tab-on" : "")}
                  onClick={() => setCh((x) => ({ ...x, [panel]: c }))}>
                  {t(CHART[c] ?? ("chartBars" as StrKey))}
                </button>
              ))}
            </div>
          </div>
        )
      ))}

      <div className="row">
        <button className="btn" onClick={onClose}>{t("cancel")}</button>
        <button className="btn btn-primary" disabled={busy}
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
            <div className="metric">
              <p className="muted">{t("ticketsWord")}</p>
              <p className="big mono">{d.total}</p>
            </div>
            <div className="metric">
              <p className="muted">{t("openTickets")}</p>
              <p className="big mono">{d.openNow}</p>
            </div>
            <div className="metric">
              <p className="muted">{t("roomsAffected")}</p>
              <p className="big mono">{d.rooms.length}</p>
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

  const section: OpSection = route.kind === "codes" ? "codes" : "dashboard";
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
    if (route.kind === "codes" && route.code) {
      const b = (d?.buildings ?? []).find((x: any) => x.code === route.code);
      if (!d) return <p className="muted">…</p>;
      if (!b) return <div className="err">{t("noData")}</div>;
      return <BuildingCodes l={l} t={t} building={b}
        onBack={() => go({ kind: "dashboard" })} />;
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
          <h2>{t("accessCodes")}</h2>
          <button className="linkback" onClick={() => go({ kind: "dashboard" })}>
            <ChevronLeft size={16} /> {t("backToDash")}
          </button>
          <p className="muted">{t("pickBuilding")}</p>
          {d.buildings.map((b: any) => (
            <button className="card cardlink" key={b.id}
              onClick={() => go({ kind: "codes", code: b.code })}>
              <div className="rowspread">
                <span className="cardtitle">{b.name}</span>
                <span className="plate plate-sm">{b.code}</span>
              </div>
            </button>
          ))}
        </div>
      );
    }

    return dashboard();
  };

  const dashboard = () => (
    <div className="col">
      <div className="rowspread dashhead">
        <h2>{t("dashboardWord")}</h2>
        <div className="row dashctl">
          <select className="in ctlnarrow" value={months} aria-label={t("period")}
            onChange={(e) => setFilter({ months: Number(e.target.value) })}>
            {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{rangeLabel(m)}</option>)}
          </select>
          <select className="in ctlnarrow" value={building ?? ""} aria-label={t("buildingLabel")}
            onChange={(e) => setFilter({ building: e.target.value || null })}>
            <option value="">{t("allBuildings")}</option>
            {(d.buildings ?? []).map((b: any) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => setCustomising((v) => !v)}>
            <SlidersHorizontal size={14} aria-hidden /> {t("customise")}
          </button>
        </div>
      </div>

      {customising && choices && (
        <CustomisePanel t={t} available={choices.available}
          chosen={d.prefs.metrics} charts={d.prefs.charts} chartChoices={choices.chartChoices}
          onClose={() => setCustomising(false)}
          onSave={async (metrics, charts) => {
            await api.saveDashPrefs(metrics, charts);
            setCustomising(false); load();
          }} />
      )}

      <div className="metrics">
        {/* Always shown: what the screen is for, and the one number that
            surfaces a ticket everybody stopped seeing. */}
        <button className="metric metriclink" onClick={() => go({ kind: "drill", which: "open" })}>
          <p className="muted">{t("openTickets")}</p>
          <p className="big mono">{d.metrics.open}</p>
          <p className="metrichint">
            <Delta value={d.deltas?.open ?? null} goodWhenDown />
            {" "}{t("seeList")} →
          </p>
        </button>

        <button className="metric metriclink" onClick={() => go({ kind: "drill", which: "open" })}>
          <p className="muted">{t("oldestOpen")}</p>
          <p className={"big mono" + ((d.oldestDays ?? 0) >= 14 ? " metricwarn" : "")}>
            {d.oldestDays ?? "–"}{d.oldestDays !== null ? " d" : ""}
          </p>
          <p className="metrichint">
            {d.oldest
              ? `${d.oldest.building_code}-${d.oldest.unit_code} · ${objLabel(d.oldest.object_type, l)}`
              : t("nothingFlagged")}
          </p>
        </button>

        {shows("failedPct") && (
          <button className="metric metriclink" onClick={() => go({ kind: "drill", which: "failed" })}>
            <p className="muted">{t("failedVisits")}</p>
            <p className="big mono">{d.metrics.failedPct}%</p>
            <p className="metrichint">{d.metrics.failedCount} {t("visits")} →</p>
          </button>
        )}

        {shows("waitingParts") && (
          <button className="metric metriclink" onClick={() => go({ kind: "drill", which: "parts" })}>
            <p className="muted">{t("waitingParts")}</p>
            <p className="big mono">{d.metrics.waitingParts}</p>
            <p className="metrichint">{t("seeList")} →</p>
          </button>
        )}

        {shows("external") && (
          <button className="metric metriclink" onClick={() => go({ kind: "drill", which: "trade" })}>
            <p className="muted">{t("awaitingTrade")}</p>
            <p className="big mono">{d.metrics.external}</p>
            <p className="metrichint">{d.metrics.awaitingCommission} {t("toCommission")} →</p>
          </button>
        )}

        {shows("medianDays") && (
          <div className="metric">
            <p className="muted">{t("medianFix")}</p>
            <p className="big mono">{d.metrics.medianDays} d</p>
            <p className="metrichint">{d.metrics.closedCount} {t("closedInPeriod")}</p>
          </div>
        )}

        {shows("closedCount") && (
          <div className="metric">
            <p className="muted">{t("closedInPeriod")}</p>
            <p className="big mono">{d.metrics.closedCount}</p>
          </div>
        )}

        {shows("perRoom") && (
          <div className="metric">
            <p className="muted">{t("perRoom")}</p>
            <p className="big mono">{d.metrics.perRoom ?? "–"}</p>
          </div>
        )}

        {shows("repeatedCount") && (
          <div className="metric">
            <p className="muted">{t("repeatedCount")}</p>
            <p className="big mono">{d.metrics.repeatedCount}</p>
          </div>
        )}
      </div>

      <p className="eyebrow">{t("buildings")}</p>
      <div className="bgrid">
        {d.buildings.map((b: any) => (
          <BuildingCard key={b.id} l={l} t={t} b={b}
            active={building === b.code}
            onFilter={() => setFilter({ building: building === b.code ? null : b.code })}
            onChanged={load} />
        ))}
      </div>

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
        {d.byType.length === 0 && <p className="muted">{t("noData")}</p>}
        {d.byType.map((x: any) => {
          const max = Math.max(...d.byType.map((y: any) => y.n), 1);
          return (
            <div className="typerow" key={x.object_type}>
              <span className="typename">{objLabel(x.object_type, l)}</span>
              <div className="typebar"><div style={{ width: `${(x.n / max) * 100}%` }} /></div>
              <span className="mono typecount">{x.n}</span>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="rowspread">
          <p className="cardtitle">{t("repeatFaults")}</p>
          <span className="muted">{rangeLabel(months)}</span>
        </div>
        {d.repeats.length === 0 && <p className="muted">{t("nothingFlagged")}</p>}
        {d.repeats.map((g: any, i: number) => {
          const flagged = g.systemic >= 3;
          return (
            <button key={i} className={"repeat repeatlink" + (flagged ? " repeat-flag" : "")}
              onClick={() => go({ kind: "repeat", riser: g.riser, object: g.object_type })}>
              <div className="rowspread">
                <span className="mono">
                  {g.building_code} · {g.riser} · {objLabel(g.object_type, l)}
                </span>
                <span className="mono">
                  {g.rooms_affected} {t("roomsAffected")} · {g.ticket_count} {t("ticketsWord")}
                  {" "}<ChevronRight size={13} aria-hidden />
                </span>
              </div>
              {flagged && (
                <p className="muted">
                  {t("systemicHint")} {g.systemic} {t("ofWord")} {g.ticket_count}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="opshell">
      <Sidebar t={t} section={section} orgName={session?.org?.name}
        personName={session?.principal?.name}
        isPlatformAdmin={session?.principal?.isPlatformAdmin}
        onGo={(next) => {
          if (next === "codes") { go({ kind: "codes" }); return; }
          navigate(
            next === "account" ? { kind: "account" }
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
