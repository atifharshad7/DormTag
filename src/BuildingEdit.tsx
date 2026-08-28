import React, { useEffect, useState } from "react";
import { Plus, Check, X, Pencil, AlertTriangle, Users, Printer, KeyRound, Layers } from "lucide-react";
import { api, roomLabel, type Locale, type StrKey } from "./lib";

type T = (k: StrKey) => string;

/**
 * Shared building editing.
 *
 * Lives in its own file because two screens use it: the operator dashboard,
 * where you're already looking at the building, and the settings list, for
 * setting an estate up from scratch. Duplicating it would let them drift.
 */

/** Rename, room count, and who covers it. */
export function BuildingEditForm({ l, t, building, onDone, onCancel }: {
  l: Locale; t: T; building: any; onDone: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(building.name);
  const [count, setCount] = useState(String(building.room_count ?? 0));
  const [caretakers, setCaretakers] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.adminStaff()
      .then((d) => {
        const cs = d.staff.filter((s: any) => !s.is_operator && !s.disabled_at);
        setCaretakers(cs);
        setPicked(cs.filter((s: any) => s.buildings.some((b: any) => b.id === building.id))
          .map((s: any) => s.id));
      })
      .catch(() => {});
  }, [building.id]);

  const toggle = (id: string) =>
    setPicked((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id]);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      await api.updateBuilding(building.id, name, Number(count) || 0);
      // Assignment is stored per caretaker, so a building's coverage is applied
      // by replacing each affected caretaker's building list.
      for (const c of caretakers) {
        const has = c.buildings.some((b: any) => b.id === building.id);
        const want = picked.includes(c.id);
        if (has === want) continue;
        const ids = c.buildings.map((b: any) => b.id).filter((x: string) => x !== building.id);
        if (want) ids.push(building.id);
        await api.setStaffBuildings(c.id, ids);
      }
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="col" style={{ gap: 8 }}>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      <label className="field"><span>{t("buildingName")}</span>
        <input className="in" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>{t("roomCount")}</span>
        <input className="in" type="number" value={count}
          onChange={(e) => setCount(e.target.value)} /></label>
      <p className="muted mono">{t("buildingCode")}: {building.code} · {t("codeFixedShort")}</p>

      <p className="steplabel">{t("coveredBy")}</p>
      {caretakers.length === 0 && <p className="muted">{t("noCaretakersYet")}</p>}
      {caretakers.map((c) => (
        <button key={c.id} className="consent" onClick={() => toggle(c.id)}>
          <span>{c.display_name}</span>
          <span className={"pill pill-" + (picked.includes(c.id) ? "info" : "neutral")}>
            {picked.includes(c.id) ? t("yes") : t("no")}
          </span>
        </button>
      ))}

      <div className="row">
        <button className="btn" onClick={onCancel}>{t("cancel")}</button>
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={save}>
          <Check size={16} /> {t("save")}
        </button>
      </div>
    </div>
  );
}

/** Add a unit and its rooms. The room type stays a code; the label is optional. */
export function AddUnitForm({ l, t, building, onDone, onCancel }: {
  l: Locale; t: T; building: any; onDone: () => void; onCancel: () => void;
}) {
  const [vocab, setVocab] = useState<any>(null);
  const [code, setCode] = useState("");
  const [floor, setFloor] = useState("1");
  const [kind, setKind] = useState<"studio" | "wg">("studio");
  const [isCommon, setIsCommon] = useState(false);
  const [rooms, setRooms] = useState([
    { code: "Z1", roomType: "BEDROOM", kind: "private" },
    { code: "BA", roomType: "BATHROOM", kind: "private" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api.adminVocabulary().then(setVocab).catch(() => {}); }, []);

  return (
    <div className="col" style={{ gap: 8 }}>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>{t("unitCode")}</span>
          <input className="in mono" value={code} maxLength={8} placeholder="112"
            onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
        <label className="field" style={{ flex: 1 }}><span>{t("floorLabel")}</span>
          <input className="in" type="number" value={floor}
            onChange={(e) => setFloor(e.target.value)} /></label>
      </div>

      <div className="tabs">
        <button className={"tab" + (kind === "studio" ? " tab-on" : "")}
          onClick={() => setKind("studio")}>{t("studio")}</button>
        <button className={"tab" + (kind === "wg" ? " tab-on" : "")}
          onClick={() => setKind("wg")}>{t("wg")}</button>
      </div>
      <button className="consent" onClick={() => setIsCommon((v) => !v)}>
        <span>{t("isCommonArea")}</span>
        <span className={"pill pill-" + (isCommon ? "info" : "neutral")}>
          {isCommon ? t("yes") : t("no")}
        </span>
      </button>

      <p className="steplabel">{t("roomsInUnit")}</p>
      {rooms.map((r, i) => (
        <div className="row roomrowedit" key={i}>
          <input className="in mono roomcodein" value={r.code} maxLength={6} placeholder="Z1"
            onChange={(e) => setRooms((rs) => rs.map((x, j) =>
              j === i ? { ...x, code: e.target.value.toUpperCase() } : x))} />
          <select className="in" value={r.roomType}
            onChange={(e) => setRooms((rs) => rs.map((x, j) =>
              j === i ? { ...x, roomType: e.target.value } : x))}>
            {(vocab?.roomTypes ?? []).map((rt: string) =>
              <option key={rt} value={rt}>{roomLabel(rt, l)}</option>)}
          </select>
          <select className="in" value={r.kind}
            onChange={(e) => setRooms((rs) => rs.map((x, j) =>
              j === i ? { ...x, kind: e.target.value } : x))}>
            <option value="private">{t("privateRoom")}</option>
            <option value="shared">{t("sharedTag")}</option>
          </select>
          <button className="offerx" aria-label={t("cancel")}
            onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="linkmore" onClick={() =>
        setRooms((r) => [...r, { code: "", roomType: "BEDROOM", kind: "private" }])}>
        + {t("addRoom")}
      </button>

      <div className="row">
        <button className="btn" onClick={onCancel}>{t("cancel")}</button>
        <button className="btn btn-primary" disabled={busy || !code || rooms.length === 0}
          onClick={async () => {
            setBusy(true); setErr("");
            try {
              await api.createUnit(building.id, {
                code, floor: Number(floor) || 0, kind, isCommon, rooms,
              });
              onDone();
            } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
          }}>{t("create")}</button>
      </div>
    </div>
  );
}

/**
 * A building card on the dashboard.
 *
 * Tapping the card filters the dashboard, as before. Editing is behind a pencil
 * so a mis-tap while reading the numbers can't rename a building.
 */
export function BuildingCard({ l, t, b, active, onFilter, onChanged, showUnits }: {
  l: Locale; t: T; b: any; active: boolean;
  onFilter: () => void; onChanged: () => void;
  /** Only on the Buildings page: the dashboard card is a summary, not a menu. */
  showUnits?: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "unit" | "bulk">("idle");
  const load = Math.min(100, Math.round(((b.open_count ?? 0) / 20) * 100));

  if (mode !== "idle") {
    return (
      <div className="card cardediting">
        <div className="rowspread">
            <p className="cardtitle">
            {mode === "edit" ? b.name : mode === "bulk" ? t("addManyUnits") : t("addUnit")}
          </p>
          <button className="iconbtn" onClick={() => setMode("idle")} aria-label={t("cancel")}>
            <X size={16} />
          </button>
        </div>
        {mode === "edit" ? (
          <BuildingEditForm l={l} t={t} building={b}
            onDone={() => { setMode("idle"); onChanged(); }} onCancel={() => setMode("idle")} />
        ) : mode === "bulk" ? (
          <BulkUnitsForm l={l} t={t} building={b}
            onDone={() => { setMode("idle"); onChanged(); }} onCancel={() => setMode("idle")} />
        ) : (
          <AddUnitForm l={l} t={t} building={b}
            onDone={() => { setMode("idle"); onChanged(); }} onCancel={() => setMode("idle")} />
        )}
      </div>
    );
  }

  return (
    <div className={"card" + (active ? " cardactive" : "")}>
      <div className="rowspread">
        <button className="cardnamebtn" onClick={onFilter}>{b.name}</button>
        <div className="row">
          <span className="plate plate-sm">{b.code}</span>
          <button className="iconbtn" onClick={() => setMode("edit")} aria-label={t("editBuilding")}>
            <Pencil size={14} />
          </button>
        </div>
      </div>

      <p className="muted mono">
        {b.room_count} {t("roomsWord")} · {b.open_count} {t("openWord")}
      </p>
      <div className="bar">
        <div className={"barfill" + (load > 50 ? " barfill-warn" : "")} style={{ width: load + "%" }} />
      </div>

      {b.caretakers?.length
        ? <p className="muted"><Users size={13} aria-hidden /> {b.caretakers.map((c: any) => c.name).join(", ")}</p>
        : <p className="muted warnline"><AlertTriangle size={13} aria-hidden /> {t("noCaretaker")}</p>}

      {/* The card used to carry Add unit, Add many units, Print stickers and
          Access codes. All four are destinations in the left panel now, so this
          is a summary again and tapping it filters the dashboard. */}
      {showUnits && (
        <div className="row cardactions">
          <button className="linkmore" onClick={() => setMode("unit")}>
            <Plus size={13} aria-hidden /> {t("addUnit")}
          </button>
          <button className="linkmore" onClick={() => setMode("bulk")}>
            <Layers size={13} aria-hidden /> {t("addManyUnits")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Create a whole building from its pattern.
 *
 * Student halls are usually built to a repeating plan, so the operator describes
 * it once. A preview comes first, deliberately: getting the numbering wrong and
 * creating forty wrong units is much worse than one wrong unit.
 */
export function BulkUnitsForm({ l, t, building, onDone, onCancel }: {
  l: Locale; t: T; building: any; onDone: () => void; onCancel: () => void;
}) {
  const [floorFrom, setFloorFrom] = useState("1");
  const [floorTo, setFloorTo] = useState("5");
  const [perFloor, setPerFloor] = useState("8");
  const [numbering, setNumbering] = useState<"floor" | "sequential">("floor");
  const [layout, setLayout] = useState<"studio" | "wg">("studio");
  const [bedrooms, setBedrooms] = useState("4");
  const [commonPerFloor, setCommonPerFloor] = useState(true);

  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const spec = () => ({
    floorFrom: Number(floorFrom), floorTo: Number(floorTo),
    unitsPerFloor: Number(perFloor), numbering, layout,
    bedrooms: Number(bedrooms), commonPerFloor,
  });

  const look = async () => {
    setBusy(true); setErr(""); setPreview(null);
    try { setPreview(await api.bulkUnits(building.id, { ...spec(), dryRun: true })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="col" style={{ gap: 8 }}>
      <p className="muted">{t("bulkHint")}</p>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}

      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>{t("floorsFrom")}</span>
          <input className="in" type="number" value={floorFrom}
            onChange={(e) => { setFloorFrom(e.target.value); setPreview(null); }} /></label>
        <label className="field" style={{ flex: 1 }}><span>{t("floorsTo")}</span>
          <input className="in" type="number" value={floorTo}
            onChange={(e) => { setFloorTo(e.target.value); setPreview(null); }} /></label>
        <label className="field" style={{ flex: 1 }}><span>{t("perFloor")}</span>
          <input className="in" type="number" value={perFloor}
            onChange={(e) => { setPerFloor(e.target.value); setPreview(null); }} /></label>
      </div>

      <p className="steplabel">{t("numbering")}</p>
      <div className="tabs">
        <button className={"tab" + (numbering === "floor" ? " tab-on" : "")}
          onClick={() => { setNumbering("floor"); setPreview(null); }}>{t("numberByFloor")}</button>
        <button className={"tab" + (numbering === "sequential" ? " tab-on" : "")}
          onClick={() => { setNumbering("sequential"); setPreview(null); }}>{t("numberSeq")}</button>
      </div>

      <p className="steplabel">{t("layoutWord")}</p>
      <div className="tabs">
        <button className={"tab" + (layout === "studio" ? " tab-on" : "")}
          onClick={() => { setLayout("studio"); setPreview(null); }}>{t("studio")}</button>
        <button className={"tab" + (layout === "wg" ? " tab-on" : "")}
          onClick={() => { setLayout("wg"); setPreview(null); }}>{t("wg")}</button>
      </div>

      {layout === "wg" && (
        <label className="field"><span>{t("bedroomsWord")}</span>
          <input className="in" type="number" value={bedrooms}
            onChange={(e) => { setBedrooms(e.target.value); setPreview(null); }} /></label>
      )}

      <button className="consent" onClick={() => { setCommonPerFloor((v) => !v); setPreview(null); }}>
        <span>{t("commonEachFloor")}</span>
        <span className={"pill pill-" + (commonPerFloor ? "info" : "neutral")}>
          {commonPerFloor ? t("yes") : t("no")}
        </span>
      </button>

      {preview && (
        <div className="card">
          <p className="cardtitle">{t("previewWord")}</p>
          <p className="mono">
            {preview.first.join(", ")}
            {preview.last.length > 0 && preview.totals.units > 6
              ? ` … ${preview.last.join(", ")}` : ""}
          </p>
          <p className="muted mono">
            {preview.totals.units} {t("unitsWillBe")} ·
            {" "}{preview.totals.rooms} {t("roomsWillBe")} ·
            {" "}{preview.totals.objects} {t("objectsWillBe")}
          </p>
          <p className="muted mono">{preview.roomCodes.join(" · ")}</p>
          {preview.totals.skipped > 0 && (
            <p className="muted warnline">
              <AlertTriangle size={13} aria-hidden /> {preview.totals.skipped} {t("skippedExisting")}
              {preview.skipped.length > 0 && `: ${preview.skipped.join(", ")}`}
            </p>
          )}
        </div>
      )}

      <div className="row">
        <button className="btn" onClick={onCancel}>{t("cancel")}</button>
        {preview ? (
          <button className="btn btn-primary" disabled={busy || preview.totals.units === 0}
            onClick={async () => {
              setBusy(true); setErr("");
              try { await api.bulkUnits(building.id, spec()); onDone(); }
              catch (e: any) { setErr(e.message); } finally { setBusy(false); }
            }}>
            {busy ? t("workingOnIt") : `${t("createThem")} (${preview.totals.units})`}
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={look}>
            {t("previewWord")}
          </button>
        )}
      </div>
    </div>
  );
}
