import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Printer, RefreshCw, Plus, AlertTriangle, X, UserPlus, Clock } from "lucide-react";
import { api, fmtDay, type Locale, type StrKey } from "./lib";

type T = (k: StrKey) => string;

/**
 * Resident access codes for one building.
 *
 * The code is opaque: nothing in it says which room it opens or when it was
 * issued. The date is a column on the sheet instead, because students stay in
 * the same room for years and a four-year-old code is long-standing rather than
 * stale.
 *
 * Turnover is per room, which is how it actually happens: somebody hands back
 * their keys, the operator issues one new code and prints one slip.
 */
export function BuildingCodes({ l, t, building, onBack }: {
  l: Locale; t: T; building: any; onBack: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [showSheet, setShowSheet] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [turnover, setTurnover] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, any[] | "loading">>({});
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    api.buildingCodes(building.id).then(setData).catch((e) => setErr(e.message));
  }, [building.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setErr("");
    try { await fn(); load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(""); }
  };

  return (
    <div className="col">
      <button className="linkback noprint" onClick={onBack}>
        <ChevronLeft size={16} /> {t("backToDash")}
      </button>

      <h2>{t("codesFor")} {building.name}</h2>

      {err && <div className="err noprint" onClick={() => setErr("")}>{err}</div>}
      {!data && !err && <p className="muted">…</p>}

      {data && (
        <>
          <p className="muted noprint">
            {data.codes.length} {t("codesIssued")}
            {data.withoutCode > 0 && ` · ${data.withoutCode} ${t("withoutCode")}`}
          </p>

          <div className="row noprint">
            {data.withoutCode > 0 ? (
              <button className="btn btn-primary" disabled={!!busy}
                onClick={() => act("gen", () => api.generateCodes(building.id))}>
                <Plus size={16} /> {t("generateCodes")} ({data.withoutCode})
              </button>
            ) : (
              <p className="muted">{t("noneMissing")}</p>
            )}
          </div>

          {data.codes.length > 0 && (
            showSheet ? (
              <>
                <div className="rowspread noprint">
                  <p className="muted warnline">
                    <AlertTriangle size={13} aria-hidden /> {t("codeWarn")}
                  </p>
                  <div className="row">
                    <button className="iconbtn" onClick={() => setShowSheet(false)}
                      aria-label={t("close")}><X size={17} /></button>
                    <button className="btn" onClick={() => window.print()}>
                      <Printer size={16} /> {t("printCodes")}
                    </button>
                  </div>
                </div>

                <div className="codesheet">
                  {data.codes.map((c: any) => (
                    <div className="coderow" key={c.code}>
                      <span className="codeplate">
                        {data.building.code}-{c.unit_code} · {c.label || c.room_code}
                      </span>
                      <span className="codeval mono">{c.code}</span>
                      <span className="muted mono codewhen">
                        {t("issuedOn")} {c.issued_at ? fmtDay(c.issued_at, l) : "–"}
                        {!c.activated_at && ` · ${t("neverUsed")}`}
                      </span>
                      {turnover === c.room_id ? (
                        <div className="col noprint" style={{ gap: 6, width: "100%" }}>
                          <p className="muted">{t("turnoverHint")}</p>
                          <input className="in" value={note} placeholder={t("turnoverNote")}
                            maxLength={80} onChange={(e) => setNote(e.target.value)} />
                          <div className="row">
                            <button className="btn" onClick={() => { setTurnover(null); setNote(""); }}>
                              {t("cancel")}
                            </button>
                            <button className="btn btn-warn" disabled={!!busy}
                              onClick={() => act(c.code, async () => {
                                await api.turnoverRoom(c.room_id, note);
                                setTurnover(null); setNote("");
                              })}>
                              <UserPlus size={15} /> {t("turnoverWord")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="row noprint coderowacts">
                          <button className="linkmore"
                            onClick={() => { setTurnover(c.room_id); setNote(""); }}>
                            {t("turnoverWord")}
                          </button>
                          {/* Dates and the handover note, never the old code
                              strings: a revoked code has no legitimate use. */}
                          <button className="linkmore" onClick={async () => {
                            if (history[c.room_id]) {
                              setHistory((h) => { const n = { ...h }; delete n[c.room_id]; return n; });
                              return;
                            }
                            setHistory((h) => ({ ...h, [c.room_id]: "loading" }));
                            try {
                              const r = await api.roomHistory(c.room_id);
                              setHistory((h) => ({ ...h, [c.room_id]: r.history }));
                            } catch (e: any) {
                              setErr(e.message);
                              setHistory((h) => { const n = { ...h }; delete n[c.room_id]; return n; });
                            }
                          }}>
                            <Clock size={13} aria-hidden />
                            {history[c.room_id] ? t("hideHistory") : t("historyWord")}
                          </button>
                        </div>
                      )}

                      {history[c.room_id] && (
                        <div className="codehistory noprint">
                          {history[c.room_id] === "loading" ? (
                            <p className="muted">…</p>
                          ) : (history[c.room_id] as any[]).length <= 1 ? (
                            <p className="muted">{t("noHistoryYet")}</p>
                          ) : (
                            (history[c.room_id] as any[]).map((h, i) => (
                              <p className="muted mono histrow" key={i}>
                                {h.issued_at ? fmtDay(h.issued_at, l) : "–"}
                                {" → "}
                                {h.ends_on ? fmtDay(h.ends_on, l) : t("currentHolder")}
                                {!h.was_used && ` · ${t("neverUsed")}`}
                                {h.note && ` · ${h.note}`}
                              </p>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="noprint" style={{ marginTop: 14 }}>
                  {reissuing ? (
                    <div className="card">
                      <p className="cardtitle">
                        <AlertTriangle size={15} aria-hidden /> {t("reissueAll")}
                      </p>
                      <p className="muted">{t("reissueWarn")}</p>
                      <div className="row">
                        <button className="btn" onClick={() => setReissuing(false)}>{t("cancel")}</button>
                        <button className="btn btn-warn" disabled={!!busy}
                          onClick={() => act("all", async () => {
                            await api.reissueAll(building.id);
                            setReissuing(false);
                          })}>
                          {t("reissueAll")} ({data.codes.length})
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="linkmore" onClick={() => setReissuing(true)}>
                      <RefreshCw size={13} aria-hidden /> {t("reissueAll")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <button className="btn noprint" onClick={() => setShowSheet(true)}>
                <Printer size={16} /> {t("accessCodes")} ({data.codes.length})
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}
