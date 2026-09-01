import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X, AlertTriangle } from "lucide-react";
import type { Locale, StrKey } from "./lib";

type T = (k: StrKey) => string;

/**
 * QR scanning inside the app.
 *
 * Residents don't need this — a phone's built-in camera reads the sticker and
 * opens the URL with no install and no permission prompt. This is for staff
 * walking a building who want to pull up a fixture's history on the spot.
 *
 * Two decoders: the native BarcodeDetector where it exists (Chrome, Android),
 * and jsQR as a fallback (Safari, Firefox). Camera access requires a secure
 * context, so this only works over HTTPS or on localhost.
 */

type Status = "idle" | "starting" | "scanning" | "denied" | "insecure" | "nocamera" | "error";

declare global {
  interface Window { BarcodeDetector?: any }
}

export function ScannerModal({ t, onClose, onFound }: {
  t: T; onClose: () => void; onFound: (slug: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [detail, setDetail] = useState("");

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  /** Accept a full DormTag URL or a bare slug. Ignore anything else. */
  const extractSlug = (text: string): string | null => {
    const trimmed = text.trim();
    const byUrl = trimmed.match(/\/r\/([A-Za-z0-9_-]+)/);
    if (byUrl) return byUrl[1];
    return /^[a-z0-9-]{4,}$/i.test(trimmed) ? trimmed : null;
  };

  const handleText = (text: string) => {
    if (doneRef.current) return;
    const slug = extractSlug(text);
    if (!slug) return;
    doneRef.current = true;
    stop();
    onFound(slug);
  };

  const start = useCallback(async () => {
    doneRef.current = false;
    setDetail("");

    if (!window.isSecureContext) { setStatus("insecure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("nocamera"); return; }

    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStatus("scanning");

      const detector = window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ["qr_code"] })
        : null;

      let jsQR: any = null;
      if (!detector) {
        const mod = await import("jsqr");
        jsQR = mod.default;
      }

      const tick = async () => {
        if (doneRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          try {
            if (detector) {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) handleText(codes[0].rawValue);
            } else if (jsQR) {
              const c = canvasRef.current!;
              const w = video.videoWidth, h = video.videoHeight;
              if (w && h) {
                c.width = w; c.height = h;
                const ctx = c.getContext("2d", { willReadFrequently: true })!;
                ctx.drawImage(video, 0, 0, w, h);
                const img = ctx.getImageData(0, 0, w, h);
                const hit = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
                if (hit?.data) handleText(hit.data);
              }
            }
          } catch { /* keep scanning */ }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      if (e?.name === "NotAllowedError") setStatus("denied");
      else if (e?.name === "NotFoundError") setStatus("nocamera");
      else { setStatus("error"); setDetail(e?.message || String(e)); }
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  const close = () => { stop(); onClose(); };

  const message: Record<Status, string> = {
    idle: t("scanStart"),
    starting: t("scanStarting"),
    scanning: t("scanAim"),
    denied: t("scanDenied"),
    insecure: t("scanInsecure"),
    nocamera: t("scanNoCamera"),
    error: t("scanError"),
  };

  return (
    /*
      Full screen, not a card in a dialog.
      
      A camera in a small box on a dimmed page looks like a preview of a camera.
      Filling the screen makes it the thing you're doing — and it's how every
      other scanner a resident has used behaves, so nobody has to work it out.
    */
    <div className="scanfull" role="dialog" aria-modal="true" aria-label={t("scanQrTitle")}>
      <video ref={videoRef} playsInline muted
        className={status === "scanning" ? "scanvid" : "scanvid hide"} />
      <canvas ref={canvasRef} className="hide" />

      {status === "scanning" && (
        <>
          {/* The cut-out is four corner marks over a dimmed surround: it says
              where to aim without a box that fights the QR code's own frame. */}
          <div className="scanmask" aria-hidden>
            <span className="scanhole">
              <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
              <span className="scanline" />
            </span>
          </div>
          <p className="scanhint">{t("scanHint")}</p>
        </>
      )}

      {status !== "scanning" && (
        <div className="scanmsg">
          {["denied", "insecure", "nocamera", "error"].includes(status)
            ? <AlertTriangle size={34} strokeWidth={1.4} aria-hidden />
            : <Camera size={34} strokeWidth={1.4} aria-hidden />}
          <p className="scanmsgtitle">{message[status]}</p>
          {detail && <p className="scanmsgdetail">{detail}</p>}

          {status === "idle" && (
            <button className="scanstart" onClick={start}>
              <Camera size={18} /> {t("scanOpen")}
            </button>
          )}
          {["denied", "error"].includes(status) && (
            <button className="scanstart" onClick={start}>{t("scanRetry")}</button>
          )}
          <p className="scanmsgdetail">{t("scanFallback")}</p>
        </div>
      )}

      <button className="scanclose" onClick={close} aria-label={t("close")}>
        <X size={22} />
      </button>
    </div>
  );
}
