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
  server: {
    port: 5173,
    open: true,
    /*
     * The API lives on Vercel, not on the dev server. Without this, a call
     * to /api/meta resolves against localhost, finds no such file and comes
     * back 404 — which the app reports as "can't load the data" and reads
     * like the database is down when nothing is wrong at all.
     *
     * The target is the www host rather than the bare domain. The bare one
     * redirects there, and a redirect that crosses an origin turns a proxied
     * request into a cross-origin one, which the browser then refuses for
     * want of a CORS header. Going straight to where the redirect points
     * keeps the whole exchange on localhost as far as the browser can see.
     *
     * Pointing at production means local work uses the real dataset. Every
     * route is a read, so there is nothing here that can damage it.
     */
    proxy: {
      "/api": {
        target: "https://www.xilytics.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
    // a classic script runs from file://, an ES module does not
    target: "es2019",
    modulePreload: false,
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
  },
});
