import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./resident.css";
import "./signin.css";
import "./gallery.css";
import "./laptop-narrow.css";
import "./printblock.css";
/* The operator screens, one stylesheet each as the design exports them. Each
   repeats its own tokens on purpose, so none depends on another's :root. */
import "./op-panel.css";
import "./op-dashboard.css";
import "./op-buildings.css";
import "./op-staff.css";
import "./op-stickers.css";
import "./op-codes.css";
import "./op-orgs.css";
import "./op-filters.css";
import "./op-customise.css";
import "./op-repeats.css";

createRoot(document.getElementById("root")!).render(<App />);
