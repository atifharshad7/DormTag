import React, { useState } from "react";
import { Eye, EyeOff, Check } from "lucide-react";
import { type StrKey } from "./lib";

type T = (k: StrKey) => string;

/**
 * A password input you can read back.
 *
 * Masked fields cause more lockouts than they prevent, especially on a phone
 * where you can't see what autocorrect did to what you typed. The toggle is a
 * real button with a label that changes, so it's reachable by keyboard and
 * announced properly rather than being an eye-shaped mystery.
 */
export function PasswordField({ t, label, value, onChange, autoComplete, hint }: {
  t: T; label: string; value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="pwwrap">
        <input
          className="in pwin"
          type={shown ? "text" : "password"}
          autoComplete={autoComplete ?? "new-password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="pweye" onClick={() => setShown((v) => !v)}
          aria-label={shown ? t("hidePassword") : t("showPassword")}
          aria-pressed={shown}>
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint && <span className="muted pwhint">{hint}</span>}
    </label>
  );
}

/**
 * A new password, typed twice.
 *
 * Slightly redundant once you can read what you typed, and kept anyway: not
 * everyone presses the toggle, and a password manager filling both costs
 * nothing. The mismatch shows as you type but only disables the button — a red
 * error after the first character of the second field would be nagging.
 */
export function NewPassword({ t, value, confirm, onChange, onConfirm, minLength = 10 }: {
  t: T; value: string; confirm: string;
  onChange: (v: string) => void; onConfirm: (v: string) => void;
  minLength?: number;
}) {
  const tooShort = value.length > 0 && value.length < minLength;
  const mismatch = confirm.length > 0 && confirm !== value;
  const good = value.length >= minLength && confirm === value;

  return (
    <>
      <PasswordField t={t} label={t("newPassword")} value={value}
        onChange={onChange} autoComplete="new-password" />
      <PasswordField t={t} label={t("confirmPassword")} value={confirm}
        onChange={onConfirm} autoComplete="new-password" />

      {tooShort && <p className="muted pwstate">{t("pwRule")}</p>}
      {!tooShort && mismatch && <p className="pwstate pwbad">{t("pwMismatch")}</p>}
      {good && <p className="pwstate pwok"><Check size={13} aria-hidden /> {t("pwMatch")}</p>}
      {!tooShort && !mismatch && !good && <p className="muted pwstate">{t("pwRule")}</p>}
    </>
  );
}

/** Whether a NewPassword pair is submittable. */
export const passwordsOk = (value: string, confirm: string, minLength = 10) =>
  value.length >= minLength && value === confirm;
