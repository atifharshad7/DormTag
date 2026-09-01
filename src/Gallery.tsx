import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Logo } from "./Logo";
import { LaptopNarrow } from "./LaptopNarrow";
import { type Locale, type StrKey } from "./lib";

type T = (k: StrKey) => string;

/*
 * Gallery — the landing page's device mockups.
 *
 * Three tabs now: a phone for the resident and the caretaker, a laptop for the
 * operator. The export's answer to the height problem is a fixed 640px stage
 * for all three, so switching tabs doesn't make the page jump — a laptop is
 * wide and a phone is tall, and animating between them would draw the eye to
 * the frame rather than the screen.
 *
 * Content is DECORATIVE: a fixed mockup, not live data. A marketing page that
 * empties when the demo database is reseeded would be worse than one showing a
 * known-good example.
 *
 * Every string carries both languages, so the page's DE/EN toggle reaches
 * inside the devices. The export's table covered most of them; the rest came
 * from the app's own translations, which is where they already lived.
 */

/**
 * A real code, not a white square.
 *
 * The export draws this as a blank block — decorative chrome. It was a working
 * QR before, and it should stay one: the slide is about scanning a sticker, and
 * a blank square in the middle of that claim undercuts it.
 *
 * SVG rather than canvas, deliberately. A canvas has a backing store and the
 * encoder writes inline width and height onto it, which outranks the class and
 * has produced a wrong-sized or invisible code three times in this project. An
 * SVG has neither: it scales to whatever the stylesheet says, at any size.
 */
function SlugQR({ className, slug = "b312-ba-shower" }: {
  className?: string; slug?: string;
}) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    QRCode.toString(`${location.origin}/r/${slug}`, {
      type: "svg",
      margin: 1,
      color: { dark: "#16191b", light: "#ffffff" },
    })
      .then((out: string) =>
        /* The library fixes a width and height on the root element; stripping
           them lets the class govern the size. */
        setSvg(out.replace(/(width|height)="[^"]*"/g, "")))
      .catch(() => {});
  }, [slug]);

  return (
    <span className={className} aria-label="QR" role="img"
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

type Role = "resident" | "caretaker" | "operator";
type Slide = { body: (l: Locale) => React.ReactNode; de: string; en: string };

const TRACKS: Record<Role, Slide[]> = {
  resident: [
    {
      de: 'Alles Offene zuerst, und genau eine Karte, die dich braucht.',
      en: 'Everything open first, and exactly one card that needs you.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-phone">
                  <div className="dp-phone-screen">
                    <div className="dp-phone-surface">
                      <div className="dp-status"><span className="dp-status-time">9:41</span><span className="dp-status-icons" ><i className="dp-status-pill" /><i className="dp-status-batt" /></span></div>
                      <div className="dp-appbar">
                        <span className="dp-brand"><span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span></span>
                        <span className="dp-unit-chip">B-312</span>
                      </div>
                      <div className="dp-phone-body">
                        <span className="dp-h1">{l === "de" ? 'Meine Meldungen' : 'My reports'}</span>
                        <div className="dp-group">
                          <div className="dp-group-head"><span className="dp-group-label">{l === "de" ? 'Termin wählen' : 'Pick a time'}</span><i className="dp-group-rule"  /><span className="dp-group-count">1</span></div>
                        <div className="dp-card">
                          <div className="dp-card-head"><span className="dp-plate">{l === "de" ? 'B-312 · Zimmer' : 'B-312 · Bedroom'}</span><span className="dp-pill dp-pill-info">{l === "de" ? 'Termine angeboten' : 'Times offered'}</span></div>
                          <span className="dp-card-title">{l === "de" ? 'Heizung · macht Geräusche' : 'Radiator · making noise'}</span>
                          <span className="dp-card-meta">{l === "de" ? 'gemeldet So 30. Aug' : 'reported Sun 30 Aug'}</span>
                          <span className="dp-card-action">{l === "de" ? 'Zeit wählen →' : 'Pick a time →'}</span>
                        </div>
                        </div>
                        <div className="dp-group">
                          <div className="dp-group-head"><span className="dp-group-label">{l === "de" ? 'Gemeldet' : 'Reported'}</span><i className="dp-group-rule"  /><span className="dp-group-count">1</span></div>
                        <div className="dp-card">
                          <div className="dp-card-head"><span className="dp-plate">{l === "de" ? 'B-312 · Küche' : 'B-312 · Kitchen'}</span><span className="dp-pill dp-pill-neutral">{l === "de" ? 'Angenommen' : 'Accepted'}</span></div>
                          <span className="dp-card-title">{l === "de" ? 'Spüle · undicht' : 'Sink · leaking'}</span>
                          <span className="dp-card-meta">{l === "de" ? 'gemeldet Fr 28. Aug' : 'reported Fri 28 Aug'}</span>
                        </div>
                        </div>
                        <div className="dp-group">
                          <div className="dp-group-head"><span className="dp-group-label">{l === "de" ? 'Erledigt' : 'Done'}</span><i className="dp-group-rule"  /><span className="dp-group-count">2</span></div>
                        <div className="dp-card">
                          <div className="dp-card-head"><span className="dp-plate">{l === "de" ? 'B-312 · Küche' : 'B-312 · Kitchen'}</span><span className="dp-pill dp-pill-ok">{l === "de" ? 'Erledigt' : 'Done'}</span></div>
                          <span className="dp-card-title">{l === "de" ? 'Licht · geht nicht' : 'Light · not working'}</span>
                          <span className="dp-card-meta">{l === "de" ? 'behoben Fr 12. Jun' : 'fixed Fri 12 Jun'}</span>
                        </div>
                        </div>
                        <span className="dp-cta">{l === "de" ? 'Neue Meldung' : 'New report'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      ),
    },
    {
      de: 'Der Aufkleber am Objekt setzt Raum und Objekt. Nichts zu tippen.',
      en: 'The sticker on the fixture sets room and item. Nothing to type.',
      /*
        The sticker slide from the previous export, inside this one's phone.
        
        That export drew the phone frame once outside the track, so the slide
        was only the screen's contents — lifted as-is it rendered a floating
        scan card with no device around it.
      */
      body: (l) => (
        <div className="dp-slide">
          <div className="dp-phone">
            <div className="dp-phone-screen">
              <div className="dp-phone-surface">
                <div className="dp-status">
                  <span className="dp-status-time">9:41</span>
                  <span className="dp-status-icons">
                    <i className="dp-status-pill" /><i className="dp-status-batt" />
                  </span>
                </div>
                <div className="dp-appbar">
                  <span className="dp-brand">
                    <span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span>
                  </span>
                  <span className="dp-unit-chip">B-312</span>
                </div>
                <div className="dp-phone-body">
                  <div className="dtp-title">{l === "de" ? 'Aufkleber scannen' : 'Scan the sticker'}</div>
                                <div className="dtp-scan">
                                  <div className="dtp-sticker">
                                    <div className="dtp-sticker-bar">
                                      <span className="dtp-sticker-brand">
                                        <Logo size={14} />
                                        DormTag
                                      </span>
                                      <span className="dtp-sticker-code">{'B-312-BA'}</span>
                                    </div>
                                    <div className="dtp-sticker-body">
                                      <span className="dtp-qrbox">
                                        <SlugQR className="dtp-sticker-qr" />
                                        <div className="dtp-reticle">
                                          <span className="dtp-bracket dtp-bracket-tl"></span>
                                          <span className="dtp-bracket dtp-bracket-tr"></span>
                                          <span className="dtp-bracket dtp-bracket-bl"></span>
                                          <span className="dtp-bracket dtp-bracket-br"></span>
                                          <span className="dtp-scanline"></span>
                                        </div>
                                      </span>
                                      <span className="dtp-sticker-name">{l === "de" ? 'Dusche' : 'Shower'}</span>
                                      <span className="dtp-sticker-hint">{l === "de" ? 'Scannen und melden' : 'Scan to report'}</span>
                                    </div>
                                  </div>
                                  <div className="dtp-vignette"></div>
                                  <span className="dtp-detect">
                                    <span className="dtp-detect-dot"></span>
                                    <span>{l === "de" ? 'B-312 · Bad · Dusche' : 'B-312 · Bathroom · Shower'}</span>
                                  </span>
                                </div>
                                <div className="dtp-cta">{l === "de" ? 'Dieses Objekt melden' : 'Report this item'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      de: 'Aufkleber scannen kennt das Objekt genau, oder Raum wählen.',
      en: 'Scanning knows the exact item, or pick a room.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-phone">
                  <div className="dp-phone-screen">
                    <div className="dp-phone-surface">
                      <div className="dp-status"><span className="dp-status-time">9:41</span><span className="dp-status-icons" ><i className="dp-status-pill" /><i className="dp-status-batt" /></span></div>
                      <div className="dp-appbar">
                        <span className="dp-brand"><span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span></span>
                        <span className="dp-unit-chip">B-312</span>
                      </div>
                      <div className="dp-phone-body">
                        <span className="dp-h1">{l === "de" ? 'Schaden melden' : 'Report a problem'}</span>
                        <div className="dp-scanbox">
                          <div className="dp-scanbox-head">
                            <span className="dp-scanbox-text"><span className="dp-scanbox-title">{l === "de" ? 'QR-Code scannen' : 'Scan a QR code'}</span><span className="dp-scanbox-sub">{l === "de" ? 'kennt das Objekt genau' : 'knows the exact item'}</span></span>
                            <SlugQR className="dp-scanbox-qr" />
                          </div>
                          <span className="dp-scanbox-cta">{l === "de" ? 'Kamera öffnen' : 'Open camera'}</span>
                        </div>
                        <div className="dp-room"><span className="dp-room-code">BA</span><span className="dp-room-name">{l === "de" ? 'Bad' : 'Bathroom'}</span><span className="dp-room-tag">{l === "de" ? 'privat' : 'private'}</span></div>
                        <div className="dp-room"><span className="dp-room-code">Z1</span><span className="dp-room-name">{l === "de" ? 'Zimmer' : 'rooms'}</span><span className="dp-room-tag">{l === "de" ? 'privat' : 'private'}</span></div>
                        <div className="dp-room"><span className="dp-room-code">KU</span><span className="dp-room-name">{l === "de" ? 'Küche' : 'Kitchen'}</span><span className="dp-room-tag">{l === "de" ? 'gemeinsam' : 'common'}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      ),
    },
    {
      de: 'Kurze Liste je Objekt, Notiz optional. Dann absenden.',
      en: 'A short list per fixture, note optional. Then send.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-phone">
                  <div className="dp-phone-screen">
                    <div className="dp-phone-surface">
                      <div className="dp-status"><span className="dp-status-time">9:41</span><span className="dp-status-icons" ><i className="dp-status-pill" /><i className="dp-status-batt" /></span></div>
                      <div className="dp-appbar">
                        <span className="dp-brand"><span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span></span>
                        <span className="dp-unit-chip">B-312</span>
                      </div>
                      <div className="dp-phone-body">
                        <span className="dp-plate dp-plate-solo">{l === "de" ? 'Zimmer · Licht' : 'Bedroom · Light'}</span>
                        <span className="dp-h1">{l === "de" ? 'Was ist das Problem?' : "What's wrong with it?"}</span>
                        <div className="dp-option dp-option-on">{l === "de" ? 'Geht gar nicht' : 'Not working at all'}<span className="dp-option-tick">✓</span></div>
                        <div className="dp-option">{l === "de" ? 'Flackert' : 'Flickering'}<span className="dp-option-tick"></span></div>
                        <div className="dp-option">{l === "de" ? 'Schalter kaputt' : 'Switch broken'}<span className="dp-option-tick"></span></div>
                        <span className="dp-cta">{l === "de" ? 'Absenden' : 'Send'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      ),
    },
    {
      de: 'Verlauf, angebotene Zeiten und „Ohne mich reingehen" auf einem Bild.',
      en: 'History, offered times and "Enter without me" on one screen.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-phone">
                  <div className="dp-phone-screen">
                    <div className="dp-phone-surface">
                      <div className="dp-status"><span className="dp-status-time">9:41</span><span className="dp-status-icons" ><i className="dp-status-pill" /><i className="dp-status-batt" /></span></div>
                      <div className="dp-appbar">
                        <span className="dp-brand"><span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span></span>
                        <span className="dp-unit-chip">B-312</span>
                      </div>
                      <div className="dp-phone-body">
                        <div className="dp-hero">
                          <span className="dp-hero-pill">{l === "de" ? 'Termine angeboten' : 'Times offered'}</span>
                          <span className="dp-hero-title">{l === "de" ? 'Licht kaputt' : 'Light broken'}</span>
                          <span className="dp-hero-meta">{l === "de" ? 'B-312 · Zimmer · gemeldet So 30. Aug' : 'B-312 · Bedroom · reported Sun 30 Aug'}</span>
                        </div>
                        <div className="dp-event"><span className="dp-event-dot dp-event-dot-on">3</span><span className="dp-event-text"><span className="dp-event-label">{l === "de" ? 'Termine angeboten' : 'Times offered'}</span><span className="dp-event-when">{l === "de" ? 'So 30. Aug · 14:12' : 'Sun 30 Aug · 14:12'}</span></span></div>
                        <div className="dp-event"><span className="dp-event-dot">2</span><span className="dp-event-text"><span className="dp-event-label">{l === "de" ? 'Vom Hausmeister angenommen' : 'Accepted by the caretaker'}</span><span className="dp-event-when">{l === "de" ? 'So 30. Aug · 14:12' : 'Sun 30 Aug · 14:12'}</span></span></div>
                        <div className="dp-slot"><span className="dp-slot-day">{l === "de" ? 'Mo 1. Sept' : 'Mon 1 Sept'}</span><span className="dp-slot-time">09:00 – 11:00</span></div>
                        <div className="dp-slot"><span className="dp-slot-day">{l === "de" ? 'Di 2. Sept' : 'Tue 2 Sept'}</span><span className="dp-slot-time">14:00 – 16:00</span></div>
                        <div className="dp-toggle">
                          <span className="dp-toggle-icon" aria-hidden>
                            {/* The app draws a key here, and the key turning is
                                what the control means. An empty circle says
                                nothing. */}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
                              <path d="m21 2-9.6 9.6" />
                              <circle cx="7.5" cy="15.5" r="5.5" />
                            </svg>
                          </span>
                          <span className="dp-toggle-text"><span className="dp-toggle-label">{l === "de" ? 'Ohne mich reingehen' : 'Enter without me'}</span><span className="dp-toggle-sub">{l === "de" ? 'erlaubt' : 'allowed'}</span></span>
                          <span className="dp-toggle-track"><i className="dp-toggle-knob" /></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      ),
    },
  ],
  caretaker: [
    {
      de: 'Eine Warteschlange statt Postfach, gruppiert nach dem, was zu tun ist.',
      en: 'One queue instead of a mailbox, grouped by what needs doing.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-phone">
                  <div className="dp-phone-screen">
                    <div className="dp-phone-surface">
                      <div className="dp-status"><span className="dp-status-time">9:41</span><span className="dp-status-icons" ><i className="dp-status-pill" /><i className="dp-status-batt" /></span></div>
                      <div className="dp-appbar">
                        <span className="dp-brand"><span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span></span>
                        <span className="dp-unit-chip">B-312</span>
                      </div>
                      <div className="dp-phone-body">
                        <span className="dp-h1">{l === "de" ? 'Warteschlange' : 'Queue'}</span>
                        <div className="dp-group">
                          <div className="dp-group-head"><span className="dp-group-label">{l === "de" ? 'Ohne Termin' : 'No appointment'}</span><i className="dp-group-rule"  /><span className="dp-group-count">2</span></div>
                        <div className="dp-card">
                          <div className="dp-card-head"><span className="dp-plate">{l === "de" ? 'B-312 · Bad' : 'B-312 · Bathroom'}</span><span className="dp-pill dp-pill-new">{l === "de" ? 'Neu' : 'New'}</span></div>
                          <span className="dp-card-title">{l === "de" ? 'Dusche · kein warmes Wasser' : 'Shower · no hot water'}</span>
                          <span className="dp-card-meta">{l === "de" ? 'heute · mit Notiz' : 'today · with a note'}</span>
                        </div>
                        <div className="dp-card">
                          <div className="dp-card-head"><span className="dp-plate">{l === "de" ? 'B-114 · Küche' : 'B-114 · Kitchen'}</span><span className="dp-pill dp-pill-neutral">{l === "de" ? 'Angenommen' : 'Accepted'}</span></div>
                          <span className="dp-card-title">{l === "de" ? 'Abfluss · verstopft' : 'Drain · blocked'}</span>
                          <span className="dp-card-meta">{l === "de" ? '2 Tage offen' : '2 days open'}</span>
                        </div>
                        </div>
                        <div className="dp-group">
                          <div className="dp-group-head"><span className="dp-group-label">{l === "de" ? 'Wartet auf Teil' : 'Waiting for parts'}</span><i className="dp-group-rule"  /><span className="dp-group-count">1</span></div>
                        <div className="dp-card">
                          <div className="dp-card-head"><span className="dp-plate">{l === "de" ? 'B-114 · Küche' : 'B-114 · Kitchen'}</span><span className="dp-pill dp-pill-warn">{l === "de" ? 'Wartet' : 'Waiting'}</span></div>
                          <span className="dp-card-title">{l === "de" ? 'Kühlschrank · kühlt nicht' : 'Fridge · not cooling'}</span>
                          <span className="dp-card-meta">{l === "de" ? 'Thermostat · Liefertermin 2. Sep' : 'Thermostat · due 2 Sept'}</span>
                        </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      ),
    },
    {
      de: 'Notiz und Zugangsregel stehen direkt am Auftrag.',
      en: 'The note and the access rule sit right on the job.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-phone">
                  <div className="dp-phone-screen">
                    <div className="dp-phone-surface">
                      <div className="dp-status"><span className="dp-status-time">9:41</span><span className="dp-status-icons" ><i className="dp-status-pill" /><i className="dp-status-batt" /></span></div>
                      <div className="dp-appbar">
                        <span className="dp-brand"><span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span></span>
                        <span className="dp-unit-chip">B-312</span>
                      </div>
                      <div className="dp-phone-body">
                        <span className="dp-plate dp-plate-solo">{l === "de" ? 'B-312 · Bad' : 'B-312 · Bathroom'}</span>
                        <span className="dp-h1">{l === "de" ? 'Dusche · kein warmes Wasser' : 'Shower · no hot water'}</span>
                        <div className="dp-group">
                          <div className="dp-group-head"><span className="dp-group-label">{l === "de" ? 'Notiz des Bewohners' : "Resident's note"}</span><i className="dp-group-rule"  /><span className="dp-group-count"></span></div>
                        <div className="dp-card">
                          <div className="dp-card-head"><span className="dp-plate">{l === "de" ? 'B-312 · Bad' : 'B-312 · Bathroom'}</span><span className="dp-pill dp-pill-new">{l === "de" ? 'Neu' : 'New'}</span></div>
                          <span className="dp-card-title">{l === "de" ? '„Morgens gar nichts, abends lauwarm."' : '“Nothing in the mornings, lukewarm at night.”'}</span>
                          <span className="dp-card-meta">{l === "de" ? 'Gemeinschaftsraum, kein Termin nötig' : 'Shared room, no appointment needed'}</span>
                        </div>
                        </div>
                        <span className="dp-cta">{l === "de" ? 'Annehmen' : 'Accept'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      ),
    },
    {
      de: 'Immer am Auftrag: welche Meldung, welcher Raum, dann Zeiten anbieten.',
      en: 'Always on the job: which report, which room, then offer times.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-phone">
                  <div className="dp-phone-screen">
                    <div className="dp-phone-surface">
                      <div className="dp-status"><span className="dp-status-time">9:41</span><span className="dp-status-icons" ><i className="dp-status-pill" /><i className="dp-status-batt" /></span></div>
                      <div className="dp-appbar">
                        <span className="dp-brand"><span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span></span>
                        <span className="dp-unit-chip">B-312</span>
                      </div>
                      <div className="dp-phone-body">
                        <span className="dp-plate dp-plate-solo">{l === "de" ? 'B-312 · Zimmer' : 'B-312 · Bedroom'}</span>
                        <span className="dp-h1">{l === "de" ? 'Termine anbieten' : 'Offer times'}</span>
                        <div className="dp-group">
                          <div className="dp-group-head"><span className="dp-group-label">{l === "de" ? 'Auftrag' : 'The job'}</span><i className="dp-group-rule"  /><span className="dp-group-count"></span></div>
                        <div className="dp-card">
                          <div className="dp-card-head"><span className="dp-plate">{l === "de" ? 'B-312 · Zimmer' : 'B-312 · Bedroom'}</span><span className="dp-pill dp-pill-neutral">{l === "de" ? 'Angenommen' : 'Accepted'}</span></div>
                          <span className="dp-card-title">{l === "de" ? 'Heizung · macht Geräusche' : 'Radiator · making noise'}</span>
                          <span className="dp-card-meta">{l === "de" ? 'gemeldet So 30. Aug · Privatzimmer, Termin nötig' : 'reported Sun 30 Aug · private room, appointment needed'}</span>
                        </div>
                        </div>
                        <div className="dp-chips">
                          <span className="dp-chip dp-chip-on">Mo 09–11</span>
                          <span className="dp-chip">Mo 14–16</span>
                          <span className="dp-chip dp-chip-on">Di 09–11</span>
                          <span className="dp-chip">Mi 16–18</span>
                        </div>
                        <span className="dp-cta">{l === "de" ? 'Termine anbieten' : 'Offer times'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      ),
    },
    {
      de: 'Aus den Ursachen entsteht die Statistik der Verwaltung.',
      en: "The causes are what the operator's statistics are built from.",
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-phone">
                  <div className="dp-phone-screen">
                    <div className="dp-phone-surface">
                      <div className="dp-status"><span className="dp-status-time">9:41</span><span className="dp-status-icons" ><i className="dp-status-pill" /><i className="dp-status-batt" /></span></div>
                      <div className="dp-appbar">
                        <span className="dp-brand"><span className="dp-brand-mark"><Logo size={20} /></span><span className="dp-brand-name">DormTag</span></span>
                        <span className="dp-unit-chip">B-312</span>
                      </div>
                      <div className="dp-phone-body">
                        <span className="dp-plate dp-plate-solo">{l === "de" ? 'B-312 · Bad' : 'B-312 · Bathroom'}</span>
                        <span className="dp-h1">{l === "de" ? 'Was war die Ursache?' : 'What was the cause?'}</span>
                        <div className="dp-option dp-option-on">Strang · Mischer defekt<span className="dp-option-tick">✓</span></div>
                        <div className="dp-option">Armatur · Dichtung<span className="dp-option-tick"></span></div>
                        <div className="dp-option">Nutzung · nichts defekt<span className="dp-option-tick"></span></div>
                        <span className="dp-cta">{l === "de" ? 'Erledigt' : 'Done'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      ),
    },
  ],
  operator: [
    {
      de: 'Alle Häuser auf einem Schirm: offene Meldungen, Verlauf und Gewerbe.',
      en: 'Every building on one screen: open tickets, trend and trade.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-laptop">
                  <div className="dp-laptop-lid">
                    <div className="dp-laptop-chrome">
                      <i className="dp-dot"  /><i className="dp-dot"  /><i className="dp-dot"  />
                      <span className="dp-url">dormtag.de/verwaltung</span>
                    </div>
                    <div className="dp-laptop-screen">
                      <div className="dp-laptop-surface">
                        <div className="dp-op-panel">
                          <div className="dp-op-org">
                        {/* The export leaves the laptop's panel without a mark;
                            every other surface in the app carries one. */}
                        <span className="dp-op-brand">
                          <Logo size={18} /><span className="dp-op-brandname">DormTag</span>
                        </span>
                            <span className="dp-op-eyebrow">{l === "de" ? 'Verwaltung' : 'Operator'}</span>
                            <span className="dp-op-orgname">Studierendenwerk (Demo)</span>
                            <span className="dp-op-orgsub">Studierendenwerk</span>
                          </div>
                          <div className="dp-op-nav">
                            <span className="dp-op-navitem dp-op-navitem-on">{l === "de" ? 'Übersicht' : 'Dashboard'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Gebäude' : 'Buildings'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Hausmeister' : 'Caretaker'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'QR-Aufkleber' : 'QR stickers'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Zugangscodes' : 'Access codes'}</span>
                          </div>
                        </div>
                        <div className="dp-op-content">
                          <div className="dp-op-head"><span className="dp-op-h1">Dashboard</span><span className="dp-op-sub">{l === "de" ? 'Wiederkehrende Fehler, Median bis Erledigung und vergebliche Besuche.' : 'Repeat faults, median time to fix and failed visits.'}</span></div>
                          <div className="dp-op-kpis">
                            <div className="dp-op-kpi"><span className="dp-op-kpi-label">{l === "de" ? 'Offene Meldungen' : 'Open tickets'}</span><span className="dp-op-kpi-value">6</span><span className="dp-op-kpi-link">{l === "de" ? 'Liste ansehen →' : 'See the list →'}</span></div>
                            <div className="dp-op-kpi"><span className="dp-op-kpi-label">{l === "de" ? 'Am längsten offen' : 'Oldest open'}</span><span className="dp-op-kpi-value">7 d</span><span className="dp-op-kpi-sub">{l === "de" ? 'C-201 · Steckdose' : 'C-201 · Socket'}</span></div>
                          </div>
                          <div className="dp-op-bcards">
                            <div className="dp-op-bcard"><span className="dp-op-bhead"><span className="dp-op-bname">Haus A</span><span className="dp-op-bcode">A</span></span><span className="dp-op-bfigs"><span className="dp-op-fig"><span className="dp-op-fig-n">3</span><span className="dp-op-fig-l">{l === "de" ? 'Wohnungen' : 'units'}</span></span><span className="dp-op-fig"><span className="dp-op-fig-n">180</span><span className="dp-op-fig-l">{l === "de" ? 'Zimmer' : 'rooms'}</span></span><span className="dp-op-fig"><span className="dp-op-fig-n dp-op-fig-zero">0</span><span className="dp-op-fig-l">{l === "de" ? 'offen' : 'open'}</span></span></span><span className="dp-op-bcare">K. Neumann</span></div>
                            <div className="dp-op-bcard"><span className="dp-op-bhead"><span className="dp-op-bname">Haus B</span><span className="dp-op-bcode">B</span></span><span className="dp-op-bfigs"><span className="dp-op-fig"><span className="dp-op-fig-n">3</span><span className="dp-op-fig-l">{l === "de" ? 'Wohnungen' : 'units'}</span></span><span className="dp-op-fig"><span className="dp-op-fig-n">240</span><span className="dp-op-fig-l">{l === "de" ? 'Zimmer' : 'rooms'}</span></span><span className="dp-op-fig"><span className="dp-op-fig-n dp-op-fig-bad">4</span><span className="dp-op-fig-l">{l === "de" ? 'offen' : 'open'}</span></span></span><span className="dp-op-bcare">K. Neumann</span></div>
                            <div className="dp-op-bcard"><span className="dp-op-bhead"><span className="dp-op-bname">Haus C</span><span className="dp-op-bcode">C</span></span><span className="dp-op-bfigs"><span className="dp-op-fig"><span className="dp-op-fig-n">9</span><span className="dp-op-fig-l">{l === "de" ? 'Wohnungen' : 'units'}</span></span><span className="dp-op-fig"><span className="dp-op-fig-n">150</span><span className="dp-op-fig-l">{l === "de" ? 'Zimmer' : 'rooms'}</span></span><span className="dp-op-fig"><span className="dp-op-fig-n dp-op-fig-bad">2</span><span className="dp-op-fig-l">{l === "de" ? 'offen' : 'open'}</span></span></span><span className="dp-op-bcare">K. Neumann</span></div>
                          </div>
                          <div className="dp-op-charts">
                            <div className="dp-op-chart">
                              <span className="dp-op-chart-title">{l === "de" ? 'Gemeldet und behoben' : 'Reported and fixed'}</span>
                              <div className="dp-op-bars" data-chart="grouped-vertical-bar">
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '22%'}} /><i className="dp-op-bar-b" style={{height: '18%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '24%'}} /><i className="dp-op-bar-b" style={{height: '20%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '20%'}} /><i className="dp-op-bar-b" style={{height: '17%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '18%'}} /><i className="dp-op-bar-b" style={{height: '15%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '70%'}} /><i className="dp-op-bar-b" style={{height: '68%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '74%'}} /><i className="dp-op-bar-b" style={{height: '72%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '52%'}} /><i className="dp-op-bar-b" style={{height: '50%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '76%'}} /><i className="dp-op-bar-b" style={{height: '74%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '78%'}} /><i className="dp-op-bar-b" style={{height: '76%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '80%'}} /><i className="dp-op-bar-b" style={{height: '78%'}} /></span>
                                <span className="dp-op-bargroup"><i className="dp-op-bar-a" style={{height: '100%'}} /><i className="dp-op-bar-b" style={{height: '56%'}} /></span>
                              </div>
                            </div>
                            <div className="dp-op-chart">
                              <span className="dp-op-chart-title">{l === "de" ? 'Nach Gewerbe' : 'By trade'}</span>
                              <div className="dp-op-ranks" data-chart="ranked-horizontal-bar">
                                <div className="dp-op-rank"><span className="dp-op-rank-l">{l === "de" ? 'Elektro' : 'Electrical'}</span><span className="dp-op-rank-track"><i className="dp-op-rank-fill" style={{width: '100%'}} /></span><span className="dp-op-rank-n">22</span></div>
                                <div className="dp-op-rank"><span className="dp-op-rank-l">{l === "de" ? 'Sanitär' : 'Plumbing'}</span><span className="dp-op-rank-track"><i className="dp-op-rank-fill" style={{width: '82%'}} /></span><span className="dp-op-rank-n">18</span></div>
                                <div className="dp-op-rank"><span className="dp-op-rank-l">{l === "de" ? 'Heizung' : 'Heating'}</span><span className="dp-op-rank-track"><i className="dp-op-rank-fill" style={{width: '23%'}} /></span><span className="dp-op-rank-n">5</span></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="dp-laptop-base" ></div>
                  <div className="dp-laptop-foot" ></div>
                </div>
              </div>
      ),
    },
    {
      de: 'Häuser anlegen, Zimmer planen, Zuständigkeit setzen – ohne Tabelle.',
      en: 'Add buildings, plan rooms, set who covers them — without a spreadsheet.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-laptop">
                  <div className="dp-laptop-lid">
                    <div className="dp-laptop-chrome">
                      <i className="dp-dot"  /><i className="dp-dot"  /><i className="dp-dot"  />
                      <span className="dp-url">dormtag.de/verwaltung</span>
                    </div>
                    <div className="dp-laptop-screen">
                      <div className="dp-laptop-surface">
                        <div className="dp-op-panel">
                          <div className="dp-op-org">
                        {/* The export leaves the laptop's panel without a mark;
                            every other surface in the app carries one. */}
                        <span className="dp-op-brand">
                          <Logo size={18} /><span className="dp-op-brandname">DormTag</span>
                        </span>
                            <span className="dp-op-eyebrow">{l === "de" ? 'Verwaltung' : 'Operator'}</span>
                            <span className="dp-op-orgname">Studierendenwerk (Demo)</span>
                            <span className="dp-op-orgsub">Studierendenwerk</span>
                          </div>
                          <div className="dp-op-nav">
                            <span className="dp-op-navitem">{l === "de" ? 'Übersicht' : 'Dashboard'}</span>
                            <span className="dp-op-navitem dp-op-navitem-on">{l === "de" ? 'Gebäude' : 'Buildings'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Hausmeister' : 'Caretaker'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'QR-Aufkleber' : 'QR stickers'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Zugangscodes' : 'Access codes'}</span>
                          </div>
                        </div>
                        <div className="dp-op-content">
                          <div className="dp-op-headrow">
                            <div className="dp-op-head"><span className="dp-op-h1">{l === "de" ? 'Gebäude' : 'Buildings'}</span><span className="dp-op-sub">{l === "de" ? 'Belegung, Zuständigkeit und offene Meldungen je Haus.' : 'Occupancy, cover and open reports per building.'}</span></div>
                            <span className="dp-op-cta">{l === "de" ? '+ Gebäude hinzufügen' : '+ Add building'}</span>
                          </div>
                          <div className="dp-op-row"><span className="dp-op-rowtext"><span className="dp-op-rowname">Haus A</span><span className="dp-op-rowmeta">{l === "de" ? '3 Wohnungen · 4 Zimmer · 180 geplant' : '3 units · 4 rooms · 180 planned'}</span><span className="dp-op-rowcare">K. Neumann</span></span><span className="dp-op-bcode">A</span></div>
                          <div className="dp-op-row"><span className="dp-op-rowtext"><span className="dp-op-rowname">Haus B</span><span className="dp-op-rowmeta">{l === "de" ? '3 Wohnungen · 10 Zimmer · 240 geplant' : '3 units · 10 rooms · 240 planned'}</span><span className="dp-op-rowcare">K. Neumann</span></span><span className="dp-op-bcode">B</span></div>
                          <div className="dp-op-row"><span className="dp-op-rowtext"><span className="dp-op-rowname">Haus C</span><span className="dp-op-rowmeta">{l === "de" ? '9 Wohnungen · 18 Zimmer · 150 geplant' : '9 units · 18 rooms · 150 planned'}</span><span className="dp-op-rowcare">K. Neumann</span></span><span className="dp-op-bcode">C</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="dp-laptop-base" ></div>
                  <div className="dp-laptop-foot" ></div>
                </div>
              </div>
      ),
    },
    {
      de: 'Personal einladen und Häuser zuweisen. Ein Link statt eines Passwort-Telefonats.',
      en: 'Invite staff and assign buildings. One link instead of a password phone call.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-laptop">
                  <div className="dp-laptop-lid">
                    <div className="dp-laptop-chrome">
                      <i className="dp-dot"  /><i className="dp-dot"  /><i className="dp-dot"  />
                      <span className="dp-url">dormtag.de/verwaltung</span>
                    </div>
                    <div className="dp-laptop-screen">
                      <div className="dp-laptop-surface">
                        <div className="dp-op-panel">
                          <div className="dp-op-org">
                        {/* The export leaves the laptop's panel without a mark;
                            every other surface in the app carries one. */}
                        <span className="dp-op-brand">
                          <Logo size={18} /><span className="dp-op-brandname">DormTag</span>
                        </span>
                            <span className="dp-op-eyebrow">{l === "de" ? 'Verwaltung' : 'Operator'}</span>
                            <span className="dp-op-orgname">Studierendenwerk (Demo)</span>
                            <span className="dp-op-orgsub">Studierendenwerk</span>
                          </div>
                          <div className="dp-op-nav">
                            <span className="dp-op-navitem">{l === "de" ? 'Übersicht' : 'Dashboard'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Gebäude' : 'Buildings'}</span>
                            <span className="dp-op-navitem dp-op-navitem-on">{l === "de" ? 'Hausmeister' : 'Caretaker'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'QR-Aufkleber' : 'QR stickers'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Zugangscodes' : 'Access codes'}</span>
                          </div>
                        </div>
                        <div className="dp-op-content">
                          <div className="dp-op-headrow">
                            <div className="dp-op-head"><span className="dp-op-h1">{l === "de" ? 'Hausmeister' : 'Caretaker'}</span><span className="dp-op-sub">{l === "de" ? 'Wer welches Haus betreut.' : 'Who covers which building.'}</span></div>
                            <span className="dp-op-cta dp-op-cta-quiet">{l === "de" ? '+ Person hinzufügen' : '+ Add person'}</span>
                          </div>
                          <div className="dp-op-person">
                            <div className="dp-op-person-head">
                              <span className="dp-op-ident"><span className="dp-op-avatar">S</span><span className="dp-op-ident-text"><span className="dp-op-pname">Studierendenwerk</span><span className="dp-op-pmail">verwaltung@wohnheim.test</span></span></span>
                              <span className="dp-op-role dp-op-role-operator">{l === "de" ? 'Verwaltung' : 'Operator'}</span>
                            </div>
                            <span className="dp-op-scope">{l === "de" ? 'Organisationsweit – keinem Haus zugeordnet' : 'Organisation-wide — not tied to a building'}</span>
                            <span className="dp-op-actions"><span className="dp-op-pill">{l === "de" ? 'Neuer Einrichtungslink' : 'New setup link'}</span></span>
                          </div>
                          <div className="dp-op-person">
                            <div className="dp-op-person-head">
                              <span className="dp-op-ident"><span className="dp-op-avatar">KN</span><span className="dp-op-ident-text"><span className="dp-op-pname">K. Neumann</span><span className="dp-op-pmail">hausmeister@wohnheim.test</span></span></span>
                              <span className="dp-op-role">{l === "de" ? 'Hausmeister' : 'Caretaker'}</span>
                            </div>
                            <span className="dp-op-scope">Haus A, Haus B, Haus C</span>
                            <span className="dp-op-actions"><span className="dp-op-pill">{l === "de" ? 'Häuser ändern' : 'Change buildings'}</span><span className="dp-op-pill dp-op-pill-warn">{l === "de" ? 'Deaktivieren' : 'Disable'}</span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="dp-laptop-base" ></div>
                  <div className="dp-laptop-foot" ></div>
                </div>
              </div>
      ),
    },
    {
      de: 'Aufkleberbögen filtern und drucken – ein Code je Objekt.',
      en: 'Filter and print sticker sheets — one code per fixture.',
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-laptop">
                  <div className="dp-laptop-lid">
                    <div className="dp-laptop-chrome">
                      <i className="dp-dot"  /><i className="dp-dot"  /><i className="dp-dot"  />
                      <span className="dp-url">dormtag.de/verwaltung</span>
                    </div>
                    <div className="dp-laptop-screen">
                      <div className="dp-laptop-surface">
                        <div className="dp-op-panel">
                          <div className="dp-op-org">
                        {/* The export leaves the laptop's panel without a mark;
                            every other surface in the app carries one. */}
                        <span className="dp-op-brand">
                          <Logo size={18} /><span className="dp-op-brandname">DormTag</span>
                        </span>
                            <span className="dp-op-eyebrow">{l === "de" ? 'Verwaltung' : 'Operator'}</span>
                            <span className="dp-op-orgname">Studierendenwerk (Demo)</span>
                            <span className="dp-op-orgsub">Studierendenwerk</span>
                          </div>
                          <div className="dp-op-nav">
                            <span className="dp-op-navitem">{l === "de" ? 'Übersicht' : 'Dashboard'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Gebäude' : 'Buildings'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Hausmeister' : 'Caretaker'}</span>
                            <span className="dp-op-navitem dp-op-navitem-on">{l === "de" ? 'QR-Aufkleber' : 'QR stickers'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Zugangscodes' : 'Access codes'}</span>
                          </div>
                        </div>
                        <div className="dp-op-content">
                          <div className="dp-op-stickerbar"><span className="dp-op-count">{l === "de" ? '4 Aufkleber' : '4 stickers'}</span><span className="dp-op-cta">{l === "de" ? 'Bogen drucken' : 'Print sheet'}</span></div>
                          <div className="dp-op-filters">
                            <span className="dp-op-field"><span className="dp-op-flabel">{l === "de" ? 'Geschoss' : 'Floor'}</span><span className="dp-op-fvalue">{l === "de" ? 'Alle Geschosse' : 'All floors'}</span></span>
                            <span className="dp-op-field"><span className="dp-op-flabel">{l === "de" ? 'Räume' : 'Rooms'}</span><span className="dp-op-fvalue">{l === "de" ? 'Alle Räume' : 'All rooms'}</span></span>
                            <span className="dp-op-field"><span className="dp-op-flabel">{l === "de" ? 'Wohnung finden' : 'Find a unit'}</span><span className="dp-op-fvalue dp-op-fvalue-ph">204</span></span>
                          </div>
                          <div className="dp-op-stickers">
                            <div className="dp-op-sticker"><SlugQR className="dp-op-qr" slug="a104-ba" /><span className="dp-op-sticker-text"><span className="dp-op-sticker-head">A-104</span><span className="dp-op-sticker-room">{l === "de" ? 'Bad' : 'Bathroom'}</span><span className="dp-op-sticker-line">{l === "de" ? 'SCHADEN MELDEN · REPORT A PROBLEM' : 'REPORT A PROBLEM · SCHADEN MELDEN'}</span><span className="dp-op-sticker-slug">a104-ba</span></span></div>
                            <div className="dp-op-sticker"><SlugQR className="dp-op-qr" slug="a104-z1" /><span className="dp-op-sticker-text"><span className="dp-op-sticker-head">A-104</span><span className="dp-op-sticker-room">{l === "de" ? 'Zimmer' : 'rooms'}</span><span className="dp-op-sticker-line">{l === "de" ? 'SCHADEN MELDEN · REPORT A PROBLEM' : 'REPORT A PROBLEM · SCHADEN MELDEN'}</span><span className="dp-op-sticker-slug">a104-z1</span></span></div>
                            <div className="dp-op-sticker"><SlugQR className="dp-op-qr" slug="acom1-fl" /><span className="dp-op-sticker-text"><span className="dp-op-sticker-head">{l === "de" ? 'A-COM1 · Geschoss 1' : 'A-COM1 · Floor 1'}</span><span className="dp-op-sticker-room">{l === "de" ? 'Flur' : 'Hallway'}</span><span className="dp-op-sticker-line">{l === "de" ? 'SCHADEN MELDEN · REPORT A PROBLEM' : 'REPORT A PROBLEM · SCHADEN MELDEN'}</span><span className="dp-op-sticker-slug">acom1-fl</span></span></div>
                            <div className="dp-op-sticker"><SlugQR className="dp-op-qr" slug="acom2-fl" /><span className="dp-op-sticker-text"><span className="dp-op-sticker-head">{l === "de" ? 'A-COM2 · Geschoss 2' : 'A-COM2 · Floor 2'}</span><span className="dp-op-sticker-room">{l === "de" ? 'Flur' : 'Hallway'}</span><span className="dp-op-sticker-line">{l === "de" ? 'SCHADEN MELDEN · REPORT A PROBLEM' : 'REPORT A PROBLEM · SCHADEN MELDEN'}</span><span className="dp-op-sticker-slug">acom2-fl</span></span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="dp-laptop-base" ></div>
                  <div className="dp-laptop-foot" ></div>
                </div>
              </div>
      ),
    },
    {
      de: 'Zugangscodes je Zimmer neu ausgeben, wenn jemand auszieht.',
      en: "Reissue a room's access code when somebody moves out.",
      body: (l) => (
        <div className="dp-slide">
                <div className="dp-laptop">
                  <div className="dp-laptop-lid">
                    <div className="dp-laptop-chrome">
                      <i className="dp-dot"  /><i className="dp-dot"  /><i className="dp-dot"  />
                      <span className="dp-url">dormtag.de/verwaltung</span>
                    </div>
                    <div className="dp-laptop-screen">
                      <div className="dp-laptop-surface">
                        <div className="dp-op-panel">
                          <div className="dp-op-org">
                        {/* The export leaves the laptop's panel without a mark;
                            every other surface in the app carries one. */}
                        <span className="dp-op-brand">
                          <Logo size={18} /><span className="dp-op-brandname">DormTag</span>
                        </span>
                            <span className="dp-op-eyebrow">{l === "de" ? 'Verwaltung' : 'Operator'}</span>
                            <span className="dp-op-orgname">Studierendenwerk (Demo)</span>
                            <span className="dp-op-orgsub">Studierendenwerk</span>
                          </div>
                          <div className="dp-op-nav">
                            <span className="dp-op-navitem">{l === "de" ? 'Übersicht' : 'Dashboard'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Gebäude' : 'Buildings'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'Hausmeister' : 'Caretaker'}</span>
                            <span className="dp-op-navitem">{l === "de" ? 'QR-Aufkleber' : 'QR stickers'}</span>
                            <span className="dp-op-navitem dp-op-navitem-on">{l === "de" ? 'Zugangscodes' : 'Access codes'}</span>
                          </div>
                        </div>
                        <div className="dp-op-content">
                          <span className="dp-op-sub">{l === "de" ? '5 Codes ausgegeben' : '5 codes issued'}</span>
                          <div className="dp-op-warn"><span className="dp-op-warn-text">{l === "de" ? 'Das sind funktionierende Zugangsdaten. Nur auf Papier weitergeben.' : 'This is a list of working credentials. Hand it out on paper only.'}</span><span className="dp-op-cta">{l === "de" ? 'Liste drucken' : 'Print the list'}</span></div>
                          <div className="dp-op-codes">
                            <div className="dp-op-code"><span className="dp-op-code-unit">B-207 · Z1</span><span className="dp-op-code-right"><span className="dp-op-code-value">VQ7U5RPN</span><span className="dp-op-code-meta">{l === "de" ? 'ausgegeben Di 1. Sept · nie benutzt' : 'issued Tue 1 Sept · never used'}</span><span className="dp-op-code-link">{l === "de" ? 'Neue Bewohnerin' : 'New resident'}</span><span className="dp-op-code-link">{l === "de" ? 'Verlauf' : 'History'}</span></span></div>
                            <div className="dp-op-code"><span className="dp-op-code-unit">B-312 · Z1</span><span className="dp-op-code-right"><span className="dp-op-code-value">R43KWKU6</span><span className="dp-op-code-meta">{l === "de" ? 'ausgegeben Di 1. Sept · nie benutzt' : 'issued Tue 1 Sept · never used'}</span><span className="dp-op-code-link">{l === "de" ? 'Neue Bewohnerin' : 'New resident'}</span><span className="dp-op-code-link">{l === "de" ? 'Verlauf' : 'History'}</span></span></div>
                            <div className="dp-op-code"><span className="dp-op-code-unit">B-312 · Z2</span><span className="dp-op-code-right"><span className="dp-op-code-value">B312-Z2-DEMO</span><span className="dp-op-code-meta dp-op-code-inuse">{l === "de" ? 'in Benutzung seit So 30. Aug' : 'in use since Sun 30 Aug'}</span><span className="dp-op-code-link">{l === "de" ? 'Neue Bewohnerin' : 'New resident'}</span><span className="dp-op-code-link">{l === "de" ? 'Verlauf' : 'History'}</span></span></div>
                            <div className="dp-op-code"><span className="dp-op-code-unit">B-312 · Z3</span><span className="dp-op-code-right"><span className="dp-op-code-value">D9D4G4FG</span><span className="dp-op-code-meta">{l === "de" ? 'ausgegeben Di 1. Sept · nie benutzt' : 'issued Tue 1 Sept · never used'}</span><span className="dp-op-code-link">{l === "de" ? 'Neue Bewohnerin' : 'New resident'}</span><span className="dp-op-code-link">{l === "de" ? 'Verlauf' : 'History'}</span></span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="dp-laptop-base" ></div>
                  <div className="dp-laptop-foot" ></div>
                </div>
              </div>
      ),
    },
  ],
};

export function Gallery({ l, t }: { l: Locale; t: T }) {
  const [role, setRole] = useState<Role>("resident");
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  const slides = TRACKS[role];
  const count = slides.length;
  const go = useCallback((n: number) => setI(((n % count) + count) % count), [count]);

  /* Six seconds a slide, stopped by reduced motion, by the pointer being over
     the gallery, and by any manual interaction. */
  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % count), 6000);
    return () => clearInterval(id);
  }, [paused, count]);

  const touch = useRef<number | null>(null);
  const slide = slides[i];

  /*
   * The operator's laptop has its own narrow build, isolated in .dln- classes.
   * Below 700px the dashboard stops being readable and becomes something you
   * recognise, which is a different drawing rather than the same one shrunk —
   * so it's a separate component rather than a media query on this one.
   */
  const [narrow, setNarrow] = useState(
    typeof matchMedia === "function" && matchMedia("(max-width: 700px)").matches);
  useEffect(() => {
    const q = matchMedia("(max-width: 700px)");
    const on = () => setNarrow(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  /*
   * One screen rather than a deck.
   *
   * The export draws a single dashboard at this width, so the paging controls
   * and the caption are hidden — they'd promise four screens that don't exist.
   */
  const oneScreen = role === "operator" && narrow;

  const TABS: [Role, StrKey][] = [
    ["resident", "tenant"], ["caretaker", "staff"], ["operator", "operator"],
  ];

  return (
    <div className="dp-root"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>

      <div className="dp-tabs" role="tablist">
        {TABS.map(([r, label]) => (
          <button key={r} role="tab" aria-selected={role === r}
            className={"dp-tab" + (role === r ? " dp-tab-on" : "")}
            onClick={() => { setRole(r); setI(0); }}>
            {t(label)}
          </button>
        ))}
      </div>

      {/* Fixed height across all three tabs, so the page doesn't jump. */}
      <div className="dp-stage"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; setPaused(true); }}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
          touch.current = null;
        }}>
        {oneScreen ? (
          <LaptopNarrow l={l} />
        ) : (
          <div className="dp-track dp-track-on"
            style={{ transform: `translateX(${-100 * i}%)` }}>
            {slides.map((s, n) => (
              <React.Fragment key={`${role}-${n}`}>{s.body(l)}</React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/*
        No paging controls for the narrow laptop.
        
        The export draws one dashboard at this width — recognisable rather than
        readable — where the desktop tab has five slides. Leaving the dots and
        arrows would promise four screens that aren't there.
      */}
      {!oneScreen && (
      <div className="dp-nav">
        <button className="dp-arrow" aria-label="←"
          onClick={() => { setPaused(true); go(i - 1); }}>‹</button>
        <div className="dp-dots">
          {slides.map((_, n) => (
            <button key={n} aria-label={`${n + 1}`} aria-current={n === i}
              className={"dp-dot-btn" + (n === i ? " dp-dot-btn-on" : "")}
              onClick={() => { setPaused(true); go(n); }} />
          ))}
        </div>
        <button className="dp-arrow" aria-label="→"
          onClick={() => { setPaused(true); go(i + 1); }}>›</button>
      </div>
      )}

      {!oneScreen && (
        <p className="dp-caption dp-caption-on">{l === "de" ? slide.de : slide.en}</p>
      )}
    </div>
  );
}
