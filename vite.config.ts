import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    // `npm run dev` serves the built assets through wrangler instead, but if you
    // prefer vite's dev server, proxy /api to a separately running `wrangler dev`.
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
