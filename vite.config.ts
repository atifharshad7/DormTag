import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const WORKER = "http://127.0.0.1:8787";

/*
 * The Worker refuses any non-GET request whose Origin header doesn't match its
 * own host — a deliberate CSRF check. Behind this proxy the browser sends
 * Origin: localhost:5173 while the Worker sees itself as 127.0.0.1:8787, so
 * every POST came back 403: sign out, reporting, booking, all of it.
 *
 * Rewriting the header here satisfies the check in development and leaves it
 * fully in force in production, where there is no proxy.
 */
const proxy = {
  target: WORKER,
  changeOrigin: true,
  configure: (p: any) => {
    p.on("proxyReq", (req: any) => req.setHeader("origin", WORKER));
  },
};

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },

  server: {
    port: 5173,
    /*
     * `npm run watch` runs this alongside `npm run worker`, so a saved file
     * shows up in about a second instead of after a full rebuild.
     *
     * Everything the Worker owns is proxied: /api for the app, and /r /t /setup
     * /reset because those are real server paths rather than client routes — a
     * scanned sticker has to reach the Worker.
     */
    proxy: {
      "/api": proxy,
      "/r": proxy,
      "/t": proxy,
      "/setup": proxy,
      "/reset": proxy,
    },
  },
});
