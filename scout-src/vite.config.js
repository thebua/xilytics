import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  /*
   * Two builds come out of this config and they need different bases.
   *
   * The site sits at /scout/ and is served over http, where a relative
   * base breaks: with cleanUrls on, /scout/ redirects to /scout, and the
   * browser then resolves ./assets/... against the root rather than the
   * folder — a 404 and a blank page. An absolute base is immune to that.
   *
   * scout.html is opened from the file system, where an absolute path
   * would point at the root of the disk. It builds with BASE=./ set.
   */
  base: process.env.BASE ?? "/scout/",
  plugins: [react()],
  server: { port: 5173, open: true },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
    // a classic script runs from file://, an ES module does not
    target: "es2019",
    modulePreload: false,
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
  },
});
