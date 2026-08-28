import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Printer, RefreshCw, Plus, AlertTriangle, X } from "lucide-react";
import { api, roomLabel, fmtDay, type Locale, type StrKey } from "./lib";

type T = (k: StrKey) => string;

/**
 * Resident access codes for one building.
 *
 * The sheet is a page of working credentials, so it sits behind a deliberate
 * click and carries a warning rather than being the default view. It is
 * re-viewable, because the alternative pushes people to screenshot it and makes
 * a lost sheet a reason to reissue a whole building.
 */
export function BuildingCodes({ l, t, building, onBack }: {
  l: Locale; t: T; building: any; onBack: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [showSheet, setShowSheet] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [semester, setSemester] = useState("");

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

  const current = data?.building?.semester;

  return (
    <div className="col">
      <button className="linkback noprint" onClick={onBack}>
        <ChevronLeft size={16} /> {t("backToDash")}
      </button>

      <div className="rowspread">
        <h2>{t("codesFor")} {building.name}</h2>
        {current && <span className="plate plate-sm">{current}</span>}
      </div>

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
            <button className="btn" disabled={!!busy} onClick={() => setRotating((v) => !v)}>
              <RefreshCw size={15} /> {t("rotateCodes")}
            </button>
          </div>

          {rotating && (
            <div className="card noprint">
              <p className="cardtitle"><AlertTriangle size={15} aria-hidden /> {t("rotateCodes")}</p>
              <p className="muted">{t("rotateWarn")}</p>
              <label className="field"><span>{t("semesterLabel")}</span>
                <input className="in mono" value={semester} placeholder="SS27" maxLength={4}
                  onChange={(e) => setSemester(e.target.value.toUpperCase())} /></label>
              <div className="row">
                <button className="btn" onClick={() => setRotating(false)}>{t("cancel")}</button>
                <button className="btn btn-warn" disabled={!/^(WS|SS)\d{2}$/.test(semester) || !!busy}
                  onClick={() => act("rot", async () => {
                    await api.rotateCodes(building.id, semester);
                    setRotating(false); setSemester(""); setShowSheet(true);
                  })}>
                  {t("rotateCodes")}
                </button>
              </div>
            </div>
          )}

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
                      <button className="linkmore noprint" disabled={!!busy}
                        onClick={() => act(c.code, () => api.regenerateCode(c.room_id))}>
                        {t("newCodeFor")}
                      </button>
                    </div>
                  ))}
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
