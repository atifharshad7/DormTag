import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Package, AlertTriangle, Clock, X, Building, Check } from "lucide-react";
import {
  api, objLabel, roomLabel, fmtDay, fmtDT, STATE_TONE, tradeLabel, escReason,
  type Locale, type StrKey,
} from "./lib";

type T = (k: StrKey) => string;

/* ------------------------------------------------------------------ */
/* trend chart — hand-rolled SVG, no charting dependency              */
/* ------------------------------------------------------------------ */

function TrendChart({ l, t, data }: { l: Locale; t: T; data: any[] }) {
  if (data.length === 0) return <p className="muted">{t("noData")}</p>;

  const max = Math.max(...data.map((d) => d.reported), 1);
  const W = 100;                      // percentage-based, scales to container
  const barW = W / data.length;

  const monthName = (bucket: string) => {
    const [y, m] = bucket.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(l === "de" ? "de-DE" : "en-GB", { month: "short" });
  };

  return (
    <div>
      <div className="chart" role="img"
        aria-label={`${t("reportedVsFixed")}: ${data.map((d) => `${d.bucket} ${d.reported}/${d.fixed}`).join(", ")}`}>
        {data.map((d) => (
          <div className="chartcol" key={d.bucket} style={{ width: `${barW}%` }}>
            <div className="barstack">
              <div className="barreported" style={{ height: `${(d.reported / max) * 100}%` }}>
                <div className="barfixed" style={{ height: `${(d.fixed / Math.max(d.reported, 1)) * 100}%` }} />
              </div>
            </div>
            <span className="chartlabel">{monthName(d.bucket)}</span>
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i className="swatch swatch-fixed" /> {t("fixed")}</span>
        <span><i className="swatch swatch-open" /> {t("stillOpen")}</span>
      </div>
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

  const load = useCallback(() => {
    setD(null); setErr("");
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
            <TrendChart l={l} t={t} data={d.trend} />
          </div>

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
