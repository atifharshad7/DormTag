import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Package, AlertTriangle, Clock, X, Building, Check } from "lucide-react";
import {
  api, objLabel, roomLabel, causeLabel, fmtDay, fmtDT, STATE_TONE, tradeLabel, escReason,
  type Locale, type StrKey,
} from "./lib";

type T = (k: StrKey) => string;

/* ------------------------------------------------------------------ */
/* trend chart — hand-rolled SVG, no charting dependency              */
/* ------------------------------------------------------------------ */

function monthName(bucket: string, l: Locale) {
  const [y, m] = bucket.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(l === "de" ? "de-DE" : "en-GB", { month: "short" });
}

function TrendChart({ l, t, data, selected, onSelect }: {
  l: Locale; t: T; data: any[]; selected: string | null; onSelect: (b: string | null) => void;
}) {
  if (data.length === 0) return <p className="muted">{t("noData")}</p>;
  const max = Math.max(...data.map((d) => d.reported), 1);

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

export function OperatorView({ l, t }: { l: Locale; t: T }) {
  const [months, setMonths] = useState(12);
  const [building, setBuilding] = useState<string | null>(null);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [drill, setDrill] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  const load = useCallback(() => {
    setD(null); setErr("");
    setMonth(null);   // a new period or building invalidates the open month
    api.dashboard(months, building).then(setD).catch((e) => setErr(e.message));
  }, [months, building]);

  useEffect(() => { load(); }, [load]);

  if (drill) {
    return <TicketList l={l} t={t} which={drill} months={months} building={building}
      onBack={() => { setDrill(null); load(); }} />;
  }

  if (err) return <div className="err">{err}</div>;

  const rangeLabel = (m: number) =>
    m === 1 ? t("range1") : m === 3 ? t("range3") : m === 6 ? t("range6") : t("range12");

  return (
    <div className="col">
      <div className="controls">
        <label className="ctl">
          <span>{t("period")}</span>
          <select className="in" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{rangeLabel(m)}</option>)}
          </select>
        </label>
        <label className="ctl">
          <span>{t("buildingLabel")}</span>
          <select className="in" value={building ?? ""} onChange={(e) => setBuilding(e.target.value || null)}>
            <option value="">{t("allBuildings")}</option>
            {(d?.buildings ?? []).map((b: any) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!d ? <p className="muted">…</p> : (
        <>
          <div className="metrics">
            <button className="metric metriclink" onClick={() => setDrill("open")}>
              <p className="muted">{t("openTickets")}</p>
              <p className="big mono">{d.metrics.open}</p>
              <p className="metrichint">{t("seeList")} →</p>
            </button>

            <div className="metric">
              <p className="muted">{t("medianFix")}</p>
              <p className="big mono">{d.metrics.medianDays} d</p>
              <p className="metrichint">{d.metrics.closedCount} {t("closedInPeriod")}</p>
            </div>

            <button className="metric metriclink" onClick={() => setDrill("parts")}>
              <p className="muted">{t("waitingParts")}</p>
              <p className="big mono">{d.metrics.waitingParts}</p>
              <p className="metrichint">{t("seeList")} →</p>
            </button>

            <button className="metric metriclink" onClick={() => setDrill("trade")}>
              <p className="muted">{t("awaitingTrade")}</p>
              <p className="big mono">{d.metrics.external}</p>
              <p className="metrichint">
                {d.metrics.awaitingCommission} {t("toCommission")} →
              </p>
            </button>

            <button className="metric metriclink" onClick={() => setDrill("failed")}>
              <p className="muted">{t("failedVisits")}</p>
              <p className="big mono">{d.metrics.failedPct}%</p>
              <p className="metrichint">{d.metrics.failedCount} {t("visits")} →</p>
            </button>
          </div>

          <div className="card">
            <p className="cardtitle">{t("reportedVsFixed")}</p>
            <TrendChart l={l} t={t} data={d.trend} selected={month} onSelect={setMonth} />
          </div>

          {month && (
            <MonthPanel l={l} t={t} bucket={month} building={building} onClose={() => setMonth(null)} />
          )}

          <div className="card">
            <p className="cardtitle">{t("byObject")}</p>
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
                <div key={i} className={"repeat" + (flagged ? " repeat-flag" : "")}>
                  <div className="rowspread">
                    <span className="mono">{g.building_code} · {g.riser} · {objLabel(g.object_type, l)}</span>
                    <span className="mono">{g.ticket_count} {t("ticketsWord")}</span>
                  </div>
                  <p className="muted">
                    {g.rooms_affected} {t("roomsAffected")}
                    {flagged && ` · ${t("systemicHint")} ${g.systemic} ${t("ofWord")} ${g.ticket_count}`}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="eyebrow">{t("buildings")}</p>
          <div className="bgrid">
            {d.buildings.map((b: any) => {
              const load2 = Math.min(100, Math.round((b.open_count / 20) * 100));
              const active = building === b.code;
              return (
                <button className={"card cardlink" + (active ? " cardactive" : "")} key={b.id}
                  onClick={() => setBuilding(active ? null : b.code)}>
                  <div className="rowspread">
                    <p className="cardtitle">{b.name}</p>
                    <span className="plate plate-sm">{b.code}</span>
                  </div>
                  <p className="muted mono">
                    {b.room_count} {t("roomsWord")} · {b.open_count} {t("openWord")}
                  </p>
                  <div className="bar">
                    <div className={"barfill" + (load2 > 50 ? " barfill-warn" : "")} style={{ width: load2 + "%" }} />
                  </div>
                  <p className="metrichint">
                    {active ? <><X size={11} aria-hidden /> {t("clearFilter")}</> : <>{t("filterToThis")} →</>}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
