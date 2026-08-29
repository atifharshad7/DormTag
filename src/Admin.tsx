import React, { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft, Plus, Building, Users, Copy, Check, Ban, RotateCcw,
  Pencil, AlertTriangle,
} from "lucide-react";
import { api, roomLabel, type Locale, type StrKey } from "./lib";
import { BuildingEditForm, AddUnitForm, BulkUnitsForm } from "./BuildingEdit";
import { PasswordField, NewPassword, passwordsOk } from "./PasswordField";

type T = (k: StrKey) => string;

/* ================================================================== */
/* First-run setup: there is nobody to log in as yet                   */
/* ================================================================== */

export function FirstRunSetup({ t, onDone }: { t: T; onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    setBusy(true); setErr("");
    try { await api.bootstrap(email, name, password); await onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="col signin">
      <h2>{t("setupTitle")}</h2>
      <p className="muted">{t("setupHint")}</p>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      <label className="field"><span>{t("nameLabel")}</span>
        <input className="in" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>{t("emailLabel")}</span>
        <input className="in" type="email" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <NewPassword t={t} value={password} confirm={confirm}
        onChange={setPassword} onConfirm={setConfirm} />
      <button className="btn btn-primary btn-big"
        disabled={busy || !passwordsOk(password, confirm)} onClick={go}>
        {t("createOperator")}
      </button>
    </div>
  );
}

/* ================================================================== */
/* Accepting a setup link at /setup/:token                             */
/* ================================================================== */

export function AcceptInvite({ t, token, onDone }: { t: T; token: string; onDone: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div className="col signin">
      <h2>{t("setPassword")}</h2>
      <p className="muted">{t("setPasswordHint")}</p>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      <NewPassword t={t} value={password} confirm={confirm}
        onChange={setPassword} onConfirm={setConfirm} />
      <button className="btn btn-primary btn-big"
        disabled={busy || !passwordsOk(password, confirm)}
        onClick={async () => {
          setBusy(true); setErr("");
          try { await api.acceptInvite(token, password); await onDone(); }
          catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }}>
        {t("signInBtn")}
      </button>
    </div>
  );
}

/* ================================================================== */
/* Forgot and reset                                                    */
/* ================================================================== */

export function ForgotPassword({ t, onBack }: { t: T; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <div className="col signin">
      <button className="linkback" onClick={onBack}>
        <ChevronLeft size={16} /> {t("backToSignIn")}
      </button>
      <h2>{t("forgotTitle")}</h2>

      {sent ? (
        // The same message whether or not the account exists: otherwise this
        // form becomes a way to discover who has one.
        <div className="flash">{t("forgotSent")}</div>
      ) : (
        <>
          <p className="muted">{t("forgotHint")}</p>
          <label className="field"><span>{t("emailLabel")}</span>
            <input className="in" type="email" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email.includes("@") && setBusy(true)} /></label>
          <button className="btn btn-primary btn-big" disabled={busy || !email.includes("@")}
            onClick={async () => {
              setBusy(true);
              try { await api.forgotPassword(email); } catch { /* same answer either way */ }
              setSent(true); setBusy(false);
            }}>
            {t("sendLink")}
          </button>
        </>
      )}
    </div>
  );
}

export function ResetPassword({ t, token, onDone }: {
  t: T; token: string; onDone: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div className="col signin">
      <h2>{t("forgotTitle")}</h2>
      <p className="muted">{t("signedOutElse")}</p>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      <NewPassword t={t} value={password} confirm={confirm}
        onChange={setPassword} onConfirm={setConfirm} />
      <button className="btn btn-primary btn-big"
        disabled={busy || !passwordsOk(password, confirm)}
        onClick={async () => {
          setBusy(true); setErr("");
          try { await api.resetPassword(token, password); await onDone(); }
          catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }}>
        {t("signInBtn")}
      </button>
    </div>
  );
}

/** Change your own password. Requires the current one, on purpose. */
export function ChangePassword({ t, onBack }: { t: T; onBack: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  return (
    <div className="col">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("backToApp")}</button>
      <h2>{t("changePassword")}</h2>
      {done && <div className="flash">{t("passwordChanged")} · {t("signedOutElse")}</div>}
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      <PasswordField t={t} label={t("currentPassword")} value={current}
        onChange={setCurrent} autoComplete="current-password" />
      <NewPassword t={t} value={next} confirm={confirm}
        onChange={setNext} onConfirm={setConfirm} />
      <button className="btn btn-primary"
        disabled={busy || !current || !passwordsOk(next, confirm)}
        onClick={async () => {
          setBusy(true); setErr(""); setDone(false);
          try {
            await api.changePassword(current, next);
            setCurrent(""); setNext(""); setConfirm(""); setDone(true);
          } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }}>
        {t("changePassword")}
      </button>
    </div>
  );
}

/* ================================================================== */
/* Buildings and staff, each its own page                              */
/* ================================================================== */

function CopyLink({ t, token }: { t: T; token: string }) {
  const [done, setDone] = useState(false);
  const url = `${location.origin}/setup/${token}`;
  return (
    <div className="card demo">
      <p className="cardtitle">{t("setupLink")}</p>
      <p className="mono breakall">{url}</p>
      <p className="muted">{t("setupLinkHint")}</p>
      <button className="btn" onClick={async () => {
        try { await navigator.clipboard.writeText(url); setDone(true); } catch { /* ignore */ }
      }}>
        {done ? <><Check size={16} /> {t("copied")}</> : <><Copy size={16} /> {t("copyLink")}</>}
      </button>
    </div>
  );
}

export function BuildingsPage({ l, t, onBack, openCode, onOpen }: {
  l: Locale; t: T; onBack?: () => void;
  /* Which building is open comes from the URL, so /buildings/A is its own page
     and back collapses it rather than leaving the app. */
  openCode?: string | null;
  onOpen?: (code: string | null) => void;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [count, setCount] = useState("");


  const load = useCallback(() => {
    api.adminBuildings().then((d) => setRows(d.buildings)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (openCode) {
    const b = rows?.find((x) => x.code === openCode);
    if (!rows) return <p className="muted">…</p>;
    if (!b) return <div className="err">{t("noData")}</div>;
    return <BuildingDetail l={l} t={t} building={b} onBack={() => onOpen?.(null)} />;
  }

  return (
    <div className="col">
      {onBack && (
        <button className="linkback" onClick={onBack}>
          <ChevronLeft size={16} /> {t("backToApp")}
        </button>
      )}
      <div className="rowspread">
        <h2>{t("buildings")}</h2>
        {/* Add building belongs here, not behind Staff. */}
        <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> {t("addBuilding")}
        </button>
      </div>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}

      {adding && (
        <div className="card">
          <label className="field"><span>{t("buildingCode")}</span>
            <input className="in mono" value={code} maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="A" /></label>
          <p className="muted">{t("codeFixedHint")}</p>
          <label className="field"><span>{t("buildingName")}</span>
            <input className="in" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Haus A" /></label>
          <label className="field"><span>{t("roomCount")}</span>
            <input className="in" type="number" value={count}
              onChange={(e) => setCount(e.target.value)} /></label>
          <div className="row">
            <button className="btn" onClick={() => setAdding(false)}>{t("cancel")}</button>
            <button className="btn btn-primary" disabled={!code || !name}
              onClick={async () => {
                setErr("");
                try {
                  await api.createBuilding(code, name, Number(count) || 0);
                  setCode(""); setName(""); setCount(""); setAdding(false); load();
                } catch (e: any) { setErr(e.message); }
              }}>{t("create")}</button>
          </div>
        </div>
      )}

      {!rows && !err && <p className="muted">…</p>}
      {rows?.length === 0 && <div className="empty"><p className="muted">{t("noBuildings")}</p></div>}

      {rows?.map((b) => (
        <button className="card cardlink" key={b.id} onClick={() => onOpen?.(b.code)}>
          <div className="rowspread">
            <p className="cardtitle">{b.name}</p>
            <span className="plate plate-sm">{b.code}</span>
          </div>
          <p className="muted mono">
            {b.units} {t("unitsWord")} · {b.rooms} {t("roomsWord")} · {b.room_count} {t("plannedWord")}
          </p>
          {b.caretakers.length === 0
            ? <p className="muted warnline"><AlertTriangle size={13} /> {t("noCaretaker")}</p>
            : <p className="muted">{b.caretakers.map((c: any) => c.name).join(", ")}</p>}
        </button>
      ))}
    </div>
  );
}

function BuildingDetail({ l, t, building, onBack }: any) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"idle" | "edit" | "unit" | "bulk">("idle");
  const [editRoom, setEditRoom] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  const load = useCallback(() => {
    api.adminUnits(building.id).then(setData).catch((e) => setErr(e.message));
  }, [building.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="col">
      <button className="linkback" onClick={onBack}><ChevronLeft size={16} /> {t("backToDash")}</button>
      <div className="rowspread">
        <h2>{building.name}</h2>
        <span className="plate plate-sm">{building.code}</span>
      </div>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}

      {mode === "idle" && (
        <div className="row">
          <button className="btn" onClick={() => setMode("edit")}>
            <Pencil size={15} /> {t("editBuilding")}
          </button>
          <button className="btn btn-primary" onClick={() => setMode("bulk")}>
            <Plus size={16} /> {t("addManyUnits")}
          </button>
          <button className="btn" onClick={() => setMode("unit")}>
            {t("addUnit")}
          </button>
        </div>
      )}

      {mode === "edit" && (
        <div className="card">
          <BuildingEditForm l={l} t={t} building={building}
            onDone={() => { setMode("idle"); load(); }} onCancel={() => setMode("idle")} />
        </div>
      )}
      {mode === "unit" && (
        <div className="card">
          <AddUnitForm l={l} t={t} building={building}
            onDone={() => { setMode("idle"); load(); }} onCancel={() => setMode("idle")} />
        </div>
      )}
      {mode === "bulk" && (
        <div className="card">
          <BulkUnitsForm l={l} t={t} building={building}
            onDone={() => { setMode("idle"); load(); }} onCancel={() => setMode("idle")} />
        </div>
      )}

      {!data && !err && <p className="muted">…</p>}
      {data?.units.length === 0 && <div className="empty"><p className="muted">{t("noUnits")}</p></div>}

      {data?.units.map((u: any) => (
        <div className="card" key={u.id}>
          <div className="rowspread">
            <span className="plate plate-sm">{building.code}-{u.code}</span>
            <span className="muted mono">
              {t("floorShort")}{u.floor} · {u.kind === "wg" ? t("wg") : t("studio")}
              {u.is_common ? ` · ${t("commonShort")}` : ""}
            </span>
          </div>
          {u.rooms.map((r: any) => (
            <div className="unitroom" key={r.id}>
              <span className="mono">{r.code}</span>
              <span>{r.label || roomLabel(r.room_type, l)}</span>
              <span className="muted mono">{r.qr_slug}</span>
              {editRoom === r.id ? (
                <div className="row">
                  <input className="in" value={labelDraft} maxLength={40}
                    placeholder={roomLabel(r.room_type, l)}
                    onChange={(e) => setLabelDraft(e.target.value)} />
                  <button className="btn" onClick={async () => {
                    try { await api.setRoomLabel(r.id, labelDraft); setEditRoom(null); load(); }
                    catch (e: any) { setErr(e.message); }
                  }}><Check size={15} /></button>
                </div>
              ) : (
                <button className="offerx" aria-label={t("renameRoom")}
                  onClick={() => { setEditRoom(r.id); setLabelDraft(r.label || ""); }}>
                  <Pencil size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Staff({ l, t, me }: { l: Locale; t: T; me: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isOp, setIsOp] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPicked, setEditPicked] = useState<string[]>([]);

  const load = useCallback(() => {
    api.adminStaff().then((d) => setRows(d.staff)).catch((e) => setErr(e.message));
    api.adminBuildings().then((d) => setBuildings(d.buildings)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  return (
    <div className="col">
      <div className="rowspread">
        <h2>{t("staffWord")}</h2>
        <button className="btn btn-primary" onClick={() => { setAdding((v) => !v); setToken(null); }}>
          <Plus size={16} /> {t("addStaff")}
        </button>
      </div>
      {err && <div className="err" onClick={() => setErr("")}>{err}</div>}
      {token && <CopyLink t={t} token={token} />}

      {adding && (
        <div className="card">
          <label className="field"><span>{t("nameLabel")}</span>
            <input className="in" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>{t("emailLabel")}</span>
            <input className="in" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} /></label>
          <div className="tabs">
            <button className={"tab" + (!isOp ? " tab-on" : "")} onClick={() => setIsOp(false)}>
              {t("staff")}
            </button>
            <button className={"tab" + (isOp ? " tab-on" : "")} onClick={() => setIsOp(true)}>
              {t("operator")}
            </button>
          </div>
          {!isOp && (
            <>
              <p className="steplabel">{t("coversWhich")}</p>
              {buildings.map((b) => (
                <button key={b.id} className="consent" onClick={() => setPicked((a) => toggle(a, b.id))}>
                  <span>{b.name}</span>
                  <span className={"pill pill-" + (picked.includes(b.id) ? "info" : "neutral")}>
                    {picked.includes(b.id) ? t("yes") : t("no")}
                  </span>
                </button>
              ))}
            </>
          )}
          <div className="row">
            <button className="btn" onClick={() => setAdding(false)}>{t("cancel")}</button>
            <button className="btn btn-primary" disabled={!name || !email}
              onClick={async () => {
                setErr("");
                try {
                  const r = await api.createStaff(email, name, isOp, picked);
                  setToken(r.setupToken); setName(""); setEmail("");
                  setPicked([]); setAdding(false); load();
                } catch (e: any) { setErr(e.message); }
              }}>{t("create")}</button>
          </div>
        </div>
      )}

      {!rows && !err && <p className="muted">…</p>}

      {rows?.map((s) => (
        <div className={"card" + (s.disabled_at ? " cardmuted" : "")} key={s.id}>
          <div className="rowspread">
            <p className="cardtitle">{s.display_name}</p>
            <span className={"pill pill-" + (s.is_operator ? "info" : "neutral")}>
              {s.is_operator ? t("operator") : t("staff")}
            </span>
          </div>
          <p className="muted mono">{s.email}</p>
          {!s.has_password && <p className="muted"><AlertTriangle size={13} /> {t("neverSignedIn")}</p>}
          {s.disabled_at && <p className="muted"><Ban size={13} /> {t("disabledWord")}</p>}

          {!s.is_operator && !s.disabled_at && (
            editing === s.id ? (
              <>
                <p className="steplabel">{t("coversWhich")}</p>
                {buildings.map((b) => (
                  <button key={b.id} className="consent"
                    onClick={() => setEditPicked((a) => toggle(a, b.id))}>
                    <span>{b.name}</span>
                    <span className={"pill pill-" + (editPicked.includes(b.id) ? "info" : "neutral")}>
                      {editPicked.includes(b.id) ? t("yes") : t("no")}
                    </span>
                  </button>
                ))}
                <div className="row">
                  <button className="btn" onClick={() => setEditing(null)}>{t("cancel")}</button>
                  <button className="btn btn-primary" onClick={async () => {
                    setErr("");
                    try { await api.setStaffBuildings(s.id, editPicked); setEditing(null); load(); }
                    catch (e: any) { setErr(e.message); }
                  }}>{t("save")}</button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  {s.buildings.length === 0
                    ? t("noBuildingsAssigned")
                    : s.buildings.map((b: any) => b.name).join(", ")}
                </p>
                <button className="btn" onClick={() => {
                  setEditing(s.id); setEditPicked(s.buildings.map((b: any) => b.id));
                }}>{t("editCoverage")}</button>
              </>
            )
          )}

          <div className="row">
            {!s.disabled_at && (
              <button className="btn" onClick={async () => {
                setErr("");
                try { const r = await api.inviteStaff(s.id); setToken(r.setupToken); }
                catch (e: any) { setErr(e.message); }
              }}>{t("newSetupLink")}</button>
            )}
            {s.id !== me && (s.disabled_at ? (
              <button className="btn" onClick={async () => {
                setErr("");
                try { await api.enableStaff(s.id); load(); } catch (e: any) { setErr(e.message); }
              }}><RotateCcw size={15} /> {t("enableWord")}</button>
            ) : (
              <button className="btn btn-warn" onClick={async () => {
                setErr("");
                try { await api.disableStaff(s.id); load(); } catch (e: any) { setErr(e.message); }
              }}><Ban size={15} /> {t("disableWord")}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Staff, on its own page.
 *
 * This was one tab of a Manage screen whose other tab was Buildings. Both are
 * destinations in the operator's left panel now, so the wrapper was a third
 * route to the same forms — and it left "Add building" sitting behind Staff,
 * which is where nobody would look for it.
 */
export function StaffPage({ l, t, me, onBack }: {
  l: Locale; t: T; me: string; onBack: () => void;
}) {
  return (
    <div className="col">
      <button className="linkback" onClick={onBack}>
        <ChevronLeft size={16} /> {t("backToApp")}
      </button>
      <Staff l={l} t={t} me={me} />
    </div>
  );
}
