/**
 * Folds the built app and its data into one HTML file that opens with a
 * double click — no server, no install. Useful for sharing a snapshot.
 *
 *   npm run bundle
 *
 * Run `npm run data` and `npm run build` first.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const DATA = path.join(ROOT, "public", "data", "players.json");
const OUT = path.join(ROOT, "scout.html");

for (const [label, file] of [["build", path.join(DIST, "index.html")], ["data", DATA]]) {
  if (!fs.existsSync(file)) {
    console.error(`\n  Missing ${label}. Run "npm run data" then "npm run build".\n`);
    process.exit(1);
  }
}

let html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const data = fs.readFileSync(DATA, "utf8");

/* Inline every asset the shell points at. */
const cssMatch = html.match(/<link[^>]*href="[^"]*?(assets\/[^"]+\.css)"[^>]*>/);
if (cssMatch) {
  const css = fs.readFileSync(path.join(DIST, cssMatch[1]), "utf8");
  html = html.replace(cssMatch[0], `<style>${css}</style>`);
}

/* Find the built script by scanning, not by pattern matching. */
const openAt = html.indexOf("<script");
const closeAt = html.indexOf("</scr" + "ipt>", openAt);
if (openAt < 0 || closeAt < 0) {
  console.error("\n  Could not find the built script in dist/index.html\n");
  process.exit(1);
}
const scriptTag = html.slice(openAt, closeAt + 9);
const srcMatch = scriptTag.match(/src="[^"]*?(assets\/[^"]+\.js)"/);
if (!srcMatch) {
  console.error("\n  The script tag has no src to inline\n");
  process.exit(1);
}
const js = fs.readFileSync(path.join(DIST, srcMatch[1]), "utf8");

/*
 * The app fetches players.json; hand it the data directly instead.
 * The payload rides in a non-executable script tag so nothing inside it
 * can break out and confuse the parser.
 */
const payload = `<script type="application/json" id="scout-data">`
  + data.replace(/<\//g, "<\\/")
  + `</` + `script>`;

const shim = `
(function () {
  const el = document.getElementById("scout-data");
  window.__SCOUT__ = JSON.parse(el.textContent);
  const real = window.fetch;
  window.fetch = function (url) {
    if (String(url).includes("players.json")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(window.__SCOUT__),
      });
    }
    return real.apply(this, arguments);
  };
})();`;

/*
 * Vite puts the script in <head>, which is fine when it is a module —
 * those wait for the document. A classic script does not, so it has to
 * sit after #root or React finds nothing to mount to.
 */
const close = "</scr" + "ipt>";
html = html.slice(0, openAt) + html.slice(closeAt + 9);

const bundle = payload + "\n"
  + "<script>" + shim + close + "\n"
  + "<script>" + js + close + "\n";

const bodyEnd = html.lastIndexOf("</body>");
html = bodyEnd < 0
  ? html + bundle
  : html.slice(0, bodyEnd) + bundle + html.slice(bodyEnd);

fs.writeFileSync(OUT, html);
const mb = fs.statSync(OUT).size / 1024 / 1024;
console.log(`\n  scout.html written  (${mb.toFixed(1)} MB)`);
console.log("  Double-click it — no server needed.\n");
