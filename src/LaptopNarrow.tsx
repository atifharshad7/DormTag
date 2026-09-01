import React from "react";
import { type Locale } from "./lib";

/**
 * The laptop at narrow widths.
 *
 * From the design export, and deliberately self-contained: every selector is
 * `dln-`, and the stage is brought along as `.dln-stage` rather than reusing
 * the gallery's. An earlier attempt of mine styled the shared stage and pushed
 * the phone tabs off centre — this cannot.
 *
 * The export answers the question that governs the whole thing: below about
 * 700px the dashboard is meant to be recognisable rather than readable. Body
 * copy gives up around 0.50; headings and figures hold to the 0.26 floor, which
 * is the last size at which a digit is still a digit. Below 380px the frame
 * stops shrinking and the stage pans, left-aligned so the sidebar and heading
 * stay on screen, with the right edge clipped as the signal that there's more.
 */
export function LaptopNarrow({ l }: { l: Locale }) {
  return (
    <>
      <div className="dln-stage">
          <div className="dln-laptop">
            <div className="dln-lid">
              <div className="dln-chrome">
                <i className="dln-dot" /><i className="dln-dot" /><i className="dln-dot" />
                <span className="dln-url">dormtag.de/verwaltung</span>
              </div>
              <div className="dln-screen">
                <div className="dln-surface">
                  <div className="dln-panel">
                    <div className="dln-org">
                      <span className="dln-org-eyebrow">{l === 'de' ? 'Verwaltung' : 'Operator'}</span>
                      <span className="dln-org-name">Studierendenwerk (Demo)</span>
                    </div>
                    <div className="dln-nav">
                      <span className="dln-navitem dln-navitem-on">{l === 'de' ? 'Übersicht' : 'Dashboard'}</span>
                      <span className="dln-navitem">{l === 'de' ? 'Gebäude' : 'Buildings'}</span>
                      <span className="dln-navitem">{l === 'de' ? 'Hausmeister' : 'Caretaker'}</span>
                      <span className="dln-navitem">{l === 'de' ? 'QR-Aufkleber' : 'QR stickers'}</span>
                      <span className="dln-navitem">{l === 'de' ? 'Zugangscodes' : 'Access codes'}</span>
                    </div>
                  </div>
                  <div className="dln-content">
                    <div className="dln-head">
                      <span className="dln-h1">Dashboard</span>
                      <span className="dln-sub">{l === 'de' ? 'Wiederkehrende Fehler, Median bis Erledigung und vergebliche Besuche.' : 'Repeat faults, median time to fix and failed visits.'}</span>
                    </div>
                    <div className="dln-kpis">
                      <div className="dln-kpi">
                        <span className="dln-kpi-label">{l === 'de' ? 'Offene Meldungen' : 'Open tickets'}</span>
                        <span className="dln-kpi-value">6</span>
                        <span className="dln-kpi-link">{l === 'de' ? 'Liste ansehen →' : 'See the list →'}</span>
                      </div>
                      <div className="dln-kpi">
                        <span className="dln-kpi-label">{l === 'de' ? 'Am längsten offen' : 'Oldest open'}</span>
                        <span className="dln-kpi-value">7 d</span>
                        <span className="dln-kpi-sub">{l === 'de' ? 'C-201 · Steckdose' : 'C-201 · Socket'}</span>
                      </div>
                    </div>
                    <div className="dln-charts">
                      <div className="dln-chart">
                        <span className="dln-chart-title">{l === 'de' ? 'Gemeldet und behoben' : 'Reported and fixed'}</span>
                        <div className="dln-bars">
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '22%'}} /><i className="dln-bar-b" style={{height: '18%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '24%'}} /><i className="dln-bar-b" style={{height: '20%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '20%'}} /><i className="dln-bar-b" style={{height: '17%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '18%'}} /><i className="dln-bar-b" style={{height: '15%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '70%'}} /><i className="dln-bar-b" style={{height: '68%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '74%'}} /><i className="dln-bar-b" style={{height: '72%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '52%'}} /><i className="dln-bar-b" style={{height: '50%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '76%'}} /><i className="dln-bar-b" style={{height: '74%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '78%'}} /><i className="dln-bar-b" style={{height: '76%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '80%'}} /><i className="dln-bar-b" style={{height: '78%'}} /></span>
                          <span className="dln-bargroup"><i className="dln-bar-a" style={{height: '100%'}} /><i className="dln-bar-b" style={{height: '56%'}} /></span>
                        </div>
                        <span className="dln-legend">
                          <span className="dln-legend-item"><i className="dln-swatch-a" /><span>{l === 'de' ? 'gemeldet' : 'reported'}</span></span>
                          <span className="dln-legend-item"><i className="dln-swatch-b" /><span>{l === 'de' ? 'behoben' : 'fixed'}</span></span>
                        </span>
                      </div>
                      <div className="dln-chart">
                        <span className="dln-chart-title">{l === 'de' ? 'Nach Gewerbe' : 'By trade'}</span>
                        <div className="dln-ranks">
                          <div className="dln-rank"><span className="dln-rank-l">{l === 'de' ? 'Elektro' : 'Electrical'}</span><span className="dln-rank-track"><i className="dln-rank-fill" style={{width: '100%'}} /></span><span className="dln-rank-n">22</span></div>
                          <div className="dln-rank"><span className="dln-rank-l">{l === 'de' ? 'Sanitär' : 'Plumbing'}</span><span className="dln-rank-track"><i className="dln-rank-fill" style={{width: '82%'}} /></span><span className="dln-rank-n">18</span></div>
                          <div className="dln-rank"><span className="dln-rank-l">{l === 'de' ? 'Heizung' : 'Heating'}</span><span className="dln-rank-track"><i className="dln-rank-fill" style={{width: '23%'}} /></span><span className="dln-rank-n">5</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="dln-base"></div>
            <div className="dln-foot"></div>
          </div>
          <i className="dln-fade" />
        </div>
      <p className="dln-hint">{l === 'de' ? 'Seitwärts wischen, um den ganzen Bildschirm zu sehen →' : 'Swipe sideways to see the whole screen'}</p>
    </>
  );
}
