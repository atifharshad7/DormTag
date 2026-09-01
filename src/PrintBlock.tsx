import React, { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { type Locale, type StrKey } from "./lib";

type T = (k: StrKey) => string;

/**
 * One tile's QR, drawn for real.
 *
 * The export worked the sizing out: a version-3 code is 29 modules, plus two
 * of quiet zone makes 33 columns, and 240 ÷ 33 floors to 7px per module — so a
 * 240px backing store paints whole-pixel modules with no seams, sharp on a 3×
 * screen and at 300dpi. Displayed at 78px by the stylesheet.
 *
 * It uses the app's own `qrcode` dependency rather than the encoder bundled
 * with the export: the printed sticker sheet already relies on it, and two
 * copies of an encoder would be two things to keep in step.
 */
function TileQR({ slug, label }: { slug: string; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    QRCode.toCanvas(el, `${location.origin}/r/${slug}`, {
      margin: 2,      // the export's quiet zone for on-screen at this size
      width: 240,
      color: { dark: "#16191b", light: "#ffffff" },
    }).then(() => {
      /*
       * The encoder writes style.width and style.height onto the canvas, and an
       * inline style beats a class rule — so `.pb-qr { width: 100% }` never
       * applied and every code rendered at its 240px backing store, bursting
       * out of the card. Clearing them hands sizing back to the stylesheet.
       */
      el.style.removeProperty("width");
      el.style.removeProperty("height");
    }).catch(() => {});
  }, [slug]);

  return <canvas ref={ref} className="pb-qr" aria-label={label} />;
}

/**
 * "You print the stickers yourself."
 *
 * The codes are real and point at `/r/<slug>` in this app, so a visitor who
 * scans one lands on the actual report screen. That's the whole claim of the
 * block, and a fake code would undo it — so the slugs are seeded demo rooms
 * rather than invented ones.
 */
export function PrintBlock({ l, t, onDemo }: { l: Locale; t: T; onDemo: () => void }) {
  const de = l === "de";

  const tiles: [string, string, string][] = [
    ["b312-ba-shower", "Dusche", "Shower"],
    ["b312-ba-drain", "Abfluss", "Drain"],
    ["b312-ba-sink", "Spüle", "Sink"],
    ["b312-ba-light", "Licht", "Light"],
  ];

  return (
    <section className="pb-section">
      <div className="pb-panel">
        <div className="pb-copy">
          <h2 className="pb-heading">
            {de ? "Die Aufkleber druckst du selbst." : "You print the stickers yourself."}
          </h2>
          <p className="pb-body">
            {de
              ? "Pro Raum ein Bogen: ein Code je Objekt, dazu ein Zugangscode für Bewohner ohne Smartphone. Kleben, fertig. Keine Installation."
              : "One sheet per room: a code per fixture, plus an access code for residents without a smartphone. Stick it up and you are live. Nothing to install."}
          </p>
          <button type="button" className="pb-ghost" onClick={onDemo}>
            {de ? "Im Demo ansehen" : "See it in the demo"}
          </button>
        </div>

        <div className="pb-card">
          <div className="pb-cardhead">
            <span className="pb-overline">
              {de ? "Druckbogen · Bad" : "Print sheet · Bathroom"}
            </span>
            <span className="pb-code-sm">B-312</span>
          </div>

          <div className="pb-tiles">
            {tiles.map(([slug, nameDe, nameEn]) => (
              <div className="pb-tile" key={slug}>
                <TileQR slug={slug} label={`QR ${de ? nameDe : nameEn}`} />
                <span className="pb-tilename">{de ? nameDe : nameEn}</span>
              </div>
            ))}
          </div>

          {/* The access code sits below the tear line and never on a sticker: a
              credential on a bathroom wall is not a credential. On the printed
              sheet the operator tears this off and hands it over. */}
          <div className="pb-tear" aria-hidden />
          <div className="pb-tearrow">
            <span className="pb-tearlabel">
              {de ? "Zugangscode für das Zimmer" : "Access code for the room"}
            </span>
            <span className="pb-access">B-312 · XK4M</span>
          </div>
        </div>
      </div>
    </section>
  );
}
