/*
 * Vite writes to scout-src/dist; the site serves it from /scout.
 *
 * This ran as `rm -rf scout && cp -r scout-src/dist scout` in the build
 * script, which works on Vercel and fails on Windows. Node does both
 * halves the same way everywhere, so a build is a build wherever it runs.
 */

import { rm, cp, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "scout-src", "dist");
const to = join(root, "scout");

try {
  await access(from);
} catch {
  console.error(
    `No build to copy — ${from} does not exist.\n` +
    `Run the Vite build first (npm --prefix scout-src run build).`
  );
  process.exit(1);
}

await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });

console.log(`scout-src/dist -> scout`);