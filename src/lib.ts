/**
 * lib.ts — i18n catalogue, code→label resolution, API client.
 *
 * Nothing user-visible is stored in the database. The database stores
 * 'KITCHEN' / 'SINK' / 'RISER'; this file is the only place those become words.
 * That's what lets the dashboard count sink leaks across the whole Bestand
 * regardless of which language each report was filed in.
 */

import {
  Droplet, Flame, Lightbulb, Refrigerator, Thermometer, ShowerHead,
  WashingMachine, DoorClosed, Wind, Plug, Bed, UtensilsCrossed, Bath, DoorOpen,
  type LucideIcon,
} from "lucide-react";

export type Locale = "de" | "en";

/* ---------------------------------------------------------------- */
/* UI strings                                                       */
/* ---------------------------------------------------------------- */

export const T = {
  appName:       { de: "DormTag",                     en: "DormTag" },
  tenant:        { de: "Bewohner",                        en: "Resident" },
  staff:         { de: "Hausmeister",                     en: "Caretaker" },
  operator:      { de: "Verwaltung",                      en: "Operator" },
  signIn:        { de: "Rolle wählen",                    en: "Choose a role" },
  signInTitle2:  { de: "Anmelden",                       en: "Sign in" },
  siCodeLabel:   { de: "Zugangscode",                    en: "Access code" },
  siCodeHint:    { de: "Steht auf dem Bogen an deiner Zimmertür. Kein Konto, kein Passwort: der Code zeigt dir", en: "It's on the sheet at your room door. No account, no password: the code shows you" },
  siCodeHintB:   { de: "deine Meldungen",                en: "your reports" },
  siCodeBad:     { de: "Dieser Code passt nicht zu einem Zimmer. Prüfe den Bogen an deiner Tür.", en: "That code doesn't match a room. Check the sheet at your door." },
  siSeeReports:  { de: "Meldungen ansehen",              en: "See my reports" },
  siOr:          { de: "oder",                           en: "or" },
  siScan:        { de: "Aufkleber scannen",              en: "Scan a sticker" },
  siScanFine:    { de: "Melden braucht nie einen Code. Scannen führt direkt zum Objekt.", en: "Reporting never needs a code. Scanning goes straight to the fixture." },
  siStaffBad:    { de: "E-Mail oder Passwort ist falsch.", en: "That email or password is wrong." },
  siForgot:      { de: "Passwort vergessen",             en: "Forgot your password" },
  siImResident:  { de: "Ich bin Bewohner",               en: "I'm a resident" },
  siTabTenant:   { de: "Bewohner",                       en: "Resident" },
  siTabStaff:    { de: "Hausmeister · Verwaltung",       en: "Caretaker · Operator" },
  siSubTenant:   { de: "Mit dem Code von deiner Zimmertür.", en: "With the code from your room door." },
  siSubStaff:    { de: "Für Hausmeister und Verwaltung.", en: "For caretakers and operators." },
  demoNote:      { de: "Jede Rolle erzeugt eine echte Sitzung.", en: "Each role issues a real session." },
  demoBarLabel:  { de: "Demo",                            en: "Demo" },
  demoBarNote:   { de: "nichts davon wird gespeichert",   en: "nothing here is saved" },
  demoLeave:     { de: "Demo verlassen",                  en: "Leave the demo" },
  opPanelOperator: { de: "Betreiber",                     en: "Operator" },
  opNavDash:     { de: "Übersicht",                       en: "Dashboard" },
  opdSub:        { de: "Was kaputt ist, wo – und seit wann.", en: "What is broken, where, and for how long." },
  opdUnits:      { de: "Wohnungen",                       en: "units" },
  opdRooms:      { de: "Zimmer",                          en: "rooms" },
  opdOpenShort:  { de: "offen",                           en: "open" },
  opdVacant:     { de: "Hausmeister unbesetzt",            en: "no caretaker" },
  opdNoData:     { de: "Noch nichts erfasst.",             en: "Nothing recorded yet." },
  opdNoTrend:    { de: "Noch keine Meldungen in diesem Zeitraum.", en: "No reports in this period yet." },
  opdOnlyThis:   { de: "Nur dieses Haus",                  en: "Only this building" },
  opdReported:   { de: "gemeldet",                         en: "reported" },
  opdFixedLeg:   { de: "behoben",                          en: "fixed" },
  opdTapMonth:   { de: "Monat antippen für Details",       en: "Tap a month for detail" },
  opbSub:        { de: "Belegung, Zuständigkeit und offene Meldungen je Haus.", en: "Occupancy, cover and open reports per building." },
  opsSub:        { de: "Wer welches Haus betreut.",       en: "Who covers which building." },
  orgWide:       { de: "Organisationsweit – keinem Haus zugeordnet", en: "Organisation-wide — not tied to a building" },
  inUseSince:    { de: "in Benutzung seit",               en: "in use since" },
  customiseSub:  { de: "Welche Zahlen erscheinen und wie die Diagramme aussehen.", en: "Which numbers appear, and how the charts look." },
  lockedOpenWhy: { de: "Der Bildschirm handelt von offener Arbeit.", en: "This screen is about open work." },
  lockedOldestWhy: { de: "Die eine Zahl, die eine vergessene Meldung sichtbar macht.", en: "The one number that surfaces a forgotten report." },
  whyNoLines:    { de: "Eine Linie behauptet einen Verlauf. Objekte haben keine Reihenfolge – nur eine Rangliste.", en: "A line asserts a trend. Fixtures have no order — only a ranking." },
  seedFirst:     { de: "Demodaten laden",                 en: "Load demo data" },
  seeding:       { de: "Wird geladen…",                   en: "Loading…" },
  logout:        { de: "Abmelden",                        en: "Sign out" },

  whatBroken:    { de: "Was ist defekt?",                 en: "What's broken?" },
  whatWrong:     { de: "Was ist das Problem?",            en: "What's wrong with it?" },
  noteOptional:  { de: "Notiz (optional)",                en: "Note (optional)" },
  noteWanted:      { de: "Beschreibe es kurz",       en: "Tell us briefly what it is" },
  send:          { de: "Absenden",                        en: "Send" },
  merged:        { de: "Zu bestehender Meldung hinzugefügt.", en: "Added to an existing report." },
  myReports:     { de: "Meine Meldungen",                 en: "My reports" },
  newReport:     { de: "Neue Meldung",                    en: "New report" },
  noReports:     { de: "Noch keine Meldungen.",           en: "No reports yet." },
  noReportsCta:  { de: "Melde etwas, das kaputt ist.",    en: "Report something that's broken." },
  grpAction:       { de: "Termin wählen",            en: "Pick a time" },
  grpBooked:       { de: "Termin steht",             en: "Appointment booked" },
  grpParts:        { de: "Wartet auf Teil",          en: "Waiting on a part" },
  grpOpen:         { de: "Gemeldet",                 en: "Reported" },
  grpDone:         { de: "Erledigt",                 en: "Done" },
  showOlder:       { de: "Ältere anzeigen",          en: "Show older" },
  hideOlder:       { de: "Ältere ausblenden",        en: "Hide older" },

  pickSlot:      { de: "Termin wählen",                   en: "Pick a time" },
  pickSlotHint:  { de: "Der Hausmeister hat diese Zeiten angeboten.", en: "The caretaker offered these times." },
  onlyPrimary:   { de: "Nur der Zimmerbewohner kann den Termin wählen.", en: "Only the room's resident can pick the time." },
  changeAppt:    { de: "Termin ändern",                   en: "Change appointment" },
  otherTimes:    { de: "Andere angebotene Zeiten",        en: "Other times offered" },
  askNewTimes:   { de: "Neue Zeiten anfragen",            en: "Ask for different times" },
  otherOffered:  { de: "Andere angebotene Zeiten",        en: "Other times offered" },
  confirmTime:   { de: "Termin bestätigen",               en: "Confirm this time" },
  noteFromResident: { de: "Notiz vom Bewohner",           en: "Note from the resident" },
  enterWithoutMe:{ de: "Auch ohne mich betreten",         en: "Enter without me" },
  allowed:       { de: "erlaubt",                         en: "allowed" },
  notAllowed:    { de: "nicht erlaubt",                   en: "not allowed" },
  sharedRoom:    { de: "Gemeinschaftsraum — kein Termin nötig", en: "Shared room — no appointment needed" },
  reports:       { de: "Meldungen",                       en: "reports" },
  back:          { de: "Zurück",                          en: "Back" },

  queueToday:    { de: "Warteschlange",                   en: "Queue" },
  jobs:          { de: "Aufträge",                        en: "jobs" },
  queueNew:      { de: "Ohne Termin",                     en: "No appointment" },
  queueWaiting:  { de: "Wartet auf Teil",                 en: "Waiting for parts" },
  searchQueue:     { de: "Suchen: Wohnung, Raum, Objekt, Notiz", en: "Search unit, room, fixture, note" },
  oldestFirst:     { de: "Älteste zuerst",           en: "Oldest first" },
  allJobs:         { de: "Alle Aufträge",            en: "All jobs" },
  sortByDay:       { de: "Nach Tag",                 en: "By day" },
  statusLabel:     { de: "Status",                   en: "Status" },
  sortLabel:       { de: "Sortierung",               en: "Sort" },
  accept:        { de: "Annehmen",                        en: "Accept" },
  offerSlots:    { de: "Termine anbieten",                en: "Offer times" },
  slotsOffered:  { de: "Termine angeboten",               en: "Times offered" },
  awaitingPick:  { de: "Bewohner wählt noch",             en: "Resident hasn't picked yet" },
  goFix:         { de: "Ohne Termin erledigen",           en: "Fix without appointment" },
  causeQ:        { de: "Was war die Ursache?",            en: "What was the cause?" },
  markDone:      { de: "Erledigt",                        en: "Done" },
  noAccess:      { de: "Niemand angetroffen",             en: "Nobody home" },
  partWhat:      { de: "Welches Teil?",                   en: "Which part?" },
  supplierEta:   { de: "Laut Händler",                    en: "Supplier says" },
  orderPart:     { de: "Teil bestellen",                  en: "Order part" },
  partNeeded:      { de: "Teil bestellen",           en: "Order a part" },
  cancelAppointment: { de: "Termin absagen",         en: "Cancel appointment" },
  etaHint:         { de: "Nur was der Händler sagt. Kein Versprechen.", en: "Only what the supplier said. Not a promise." },
  partArrived:   { de: "Teil ist da",                     en: "Part arrived" },

  openTickets:   { de: "Offene Meldungen",                en: "Open tickets" },
  medianFix:     { de: "Median bis Erledigung",           en: "Median time to fix" },
  waitingParts:  { de: "Wartet auf Teile",                en: "Waiting for parts" },
  failedVisits:  { de: "Vergebliche Besuche",             en: "Failed visits" },
  repeatFaults:  { de: "Wiederkehrende Fehler",           en: "Repeat faults" },
  last12:        { de: "letzte 12 Monate",                en: "last 12 months" },
  ticketsWord:   { de: "Meldungen",                       en: "tickets" },
  /* German and English both inflect here, and "1 Meldungen" reads as a bug. */
  ticketWord:    { de: "Meldung",                          en: "ticket" },
  roomsAffected: { de: "Zimmer betroffen",                en: "rooms affected" },
  systemicHint:  { de: "Ursache Strang/Leitung in",       en: "Cause logged as riser in" },
  ofWord:        { de: "von",                             en: "of" },
  buildings:     { de: "Gebäude",                         en: "Buildings" },
  roomsWord:     { de: "Zimmer",                          en: "rooms" },
  openWord:      { de: "offen",                           en: "open" },
  nothingFlagged:{ de: "Keine Auffälligkeiten.",          en: "Nothing flagged." },
  cantFixMyself:   { de: "Kann ich nicht selbst",    en: "I can't do this myself" },
  whichTrade:      { de: "Welches Gewerk?",          en: "Which trade?" },
  whyExternal:     { de: "Warum?",                   en: "Why?" },
  sendToTrade:     { de: "An Verwaltung weitergeben", en: "Send to the operator" },
  withExternal:    { de: "Bei externem Betrieb",     en: "With an external firm" },
  raisedOn:        { de: "weitergegeben",            en: "raised" },
  notCommissioned: { de: "noch nicht beauftragt",    en: "not commissioned yet" },
  commissionedTo:  { de: "beauftragt",               en: "commissioned to" },
  commissionIt:    { de: "Betrieb beauftragen",      en: "Commission a firm" },
  firmName:        { de: "Firma",                    en: "Firm" },
  orderRef:        { de: "Auftragsnummer (optional)", en: "Order reference (optional)" },
  awaitingTrade:   { de: "Bei Fachbetrieb",          en: "Awaiting a trade" },
  toCommission:    { de: "zu beauftragen",           en: "to commission" },
  giveBack:        { de: "Zurück an Hausmeister",    en: "Return to caretaker" },
  externalNote:    { de: "Ein Fachbetrieb übernimmt das.", en: "An external firm is taking this on." },
  firmWillConfirm: { de: "Sobald der Betrieb einen Termin bestätigt, kannst du ihn hier wählen.", en: "Once the firm confirms a time, you'll be able to choose it here." },
  awaitingCommission: { de: "Die Verwaltung beauftragt gerade einen Betrieb.", en: "The operator is commissioning a firm." },
  period:          { de: "Zeitraum",                 en: "Period" },
  range1:          { de: "Letzter Monat",            en: "Last month" },
  range3:          { de: "Letzte 3 Monate",          en: "Last 3 months" },
  range6:          { de: "Letzte 6 Monate",          en: "Last 6 months" },
  range12:         { de: "Letzte 12 Monate",         en: "Last 12 months" },
  buildingLabel:   { de: "Gebäude",                  en: "Building" },
  allBuildings:    { de: "Alle Gebäude",             en: "All buildings" },
  filterToThis:    { de: "Nur dieses Haus",          en: "Filter to this" },
  clearFilter:     { de: "Filter aufheben",          en: "Clear filter" },
  seeList:         { de: "Liste ansehen",            en: "See the list" },
  backToDash:      { de: "Zurück zur Übersicht",     en: "Back to dashboard" },
  nothingHere:     { de: "Nichts vorhanden.",        en: "Nothing here." },
  noData:          { de: "Keine Daten im Zeitraum.", en: "No data in this period." },
  reportedVsFixed: { de: "Gemeldet und erledigt",    en: "Reported and fixed" },
  dashboardWord:   { de: "Dashboard",                en: "Dashboard" },
  moreWord:        { de: "Mehr",                     en: "More" },
  chartsWord:      { de: "Darstellung",              en: "How it's drawn" },
  monthsWord:      { de: "Monate",                   en: "months" },
  customise:       { de: "Anpassen",                 en: "Customise" },
  whichNumbers:    { de: "Welche Zahlen?",           en: "Which numbers?" },
  alwaysShown:     { de: "immer sichtbar",           en: "always shown" },
  oldestOpen:      { de: "Älteste offen",            en: "Oldest open" },
  perRoom:         { de: "Meldungen je Zimmer",      en: "Reports per room" },
  repeatedCount:   { de: "Mehrfach gemeldet",        en: "Reported more than once" },
  byTradeWord:     { de: "Nach Gewerk",              en: "By trade" },
  chartBars:       { de: "Balken",                   en: "bars" },
  chartLines:      { de: "Linien",                   en: "lines" },
  chartDonut:      { de: "Ring",                     en: "donut" },
  allRooms2:       { de: "Alle Räume",               en: "All rooms" },
  roomBedroom:     { de: "Zimmer",                   en: "Bedroom" },
  roomKitchen:     { de: "Küche",                    en: "Kitchen" },
  roomBathroom:    { de: "Bad",                      en: "Bathroom" },
  roomCommon:      { de: "Gemeinschaft",             en: "Common areas" },
  causesLogged:    { de: "Erfasste Ursachen",        en: "Causes recorded" },
  whenTheyHappened:{ de: "Wann",                     en: "When" },
  savedWord:       { de: "Gespeichert",              en: "Saved" },
  fixed:           { de: "erledigt",                 en: "fixed" },
  stillOpen:       { de: "noch offen",               en: "still open" },
  byObject:        { de: "Häufigste Objekte",        en: "Most reported items" },
  closedInPeriod:  { de: "erledigt im Zeitraum",     en: "closed in period" },
  visits:          { de: "Besuche",                  en: "visits" },
  reportedOn:      { de: "gemeldet",                 en: "reported" },
  daysOpen:        { de: "Tage offen",               en: "days open" },
  reported:        { de: "gemeldet",                 en: "reported" },
  stillOpenN:      { de: "noch offen",               en: "still open" },
  tapMonth:        { de: "Monat antippen für Details", en: "Tap a month for details" },
  inMonth:         { de: "in diesem Monat",          en: "in this month" },
  perBuilding:     { de: "Nach Gebäude",             en: "By building" },
  perCause:        { de: "Nach Ursache",             en: "By cause" },
  noCauseYet:      { de: "Noch keine Ursachen erfasst.", en: "No causes recorded yet." },
  showTickets:     { de: "Meldungen anzeigen",       en: "Show the tickets" },
  hideTickets:     { de: "Meldungen ausblenden",     en: "Hide the tickets" },
  closeMonth:      { de: "Monat schließen",          en: "Close month" },
  setupTitle:      { de: "DormTag einrichten",       en: "Set up DormTag" },
  setupHint:       { de: "Erstes Verwaltungskonto anlegen.", en: "Create the first operator account." },
  nameLabel:       { de: "Name",                     en: "Name" },
  pwRule:          { de: "Mindestens 10 Zeichen.",   en: "At least 10 characters." },
  confirmPassword: { de: "Passwort wiederholen",     en: "Repeat the password" },
  showPassword:    { de: "Passwort anzeigen",        en: "Show the password" },
  hidePassword:    { de: "Passwort verbergen",       en: "Hide the password" },
  pwMismatch:      { de: "Die beiden stimmen nicht überein.", en: "Those two don't match." },
  pwMatch:         { de: "Passt",                    en: "Matches" },
  createOperator:  { de: "Konto anlegen",            en: "Create account" },
  setPassword:     { de: "Passwort festlegen",       en: "Set your password" },
  setPasswordHint: { de: "Dein Konto ist angelegt. Wähle ein Passwort.", en: "Your account exists. Choose a password." },
  forgotLink:      { de: "Passwort vergessen?",      en: "Forgot your password?" },
  forgotTitle:     { de: "Passwort zurücksetzen",    en: "Reset your password" },
  forgotHint:      { de: "Wir schicken einen Link an deine E-Mail-Adresse.", en: "We'll send a link to your email address." },
  forgotSent:      { de: "Falls es zu dieser Adresse ein Konto gibt, ist der Link unterwegs.", en: "If that address has an account, a link is on its way." },
  sendLink:        { de: "Link senden",              en: "Send the link" },
  backToSignIn:    { de: "Zurück zur Anmeldung",     en: "Back to sign in" },
  lzFor:           { de: "Für Studierendenwohnheime", en: "For student residences" },
  lzH1:            { de: "Schaden gemeldet in 15 Sekunden. Ohne Anruf, ohne E-Mail, ohne Büro.", en: "A fault reported in 15 seconds. No phone call, no email, no office." },
  lzLede:          { de: "Aufkleber an der Tür scannen, Objekt und Problem antippen, fertig. Der Hausmeister bekommt eine Warteschlange statt eines Postfachs, und der Bewohner sieht jederzeit, was passiert.", en: "Scan the sticker on the door, tap the fixture and the problem, done. The caretaker gets a queue instead of an inbox, and the resident can see what's happening." },
  lzStatA:         { de: "15 Sek.",                  en: "15 sec." },
  lzStatAL:        { de: "bis eine Meldung steht",   en: "to file a report" },
  lzStatB:         { de: "4",                        en: "4" },
  lzStatBL:        { de: "Taps für den Hausmeister", en: "taps for the caretaker" },
  lzStatC:         { de: "0",                        en: "0" },
  lzStatCL:        { de: "Apps zu installieren",     en: "apps to install" },
  lzCapResident:   { de: "Alles Offene zuerst, und genau eine Karte, die dich braucht.", en: "Everything open first, and exactly one card that needs you." },
  lzCapStaff:      { de: "Nach Tag sortiert. Was noch niemand angesehen hat, steht oben.", en: "Sorted by day. What nobody has looked at yet sits on top." },
  lzWhatEyebrow:   { de: "Was ist DormTag",          en: "What is DormTag" },
  lzWhatH:         { de: "Ein Aufkleber pro Objekt. Eine Warteschlange pro Haus.", en: "One sticker per fixture. One queue per building." },
  lzWhatP:         { de: "DormTag ersetzt Zettel, Mails und Anrufe durch einen festen Ort für jede Meldung: am Objekt selbst, nicht in einem Postfach.", en: "DormTag replaces notes, emails and phone calls with one fixed place for every report: on the fixture itself, not in an inbox." },
  lzWho1:          { de: "Bewohner",                 en: "Residents" },
  lzWho1P:         { de: "Scannen oder Raum wählen, Objekt, Problem. Kein Konto nötig, kein Formular, kein Deutsch-Test.", en: "Scan or pick a room, then the fixture and the problem. No account, no form, no German test." },
  lzWho2:          { de: "Hausmeister",              en: "Caretakers" },
  lzWho2P:         { de: "Eine Liste statt Postfach. Zeiten anbieten, mit Ursache schließen. Vier Taps, kein Tippen.", en: "A list instead of an inbox. Offer times, close with a cause. Four taps, no typing." },
  lzWho3:          { de: "Verwaltung",               en: "Administration" },
  lzWho3P:         { de: "Sieht wiederkehrende Fehler, Median bis Erledigung und vergebliche Besuche, je Haus und je Objekt.", en: "Sees repeat faults, median time to fix and failed visits, per building and per fixture." },
  lzFlowEyebrow:   { de: "Ablauf",                   en: "How it works" },
  lzFlowH:         { de: "Vom Aufkleber bis erledigt.", en: "From sticker to fixed." },
  lzS1:            { de: "Scannen",                  en: "Scan" },
  lzS1P:           { de: "Aufkleber an Tür oder Objekt. Raum und Objekt sind damit gesetzt.", en: "Sticker on the door or the fixture. That settles which room and which item." },
  lzS2:            { de: "Problem antippen",         en: "Tap the problem" },
  lzS2P:           { de: "Kein warmes Wasser, undicht, klemmt: aus einer kurzen Liste.", en: "No hot water, leaking, stuck: from a short list." },
  lzS3:            { de: "Zeit wählen",              en: "Pick a time" },
  lzS3P:           { de: "Der Hausmeister bietet Zeiten an. Eine antippen.", en: "The caretaker offers times. Tap one." },
  lzS4:            { de: "Erledigt",                 en: "Fixed" },
  lzS4P:           { de: "Bleibt am Zimmer und am Objekt gespeichert, auch nächstes Semester.", en: "Stays on the room and the fixture, into next semester." },
  lzT1:            { de: "0:03",                     en: "0:03" },
  lzT2:            { de: "0:11",                     en: "0:11" },
  lzT3:            { de: "später",                   en: "later" },
  lzT4:            { de: "sichtbar",                 en: "on record" },
  lzC1:            { de: "Annehmen",                  en: "Accept" },
  lzC1P:           { de: "Neue Meldungen stehen oben, mit Notiz und Alter des Auftrags.", en: "New reports sit on top, with the note and the job's age." },
  lzC2:            { de: "Zeiten anbieten",           en: "Offer times" },
  lzC2P:           { de: "Zeiten aus dem Raster. Gemeinschaftsräume brauchen keinen Termin.", en: "Times from the grid. Shared rooms need no appointment." },
  lzC3:            { de: "Teil oder Fachbetrieb",     en: "Part or trade" },
  lzC3P:           { de: "Teil mit Liefertermin bestellen, oder an die Verwaltung geben.", en: "Order a part with an ETA, or hand it to the operator." },
  lzC4:            { de: "Mit Ursache schließen",     en: "Close with a cause" },
  lzC4P:           { de: "Dichtung, Verstopfung oder Sicherung. Daraus entstehen die Kennzahlen.", en: "Seal, blockage or fuse. That is what the statistics are built from." },
  lzCT1:           { de: "1 Tap",                     en: "1 tap" },
  lzCT2:           { de: "3 Taps",                    en: "3 taps" },
  lzCT3:           { de: "optional",                  en: "optional" },
  lzCT4:           { de: "1 Tap",                     en: "1 tap" },
  lzO1:            { de: "Häuser anlegen",              en: "Set up the buildings" },
  lzO1P:           { de: "Gebäude, Wohnungen und Räume anlegen oder das Muster einmal beschreiben und hundert Wohnungen daraus erzeugen.", en: "Add buildings, units and rooms — or describe the pattern once and generate a hundred units from it." },
  lzOT1:           { de: "einmalig",                    en: "one-off" },
  lzO2:            { de: "Bögen drucken",               en: "Print the sheets" },
  lzO2P:           { de: "Ein QR-Code je Objekt, dazu ein Zugangscode je Zimmer. Filtern, drucken, kleben.", en: "One QR code per fixture, plus an access code per room. Filter, print, stick." },
  lzOT2:           { de: "1 Bogen je Raum",             en: "1 sheet per room" },
  lzO3:            { de: "Personal einladen",           en: "Invite the staff" },
  lzO3P:           { de: "Hausmeister per Link einladen und Häuser zuweisen. Kein Passwort am Telefon.", en: "Invite caretakers by link and assign their buildings. No passwords over the phone." },
  lzOT3:           { de: "1 Link",                      en: "1 link" },
  lzO4:            { de: "Muster lesen",                en: "Read the pattern" },
  lzO4P:           { de: "Median bis Erledigung, vergebliche Besuche und wiederkehrende Fehler je Strang am Laptop, über alle Häuser.", en: "Median time to fix, failed visits and repeat faults per riser on a laptop, across every building." },
  lzOT4:           { de: "laufend",                     en: "ongoing" },
  lzPrintTitle:    { de: "Die Aufkleber druckst du selbst.", en: "You print the stickers yourself." },
  lzPrintP:        { de: "Pro Raum ein Bogen: ein Code je Objekt, dazu ein Zugangscode für Bewohner ohne Smartphone. Kleben, fertig. Keine Installation.", en: "One sheet per room: a code per fixture, plus an access code for residents without a smartphone. Stick it up and you're live. Nothing to install." },
  lzPrintSheet:    { de: "Druckbogen · Bad",         en: "Print sheet · Bathroom" },
  lzRoomCode:      { de: "Zugangscode für das Zimmer", en: "Access code for the room" },
  lzSeeDemo:       { de: "Im Demo ansehen",          en: "See it in the demo" },
  lzDemoBtn:       { de: "Demo ansehen",             en: "See the demo" },
  lzRegister:      { de: "Häuser registrieren",      en: "Register your halls" },
  lzNavFlow:       { de: "Ablauf",                   en: "How it works" },
  lzNavFor:        { de: "Für Träger",               en: "For operators" },
  lzOpH:           { de: "Häuser registrieren.",      en: "Register your halls." },
  lzOpP:           { de: "Wir legen Gebäude, Räume und Objekte an und schicken die Druckbögen. Ein Haus als Pilot reicht zum Anfangen.", en: "We set up buildings, rooms and fixtures and send you the print sheets. One building as a pilot is enough to start." },
  lzOpT1:          { de: "In einer Woche eingerichtet, kein IT-Projekt", en: "Set up in a week, no IT project" },
  lzOpT2:          { de: "Läuft im Browser, kein App Store nötig", en: "Runs in the browser, no app store needed" },
  lzOpT3:          { de: "Deutsch und Englisch, DSGVO-konform, Server in der EU", en: "German and English, GDPR-compliant, servers in the EU" },
  lzFormH:         { de: "Zugang anlegen",            en: "Create your account" },
  lzFormP:         { de: "Wir schicken einen Link zum Passwort setzen. Danach prüfen wir die Anmeldung.", en: "We'll send a link to set your password. Then we review the signup." },
  lzOrgLabel:      { de: "Organisation",              en: "Organisation" },
  lzOrgPh:         { de: "z. B. Studierendenwerk Magdeburg", en: "e.g. Mainz student services" },
  lzNameLabel:     { de: "Dein Name",                 en: "Your name" },
  lzEmailPh:       { de: "name@org.de",               en: "name@org.de" },
  lzSendReq:       { de: "Registrieren",              en: "Register" },
  lzFormNote:      { de: "Nur für die Antwort. Wird nicht weitergegeben.", en: "Used only to reply. Never shared." },
  lzSignInSub:     { de: "Mit dem Code von deiner Zimmertür.", en: "With the code from your room door." },
  lzSignInSubS:    { de: "Für Hausmeister und Verwaltung.", en: "For caretakers and operators." },
  lzSeeReports:    { de: "Meine Meldungen ansehen",   en: "See my reports" },
  lzCodeHint:      { de: "Steht auf dem Bogen an deiner Zimmertür. Kein Konto, kein Passwort.", en: "It's on the sheet at your room door. No account, no password." },
  lzOrScan:        { de: "Oder direkt am Objekt melden:", en: "Or report right at the fixture:" },
  lzScanSticker:   { de: "Aufkleber scannen",         en: "Scan a sticker" },
  lzImResident:    { de: "Ich bin Bewohner",          en: "I'm a resident" },
  lzDemoSub:       { de: "Echte Daten aus einem Beispielhaus. Es wird nichts verschickt.", en: "Real data from an example building. Nothing gets sent." },
  lzAsResident:    { de: "Als Bewohner",              en: "As a resident" },
  lzAsResidentP:   { de: "Melden, Termin wählen, Status verfolgen", en: "Report, pick a time, follow the status" },
  lzAsStaff:       { de: "Als Hausmeister",           en: "As a caretaker" },
  lzAsStaffP:      { de: "Warteschlange, Zeiten anbieten, abschließen", en: "Queue, offer times, close jobs" },
  lzAsOperator:    { de: "Als Verwaltung",            en: "As an operator" },
  lzAsOperatorP:   { de: "Kennzahlen, wiederkehrende Fehler, Gebäude", en: "Metrics, repeat faults, buildings" },
  lzDemoNote:      { de: "Kein Konto, keine Mail. Jederzeit zurücksetzbar.", en: "No account, no email. Reset any time." },
  landingTry:      { de: "Demo ausprobieren",        en: "Try the demo" },
  landingRegister: { de: "Wohnheim registrieren",     en: "Register your halls" },
  landingSignIn:   { de: "Anmelden",                  en: "Sign in" },
  landingAsk:      { de: "Fragen? Schreib uns",       en: "Questions? Get in touch" },
  demoPick:        { de: "Als wen möchtest du schauen?", en: "Who would you like to look as?" },
  signupTitle:     { de: "Wohnheim registrieren",     en: "Register your halls" },
  signupOrgName:   { de: "Name der Organisation",     en: "Organisation name" },
  signupHint:      { de: "Wir schicken einen Link zum Passwort setzen. Danach prüfen wir die Anmeldung.", en: "We'll send a link to set your password. Then we review the signup." },
  signupSent:      { de: "Fertig. Schau in dein Postfach.", en: "Done. Check your inbox." },
  signupBtn:       { de: "Registrieren",              en: "Register" },
  pendingTitle:    { de: "Warten auf Freigabe",       en: "Waiting for approval" },
  pendingBody:     { de: "Deine Organisation ist angelegt und wird geprüft. Wir melden uns per E-Mail.", en: "Your organisation exists and is being reviewed. We'll email you." },
  suspendedTitle:  { de: "Zugang gesperrt",           en: "Access suspended" },
  suspendedBody:   { de: "Der Zugang dieser Organisation ist derzeit gesperrt.", en: "This organisation's access is currently suspended." },
  orgsWord:        { de: "Organisationen",            en: "Organisations" },
  thisIsYou:       { de: "Deine eigene Organisation", en: "Your own organisation" },
  demoPermanent:   { de: "Die Demo bleibt bestehen",  en: "The demo stays as it is" },
  exportWord:      { de: "Daten exportieren",        en: "Export data" },
  deleteWord:      { de: "Löschen",                  en: "Delete" },
  deleteOnlyEmpty: { de: "Nur wenn nichts drin ist.", en: "Only when there's nothing in it." },
  orgPending:      { de: "wartet",                    en: "pending" },
  orgActive:       { de: "aktiv",                     en: "active" },
  orgSuspended:    { de: "gesperrt",                  en: "suspended" },
  orgRejected:     { de: "abgelehnt",                 en: "rejected" },
  orgDemo:         { de: "Demo",                      en: "demo" },
  approveWord:     { de: "Freigeben",                 en: "Approve" },
  suspendWord:     { de: "Sperren",                   en: "Suspend" },
  rejectWord:      { de: "Ablehnen",                  en: "Reject" },
  buildingsWord:   { de: "Gebäude",                   en: "buildings" },
  peopleWord:      { de: "Personen",                  en: "people" },
  signedUpOn:      { de: "angemeldet",                en: "signed up" },
  newPassword:     { de: "Neues Passwort",           en: "New password" },
  currentPassword: { de: "Aktuelles Passwort",       en: "Current password" },
  changePassword:  { de: "Passwort ändern",          en: "Change password" },
  passwordChanged: { de: "Passwort geändert",        en: "Password changed" },
  signedOutElse:   { de: "Andere Geräte wurden abgemeldet.", en: "Other devices have been signed out." },
  manageWord:      { de: "Verwalten",                en: "Manage" },
  staffWord:       { de: "Personal",                 en: "Staff" },
  addBuilding:     { de: "Gebäude anlegen",          en: "Add building" },
  buildingCode:    { de: "Kürzel",                   en: "Code" },
  buildingName:    { de: "Name",                     en: "Name" },
  roomCount:       { de: "Zimmer geplant",           en: "Rooms planned" },
  codeFixedHint:   { de: "Das Kürzel steckt in jedem QR-Aufkleber und lässt sich später nicht ändern. Der Name schon.", en: "The code is baked into every QR sticker and can't be changed later. The name can." },
  create:          { de: "Anlegen",                  en: "Create" },
  save:            { de: "Speichern",                en: "Save" },
  noBuildings:     { de: "Noch keine Gebäude.",      en: "No buildings yet." },
  noUnits:         { de: "Noch keine Wohnungen.",    en: "No units yet." },
  unitsWord:       { de: "Wohnungen",                en: "units" },
  plannedWord:     { de: "geplant",                  en: "planned" },
  noCaretaker:     { de: "Kein Hausmeister zugewiesen", en: "No caretaker assigned" },
  addUnit:         { de: "Wohnung anlegen",          en: "Add unit" },
  addManyUnits:    { de: "Viele Wohnungen anlegen",  en: "Add many units" },
  bulkHint:        { de: "Muster einmal beschreiben, statt hundert Formulare.", en: "Describe the pattern once instead of filling in a hundred forms." },
  floorsFrom:      { de: "Etagen von",               en: "Floors from" },
  floorsTo:        { de: "bis",                      en: "to" },
  perFloor:        { de: "Wohnungen pro Etage",      en: "Units per floor" },
  numbering:       { de: "Nummerierung",             en: "Numbering" },
  numberByFloor:   { de: "Etage + Nummer (101, 102)", en: "Floor + number (101, 102)" },
  numberSeq:       { de: "Durchgehend (1, 2, 3)",    en: "Straight through (1, 2, 3)" },
  layoutWord:      { de: "Grundriss",                en: "Layout" },
  bedroomsWord:    { de: "Zimmer pro WG",            en: "Bedrooms per flat" },
  commonEachFloor: { de: "Flur je Etage",            en: "Corridor on each floor" },
  previewWord:     { de: "Vorschau",                 en: "Preview" },
  willCreate:      { de: "wird angelegt",            en: "will be created" },
  unitsWillBe:     { de: "Wohnungen",                en: "units" },
  roomsWillBe:     { de: "Räume",                    en: "rooms" },
  objectsWillBe:   { de: "Objekte",                  en: "fixtures" },
  skippedExisting: { de: "übersprungen, gibt es schon", en: "skipped, already there" },
  createThem:      { de: "Anlegen",                  en: "Create them" },
  createdUnits:    { de: "Wohnungen angelegt",       en: "units created" },
  workingOnIt:     { de: "Wird angelegt…",           en: "Creating…" },
  unitCode:        { de: "Nummer",                   en: "Number" },
  floorLabel:      { de: "Etage",                    en: "Floor" },
  studio:          { de: "Einzelapartment",          en: "Studio" },
  wg:              { de: "WG",                       en: "Shared flat" },
  isCommonArea:    { de: "Gemeinschaftsbereich",     en: "Common area" },
  yes:             { de: "Ja",                       en: "Yes" },
  no:              { de: "Nein",                     en: "No" },
  roomsInUnit:     { de: "Räume",                    en: "Rooms" },
  addRoom:         { de: "Raum hinzufügen",          en: "Add a room" },
  privateRoom:     { de: "privat",                   en: "private" },
  renameRoom:      { de: "Raum benennen",            en: "Rename room" },
  commonShort:     { de: "gemeinsam",                en: "common" },
  addStaff:        { de: "Person hinzufügen",        en: "Add someone" },
  coversWhich:     { de: "Welche Gebäude?",          en: "Which buildings?" },
  setupLink:       { de: "Einrichtungslink",         en: "Setup link" },
  setupLinkHint:   { de: "Schick den Link der Person. Gilt 7 Tage, einmal nutzbar.", en: "Send this to them. Valid 7 days, single use." },
  newSetupLink:    { de: "Neuer Link",               en: "New setup link" },
  neverSignedIn:   { de: "Noch kein Passwort gesetzt", en: "Hasn't set a password yet" },
  disabledWord:    { de: "Deaktiviert",              en: "Disabled" },
  disableWord:     { de: "Deaktivieren",             en: "Disable" },
  enableWord:      { de: "Reaktivieren",             en: "Re-enable" },
  editCoverage:    { de: "Gebäude ändern",           en: "Change buildings" },
  noBuildingsAssigned: { de: "Keine Gebäude zugewiesen", en: "No buildings assigned" },
  coveredBy:       { de: "Betreut von",              en: "Covered by" },
  noCaretakersYet: { de: "Noch kein Hausmeister angelegt.", en: "No caretakers created yet." },
  editBuilding:    { de: "Gebäude bearbeiten",       en: "Edit building" },
  codeFixedShort:  { de: "nicht änderbar",           en: "can't be changed" },
  notifications:   { de: "Benachrichtigungen",       en: "Notifications" },
  noNotifications: { de: "Nichts Neues.",            en: "Nothing new." },
  markAllRead:     { de: "Alle als gelesen",         en: "Mark all read" },
  language:        { de: "Sprache",                  en: "Language" },
  emailUpdates:    { de: "E-Mail-Updates",           en: "Email updates" },
  emailHint:       { de: "Wir schreiben nur zu deinen Meldungen. Sonst nichts.", en: "We only write about your own reports. Nothing else." },
  emailNone:       { de: "Keine E-Mail hinterlegt",  en: "No address saved" },
  emailOn:         { de: "An",                       en: "On" },
  emailOff:        { de: "Aus",                      en: "Off" },
  emailSaved:      { de: "Gespeichert",              en: "Saved" },
  emailPlaceholder:{ de: "du@beispiel.de",           en: "you@example.com" },
  account:         { de: "Konto",                    en: "Account" },
  nReported:       { de: "Neue Meldung",             en: "New report" },
  nSlotsOffered:   { de: "Termine angeboten",        en: "Times offered" },
  nBooked:         { de: "Termin gebucht",           en: "Appointment booked" },
  nRebooked:       { de: "Termin geändert",          en: "Appointment changed" },
  nTenantRescheduled: { de: "Bewohner hat verschoben", en: "Resident moved the appointment" },
  nStaffCancelled: { de: "Termin abgesagt",          en: "Appointment cancelled" },
  nPartOrdered:    { de: "Teil bestellt",            en: "Part ordered" },
  nPartArrived:    { de: "Teil ist da",              en: "Part arrived" },
  nFixed:          { de: "Erledigt",                 en: "Fixed" },
  nEscalated:      { de: "An Fachbetrieb gegeben",   en: "Handed to a trade" },
  nReminder:       { de: "Termin morgen:",           en: "Appointment tomorrow:" },

  st_reported:   { de: "Gemeldet",                        en: "Reported" },
  st_accepted:   { de: "Angenommen",                      en: "Accepted" },
  st_slots_offered:{ de: "Termine angeboten",             en: "Times offered" },
  st_scheduled:  { de: "Termin steht",                    en: "Appointment set" },
  st_waiting_for_parts: { de: "Wartet auf Teil",          en: "Waiting for part" },
  st_done:       { de: "Erledigt",                        en: "Done" },
  st_cancelled:  { de: "Abgebrochen",                     en: "Cancelled" },

  signInTitle:    { de: "Anmelden",                  en: "Sign in" },
  iLiveHere:      { de: "Ich wohne hier",            en: "I live here" },
  iWorkHere:      { de: "Personal",                  en: "Staff" },
  accessCode:     { de: "Zugangscode",               en: "Access code" },
  codeHint:       { de: "Steht in deinem Willkommensschreiben.", en: "It's on your welcome letter." },
  emailLabel:     { de: "E-Mail",                    en: "Email" },
  passwordLabel:  { de: "Passwort",                  en: "Password" },
  signInBtn:      { de: "Anmelden",                  en: "Sign in" },
  aboutLink:       { de: "Was ist DormTag?",         en: "What is DormTag?" },
  aboutTitle:      { de: "DormTag",                  en: "DormTag" },
  aboutLead:       {
    de: "Im Wohnheim ist etwas kaputt. Aufkleber scannen, antippen was es ist, Termin wählen. Keine Mail, kein Warten auf eine Antwort, die nie kommt.",
    en: "Something's broken in the halls. Scan the sticker, tap what it is, pick a time. No email, no waiting for a reply that never comes.",
  },
  aboutLead2:      {
    de: "Jede Reparatur wird dem Raum und dem Objekt zugeordnet. Nach einem Jahr sieht die Verwaltung nicht elf Beschwerden, sondern ein Rohr.",
    en: "Every repair is logged to the room and the fixture it happened to. After a year the operator doesn't see eleven complaints, they see one pipe.",
  },
  aboutResident:   { de: "Du wohnst hier?",          en: "Living here?" },
  aboutResidentTxt:{
    de: "Melden in zwanzig Sekunden, auf Deutsch oder Englisch. Termin selbst wählen, damit niemand klingelt, während du in der Vorlesung sitzt. Und du siehst, wenn ein Ersatzteil unterwegs ist.",
    en: "Report it in twenty seconds, in German or English. Pick the appointment yourself so nobody rings the bell while you're in a lecture. And you can see when a part is on order.",
  },
  aboutStaff:      { de: "Du betreust das Haus?",    en: "Looking after the building?" },
  aboutStaffTxt:   {
    de: "Eine Warteschlange statt eines Postfachs. Zeiten anbieten, mit einer Ursache abschließen, Elektroarbeiten an einen Fachbetrieb geben. Vier Fingertipps, kein Tippen.",
    en: "One queue instead of a mailbox. Offer times, close a job with a cause, hand electrical work to a qualified firm. Four taps, no typing.",
  },
  aboutOperator:   { de: "Du verwaltest mehrere Häuser?", en: "Managing several buildings?" },
  aboutOperatorTxt:{
    de: "Zahlen, die man anklicken kann: was offen ist, was auf Teile wartet, wie oft niemand da war, und welcher Strang immer wieder Ärger macht.",
    en: "Numbers you can click into: what's open, what's waiting on parts, how often nobody was home, and which riser keeps causing trouble.",
  },
  // Footer text intentionally blank: Auth.tsx still renders this slot.
  aboutFooter:     { de: "", en: "" },
  aboutTag1:       { de: "Scannen.",                 en: "Scan it." },
  aboutTag2:       { de: "Termin. Erledigt.",        en: "Book it. Done." },

  demoCreds:      { de: "Demo-Zugangsdaten",         en: "Demo credentials" },
  useThese:       { de: "Einsetzen",                 en: "Use these" },
  signInToReport: { de: "Für dein Zimmer musst du angemeldet sein.", en: "Sign in to report your own room." },
  scanAgain:      { de: "Anderes Objekt im Raum",    en: "Another item in this room" },
  reportSent:     { de: "Meldung ist eingegangen.",  en: "Your report is in." },
  saveLink:       { de: "Link speichern, um den Status zu sehen.", en: "Save this link to check the status." },
  copyLink:       { de: "Link kopieren",             en: "Copy link" },
  copied:         { de: "Kopiert",                   en: "Copied" },
  stickers:       { de: "QR-Aufkleber",              en: "QR stickers" },
  printSheet:     { de: "Bogen drucken",             en: "Print sheet" },
  printStickers:   { de: "Aufkleber drucken",        en: "Print stickers" },
  accessCodes:     { de: "Zugangscodes",             en: "Access codes" },
  turnoverWord:    { de: "Neuer Bewohner",           en: "New resident" },
  historyWord:     { de: "Verlauf",                  en: "History" },
  hideHistory:     { de: "Verlauf ausblenden",       en: "Hide history" },
  currentHolder:   { de: "aktuell",                  en: "current" },
  endedOn:         { de: "beendet",                  en: "ended" },
  noHistoryYet:    { de: "Noch kein Wechsel.",       en: "No handover yet." },
  wasUsed:         { de: "benutzt",                  en: "used" },
  turnoverHint:    { de: "Alter Code, Sitzungen und Links werden ungültig.", en: "The old code, sessions and links all stop working." },
  turnoverNote:    { de: "Notiz (optional)",         en: "Note (optional)" },
  reissueAll:      { de: "Alle Codes neu",           en: "Reissue every code" },
  reissueWarn:     { de: "Für ein leergezogenes Haus. Sonst besser einzeln.", en: "For a building emptied out. Otherwise do it one room at a time." },
  issuedOn:        { de: "ausgegeben",               en: "issued" },
  neverUsed:       { de: "nie benutzt",              en: "never used" },
  codesFor:        { de: "Codes für",                en: "Codes for" },
  generateCodes:   { de: "Codes erzeugen",           en: "Generate codes" },
  rotateCodes:     { de: "Semesterwechsel",          en: "New semester" },
  rotateWarn:      { de: "Alle bisherigen Codes werden ungültig.", en: "Every existing code stops working." },
  semesterLabel:   { de: "Semester",                 en: "Semester" },
  codesIssued:     { de: "Codes erzeugt",            en: "codes issued" },
  noneMissing:     { de: "Jedes Zimmer hat schon einen Code.", en: "Every room already has a code." },
  withoutCode:     { de: "ohne Code",                en: "without a code" },
  printCodes:      { de: "Liste drucken",            en: "Print the list" },
  newCodeFor:      { de: "Neuer Code",               en: "New code" },
  codeWarn:        { de: "Das ist eine Liste gültiger Zugänge. Nur ausgedruckt weitergeben.", en: "This is a list of working credentials. Hand it out on paper only." },
  roomWord:        { de: "Zimmer",                   en: "Room" },
  codeWord:        { de: "Code",                     en: "Code" },
  allFloors:       { de: "Alle Etagen",              en: "All floors" },
  allRooms:        { de: "Alle Räume",               en: "All rooms" },
  findUnit:        { de: "Wohnung suchen",           en: "Find a unit" },
  selectedWord:    { de: "ausgewählt",               en: "selected" },
  filteredWord:    { de: "gefiltert",                en: "filtered" },
  clearSelection:  { de: "Auswahl aufheben",         en: "Clear selection" },
  pickBuilding:   { de: "Gebäude wählen",            en: "Choose a building" },
  stickerCount:   { de: "Aufkleber",                 en: "stickers" },
  backToApp:      { de: "Zurück",                    en: "Back" },
  reportProblem:  { de: "Schaden melden",            en: "Report a problem" },
  floorShort:      { de: "OG",                       en: "Floor " },
  pickTheItem:     { de: "Was in diesem Raum?",      en: "Which item in this room?" },
  yourFlat:       { de: "deine Wohnung",             en: "your flat" },
  yourRoom:        { de: "dein Zimmer",              en: "your room" },
  sharedTag:       { de: "gemeinsam",                en: "shared" },
  orChooseRoom:    { de: "oder Raum wählen",         en: "or choose a room" },
  scanKnowsItem:   { de: "Erkennt das genaue Objekt", en: "Knows the exact item" },
  openCamera:      { de: "Kamera öffnen",            en: "Open camera" },
  outsideFlat:     { de: "Etwas außerhalb deiner Wohnung? Dort den Aufkleber scannen.", en: "Something outside your flat? Scan the sticker there." },
  slotLength:      { de: "Jeder Termin dauert {n} Minuten.", en: "Each visit is {n} minutes." },
  step1Day:        { de: "1. Tag wählen",            en: "1. Pick a day" },
  step2Times:      { de: "2. Uhrzeiten antippen",    en: "2. Tap the times" },
  upToN:           { de: "bis zu {n}",               en: "up to {n}" },
  pickAtLeastOne:  { de: "Noch keine Zeit gewählt.", en: "No times chosen yet." },
  youAreOffering:  { de: "Du bietest an",            en: "You're offering" },
  residentPicksOne:{ de: "Der Bewohner wählt eine davon aus.", en: "The resident picks one of these." },
  addTime:         { de: "Hinzufügen",               en: "Add" },
  timeLabel:       { de: "Uhrzeit",                  en: "Time" },
  durationLabel:   { de: "Dauer",                    en: "Duration" },
  tooManyTimes:    { de: "Genug Zeiten gewählt.",    en: "That's enough times." },
  timeInPast:      { de: "Diese Zeit ist vorbei.",   en: "That time has passed." },
  timesOverlap:    { de: "Überschneidet sich mit einer gewählten Zeit.", en: "That overlaps a time you already picked." },
  awaitingTimes:   { de: "Der Hausmeister schlägt neue Zeiten vor.", en: "The caretaker will propose new times." },
  noTimesLeft:     { de: "Keine weiteren Zeiten offen — bitte neue anbieten.", en: "No times left — offer new ones." },
  reoffer:         { de: "Andere Zeiten anbieten",   en: "Offer different times" },
  skippedBusy:     { de: "Zeiten übersprungen, du bist dort schon gebucht.", en: "Some times were skipped — you're already booked then." },
  chooseTimes:     { de: "Zeiten auswählen",         en: "Choose times" },
  chooseTimesHint: { de: "Bis zu 4 Zeiten anbieten. Der Bewohner wählt eine.", en: "Offer up to 4 times. The resident picks one." },
  sendOffer:       { de: "Zeiten anbieten",          en: "Offer these times" },
  changeTimes:     { de: "Zeiten ändern",            en: "Change times" },
  alreadyBooked:   { de: "schon vergeben",           en: "already booked" },
  selectedCount:   { de: "ausgewählt",               en: "selected" },
  cancel:          { de: "Abbrechen",                en: "Cancel" },
  morning:         { de: "Vormittag",                en: "Morning" },
  afternoon:       { de: "Nachmittag",               en: "Afternoon" },
  scanQrTitle:    { de: "QR-Code scannen",           en: "Scan a QR code" },
  scanHint:       { de: "Aufkleber im Rahmen halten", en: "Hold the sticker in the frame" },
  scanOpen:       { de: "Scannen",                   en: "Scan" },
  scanStart:      { de: "Kamera bereit.",            en: "Camera ready." },
  scanStarting:   { de: "Kamera startet…",           en: "Starting camera…" },
  scanAim:        { de: "Aufkleber ins Bild halten", en: "Point at the sticker" },
  scanDenied:     { de: "Kamerazugriff wurde abgelehnt. In den Browsereinstellungen erlauben.", en: "Camera access was refused. Allow it in your browser settings." },
  scanInsecure:   { de: "Kamera braucht HTTPS.",     en: "The camera needs HTTPS." },
  scanNoCamera:   { de: "Keine Kamera gefunden.",    en: "No camera found." },
  scanError:      { de: "Kamera konnte nicht gestartet werden.", en: "Couldn't start the camera." },
  scanRetry:      { de: "Nochmal versuchen",         en: "Try again" },
  scanFallback:   { de: "Die normale Kamera-App liest den Code auch.", en: "Your phone's normal camera app reads it too." },
  close:          { de: "Schließen",                 en: "Close" },
} as const;

export type StrKey = keyof typeof T;

/** Event reason codes → timeline labels. */
export const REASON = {
  reported:      { de: "Gemeldet",                     en: "Reported" },
  accepted:      { de: "Vom Hausmeister angenommen",   en: "Accepted by caretaker" },
  slots_offered: { de: "Termine angeboten",            en: "Times offered" },
  booked:        { de: "Termin gebucht",               en: "Appointment booked" },
  rebooked:      { de: "Termin geändert",              en: "Appointment changed" },
  reschedule:    { de: "Termin abgesagt",              en: "Appointment cancelled" },
  needs_times:   { de: "Wartet auf neue Zeiten",       en: "Waiting for new times" },
  no_access:     { de: "Niemand angetroffen",          en: "Nobody was home" },
  part_ordered:  { de: "Teil bestellt",                en: "Part ordered" },
  part_arrived:  { de: "Teil geliefert",               en: "Part arrived" },
  fixed:         { de: "Erledigt",                     en: "Fixed" },
} as const;

export const ROOM_TYPE = {
  BEDROOM:  { de: "Zimmer",     en: "Bedroom" },
  KITCHEN:  { de: "Küche",      en: "Kitchen" },
  BATHROOM: { de: "Bad",        en: "Bathroom" },
  HALLWAY:  { de: "Flur",       en: "Hallway" },
  LAUNDRY:  { de: "Waschküche", en: "Laundry" },
} as const;

export const OBJECT_TYPE: Record<string, { de: string; en: string; icon: LucideIcon }> = {
  SINK:     { de: "Spüle",         en: "Sink",     icon: Droplet },
  STOVE:    { de: "Herd",          en: "Stove",    icon: Flame },
  LIGHT:    { de: "Licht",         en: "Light",    icon: Lightbulb },
  FRIDGE:   { de: "Kühlschrank",   en: "Fridge",   icon: Refrigerator },
  RADIATOR: { de: "Heizung",       en: "Radiator", icon: Thermometer },
  SHOWER:   { de: "Dusche",        en: "Shower",   icon: ShowerHead },
  DRAIN:    { de: "Abfluss",       en: "Drain",    icon: Droplet },
  WASHER:   { de: "Waschmaschine", en: "Washer",   icon: WashingMachine },
  DOOR:     { de: "Tür",           en: "Door",     icon: DoorClosed },
  WINDOW:   { de: "Fenster",       en: "Window",   icon: Wind },
  SOCKET:   { de: "Steckdose",     en: "Socket",   icon: Plug },
};

export const SYMPTOM = {
  LEAKING:      { de: "undicht",              en: "leaking" },
  BLOCKED:      { de: "verstopft",            en: "blocked" },
  NO_POWER:     { de: "geht nicht",           en: "not working" },
  NOT_HEATING:  { de: "wird nicht warm",      en: "not heating" },
  NOT_COOLING:  { de: "kühlt nicht",          en: "not cooling" },
  NO_HOT_WATER: { de: "kein warmes Wasser",   en: "no hot water" },
  DRAUGHTY:     { de: "zieht",                en: "draughty" },
  STUCK:        { de: "klemmt",               en: "stuck" },
  NOISE:        { de: "macht Geräusche",      en: "making noise" },
  BROKEN:       { de: "kaputt",               en: "broken" },
  OTHER:        { de: "etwas anderes",        en: "something else" },
  // Retired, kept so tickets reported before the split still read correctly.
  // "not heating" made no sense on a window or a fridge, which is what the
  // three specific codes above replace.
  COLD:         { de: "wird nicht warm",      en: "not heating" },
} as const;

/**
 * The symptoms offered per fixture.
 *
 * Deliberately short lists. A resident tapping three wrong-sounding options is
 * worse than tapping "something else" and typing a sentence, which is why OTHER
 * closes every list rather than existing as a fallback nobody reaches.
 */
export const SYMPTOMS_FOR: Record<string, (keyof typeof SYMPTOM)[]> = {
  SINK:     ["LEAKING", "BLOCKED", "BROKEN", "OTHER"],
  DRAIN:    ["BLOCKED", "LEAKING", "NOISE", "OTHER"],
  SHOWER:   ["NO_HOT_WATER", "LEAKING", "BLOCKED", "BROKEN", "OTHER"],
  LIGHT:    ["NO_POWER", "BROKEN", "OTHER"],
  SOCKET:   ["NO_POWER", "BROKEN", "OTHER"],
  STOVE:    ["NO_POWER", "BROKEN", "OTHER"],
  FRIDGE:   ["NOT_COOLING", "NO_POWER", "NOISE", "OTHER"],
  RADIATOR: ["NOT_HEATING", "NOISE", "LEAKING", "OTHER"],
  WASHER:   ["NO_POWER", "LEAKING", "NOISE", "OTHER"],
  DOOR:     ["STUCK", "BROKEN", "OTHER"],
  WINDOW:   ["DRAUGHTY", "STUCK", "BROKEN", "LEAKING", "OTHER"],
};

export const TRADE = {
  ELECTRICAL: { de: "Elektro",       en: "Electrical" },
  PLUMBING:   { de: "Sanitär",       en: "Plumbing" },
  HEATING:    { de: "Heizung",       en: "Heating" },
  LOCKSMITH:  { de: "Schlosser",     en: "Locksmith" },
  GLAZING:    { de: "Glaser",        en: "Glazier" },
  PEST:       { de: "Schädlinge",    en: "Pest control" },
  LIFT:       { de: "Aufzug",        en: "Lift" },
  OTHER:      { de: "Sonstiges",     en: "Other" },
} as const;

export const ESC_REASON = {
  QUALIFICATION: { de: "Braucht Fachbetrieb", en: "Needs a qualified firm" },
  TOO_BIG:       { de: "Zu großer Umfang",    en: "Too big a job" },
  SYSTEMIC:      { de: "Wiederkehrend",       en: "Keeps coming back" },
  SAFETY:        { de: "Sicherheitsrisiko",   en: "Safety risk" },
  WARRANTY:      { de: "Garantie/Hersteller", en: "Warranty / manufacturer" },
} as const;

export const CAUSE = {
  SEAL:        { de: "Dichtung",       en: "Seal" },
  BLOCKAGE:    { de: "Verstopfung",    en: "Blockage" },
  RISER:       { de: "Rohr / Strang",  en: "Riser / pipe" },
  WIRING:      { de: "Leitung",        en: "Wiring" },
  CONSUMABLE:  { de: "Verschleißteil", en: "Consumable" },
  USER_DAMAGE: { de: "Nutzerschaden",  en: "User damage" },
} as const;

export const CAUSES_FOR: Record<string, (keyof typeof CAUSE)[]> = {
  SINK: ["SEAL", "BLOCKAGE", "RISER", "USER_DAMAGE"],
  DRAIN: ["BLOCKAGE", "RISER", "SEAL", "USER_DAMAGE"],
  SHOWER: ["SEAL", "BLOCKAGE", "RISER", "USER_DAMAGE"],
  LIGHT: ["CONSUMABLE", "WIRING", "USER_DAMAGE"],
  SOCKET: ["WIRING", "USER_DAMAGE"],
  STOVE: ["CONSUMABLE", "WIRING", "USER_DAMAGE"],
  FRIDGE: ["CONSUMABLE", "WIRING", "USER_DAMAGE"],
  RADIATOR: ["RISER", "SEAL", "CONSUMABLE"],
  WASHER: ["CONSUMABLE", "WIRING", "BLOCKAGE"],
  DOOR: ["CONSUMABLE", "USER_DAMAGE"],
  WINDOW: ["SEAL", "USER_DAMAGE"],
};

/* ---------------------------------------------------------------- */
/* formatting                                                       */
/* ---------------------------------------------------------------- */

const tag = (l: Locale) => (l === "de" ? "de-DE" : "en-GB");

export const fmtDay = (ms: number, l: Locale) =>
  new Date(ms).toLocaleDateString(tag(l), { weekday: "short", day: "numeric", month: "short" });
export const fmtTime = (ms: number, l: Locale) =>
  new Date(ms).toLocaleTimeString(tag(l), { hour: "2-digit", minute: "2-digit" });
export const fmtDT = (ms: number, l: Locale) => `${fmtDay(ms, l)} · ${fmtTime(ms, l)}`;

/* ---------------------------------------------------------------- */
/* timezone helpers — appointment hours belong to the building        */
/* ---------------------------------------------------------------- */

/**
 * Offset of `tz` from UTC at a given instant, in milliseconds.
 *
 * Formatting an instant into the zone and reading it back as if it were UTC
 * gives the offset. This is the standard trick, and it handles DST because the
 * offset is computed at that instant rather than assumed.
 */
function tzOffsetMs(ms: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = f.formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
}

/** The calendar date in `tz` at a given instant. */
export function buildingDate(ms: number, tz: string) {
  const shifted = new Date(ms + tzOffsetMs(ms, tz));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** The instant at which it is `hour:00` on the given date in `tz`. */
export function msAtBuildingHour(
  d: { year: number; month: number; day: number }, hour: number, tz: string
): number {
  const naive = Date.UTC(d.year, d.month - 1, d.day, hour, 0, 0, 0);
  // Two passes so a DST boundary between the guess and the answer settles.
  let ms = naive - tzOffsetMs(naive, tz);
  ms = naive - tzOffsetMs(ms, tz);
  return ms;
}

/** The next `count` calendar days in `tz`, starting today. */
export function buildingDays(count: number, tz: string) {
  const today = buildingDate(Date.now(), tz);
  const out: { year: number; month: number; day: number; ms: number }[] = [];
  for (let i = 0; i < count; i++) {
    const base = Date.UTC(today.year, today.month - 1, today.day + i);
    const shifted = new Date(base);
    const d = { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
    out.push({ ...d, ms: msAtBuildingHour(d, 12, tz) });   // midday: safe for labelling
  }
  return out;
}

/** Format in the building's zone, so everyone sees the caretaker's clock. */
export const fmtDayTZ = (ms: number, l: Locale, tz: string) =>
  new Date(ms).toLocaleDateString(tag(l), { weekday: "short", day: "numeric", month: "short", timeZone: tz });
export const fmtTimeTZ = (ms: number, l: Locale, tz: string) =>
  new Date(ms).toLocaleTimeString(tag(l), { hour: "2-digit", minute: "2-digit", timeZone: tz });

export const STATE_TONE: Record<string, string> = {
  reported: "neutral", accepted: "neutral", slots_offered: "warn",
  scheduled: "info", waiting_for_parts: "warn", done: "ok", cancelled: "neutral",
};

/** The signature element: the enamel door plate. */
export function plate(loc: any, l: Locale) {
  return `${loc.building_code}-${loc.unit_code} · ${roomLabel(loc.room_type, l)}`;
}

export function title(loc: any, symptom: string, l: Locale) {
  return `${objLabel(loc.object_type, l)} ${symptomLabel(symptom, l)}`;
}

/* ---------------------------------------------------------------- */
/* API client                                                       */
/* ---------------------------------------------------------------- */

async function call(path: string, init?: RequestInit) {
  const res = await fetch("/api" + path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error || `HTTP ${res.status}`);
  return body as any;
}

const post = (path: string, body?: unknown) =>
  call(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export const api = {
  session:     () => call("/session"),
  staffLogin:    (email: string, password: string) => post("/auth/staff", { email, password }),
  residentLogin: (code: string) => post("/auth/resident", { code }),
  sticker:       (slug: string) => call(`/r/${encodeURIComponent(slug)}`),
  stickerSheet:  (code: string) => call(`/stickers/${encodeURIComponent(code)}`),
  mySchedule:    () => call("/my-schedule"),
  logout:      () => post("/session/logout"),
  seed:        () => post("/dev/seed"),

  myRooms:     () => call("/my-rooms"),
  tickets:     () => call("/tickets"),
  ticket:      (id: string) => call(`/tickets/${id}`),
  report:      (objectId: string, symptom: string, note: string) =>
                 post("/tickets", { objectId, symptom, note }),

  accept:      (id: string) => post(`/tickets/${id}/accept`),
  offer:       (id: string, slots?: unknown[]) =>
                 post(`/tickets/${id}/offer`, slots ? { slots } : undefined),
  mySchedule_x:() => call("/my-schedule"),
  book:        (id: string, slotId: string) => post(`/tickets/${id}/book`, { slotId }),
  reschedule:  (id: string) => post(`/tickets/${id}/reschedule`),
  noAccess:    (id: string) => post(`/tickets/${id}/no-access`),
  orderPart:   (id: string, what: string, eta: string) => post(`/tickets/${id}/part`, { what, eta }),
  partArrived: (id: string) => post(`/tickets/${id}/part-arrived`),
  done:        (id: string, cause: string) => post(`/tickets/${id}/done`, { cause }),
  escalate:    (id: string, trade: string, reason: string, note: string) =>
                 post(`/tickets/${id}/escalate`, { trade, reason, note }),
  commission:  (id: string, contractor: string, reference: string) =>
                 post(`/tickets/${id}/commission`, { contractor, reference }),
  deescalate:  (id: string) => post(`/tickets/${id}/deescalate`),
  consent:     (id: string, value: boolean) => post(`/tickets/${id}/consent`, { value }),

  setupState:       () => call("/setup-state"),
  bootstrap:        (email: string, name: string, password: string) =>
                      post("/admin/bootstrap", { email, name, password }),
  acceptInvite:     (token: string, password: string) => post("/auth/setup", { token, password }),
  forgotPassword:   (email: string) => post("/auth/forgot", { email }),
  signupOrg:        (orgName: string, name: string, email: string) =>
                      post("/orgs/signup", { orgName, name, email }),
  platformOrgs:     () => call("/platform/orgs"),
  setOrgStatus:     (id: string, status: string, note?: string) =>
                      post(`/platform/orgs/${id}/status`, { status, note }),
  exportOrg:        (id: string) => call(`/platform/orgs/${id}/export`),
  deleteOrg:        (id: string) => call(`/platform/orgs/${id}`, { method: "DELETE" }),
  resetPassword:    (token: string, password: string) => post("/auth/reset", { token, password }),
  changePassword:   (currentPassword: string, newPassword: string) =>
                      post("/me/password", { currentPassword, newPassword }),

  setEmail:         (email: string | null, wantsEmail: boolean) =>
                      post("/me/email", { email, wantsEmail }),
  notifications:    () => call("/notifications"),
  markRead:         (id: string) => post(`/notifications/${id}/read`),
  markAllRead:      () => post("/notifications/read-all"),

  adminVocabulary:  () => call("/admin/vocabulary"),
  adminBuildings:   () => call("/admin/buildings"),
  createBuilding:   (code: string, name: string, roomCount: number) =>
                      post("/admin/buildings", { code, name, roomCount }),
  updateBuilding:   (id: string, name: string, roomCount: number) =>
                      call(`/admin/buildings/${id}`, { method: "PATCH", body: JSON.stringify({ name, roomCount }) }),
  adminUnits:       (id: string) => call(`/admin/buildings/${id}/units`),
  createUnit:       (id: string, unit: unknown) => post(`/admin/buildings/${id}/units`, unit),
  bulkUnits:        (id: string, spec: unknown) => post(`/admin/buildings/${id}/units/bulk`, spec),
  setRoomLabel:     (id: string, label: string) =>
                      call(`/admin/rooms/${id}`, { method: "PATCH", body: JSON.stringify({ label }) }),
  buildingCodes:    (id: string) => call(`/admin/buildings/${id}/codes`),
  generateCodes:    (id: string) => post(`/admin/buildings/${id}/codes`),
  reissueAll:       (id: string) => post(`/admin/buildings/${id}/codes/reissue`),
  roomHistory:      (roomId: string) => call(`/admin/rooms/${roomId}/history`),
  turnoverRoom:     (roomId: string, note?: string) =>
                      post(`/admin/rooms/${roomId}/turnover`, note ? { note } : {}),

  addObjects:       (roomId: string, objectType: string, count: number) =>
                      post(`/admin/rooms/${roomId}/objects`, { objectType, count }),

  adminStaff:       () => call("/admin/staff"),
  createStaff:      (email: string, name: string, isOperator: boolean, buildingIds: string[]) =>
                      post("/admin/staff", { email, name, isOperator, buildingIds }),
  setStaffBuildings:(id: string, buildingIds: string[]) =>
                      call(`/admin/staff/${id}/buildings`, { method: "PUT", body: JSON.stringify({ buildingIds }) }),
  inviteStaff:      (id: string) => post(`/admin/staff/${id}/invite`),
  disableStaff:     (id: string) => post(`/admin/staff/${id}/disable`),
  enableStaff:      (id: string) => post(`/admin/staff/${id}/enable`),

  dashPrefs:        () => call("/dashboard/prefs"),
  saveDashPrefs:    (metrics: string[], charts: Record<string, string>) =>
                      call("/dashboard/prefs", { method: "PUT", body: JSON.stringify({ metrics, charts }) }),
  repeatDetail:     (riser: string, object: string, months: number) =>
                      call(`/dashboard/repeat?riser=${encodeURIComponent(riser)}&object=${object}&months=${months}`),
  dashboard:        (months: number, building: string | null, rooms?: string | null) =>
                      call(`/dashboard?months=${months}${building ? `&building=${building}` : ""}`
                        + (rooms ? `&rooms=${rooms}` : "")),
  dashboardMonth:   (bucket: string, building: string | null) =>
                      call(`/dashboard/month?bucket=${bucket}${building ? `&building=${building}` : ""}`),
  dashboardTickets: (which: string, months: number, building: string | null) =>
                      call(`/dashboard/tickets?filter=${which}&months=${months}${building ? `&building=${building}` : ""}`),
};

/* ---------------------------------------------------------------- */
/* label resolution — the only place a code becomes a word           */
/* ---------------------------------------------------------------- */

const pick = (table: Record<string, any>, code: string, l: Locale, fallback?: string) =>
  (table[code]?.[l] as string) ?? fallback ?? code;

export const roomLabel    = (code: string, l: Locale) => pick(ROOM_TYPE, code, l);

const ROOM_ICON: Record<string, LucideIcon> = {
  BEDROOM: Bed, KITCHEN: UtensilsCrossed, BATHROOM: Bath,
  HALLWAY: DoorOpen, LAUNDRY: WashingMachine,
};
export const roomIcon = (code: string): LucideIcon => ROOM_ICON[code] ?? DoorClosed;
export const objLabel     = (code: string, l: Locale) => pick(OBJECT_TYPE, code, l);
export const symptomLabel = (code: string, l: Locale) => pick(SYMPTOM, code, l);
export const causeLabel   = (code: string, l: Locale) => pick(CAUSE, code, l);
export const reasonLabel  = (code: string, l: Locale) => pick(REASON, code, l);
export const objIcon      = (code: string): LucideIcon | undefined => OBJECT_TYPE[code]?.icon;
export const tradeLabel   = (code: string, l: Locale) => pick(TRADE, code, l);
export const escReason    = (code: string, l: Locale) => pick(ESC_REASON, code, l);
