/*
 * Shared plumbing for the API routes.
 *
 * Named with a leading underscore so Vercel treats it as a module rather
 * than an endpoint — anything else in /api becomes a public URL.
 */

import pg from "pg";

const { Pool } = pg;

/*
 * One pool per warm function instance. Serverless functions are recycled
 * between requests, and opening a connection per request would exhaust
 * Postgres long before the traffic justified it. The pool is small because
 * many instances may be warm at once and they share the same database.
 */
let pool;

export function db() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      /*
       * Thrown rather than returned so the caller's try/catch turns it into
       * a readable 500 instead of the platform's bare "function crashed",
       * which says nothing about which of half a dozen things went wrong.
       */
      throw new Error(
        "DATABASE_URL is not set — add it under Project Settings, " +
        "Environment Variables, then redeploy"
      );
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return pool;
}

/*
 * Cache headers.
 *
 * The dataset changes when a harvest is loaded — weekly at most — so a
 * response is good for a long time. `s-maxage` lets Vercel's CDN answer
 * repeat requests without waking a function or touching the database, and
 * `stale-while-revalidate` means the one request that arrives after expiry
 * still gets an instant answer while the refresh happens behind it.
 *
 * A day rather than an hour: an hour was cautious, and with a weekly
 * harvest it meant twenty-three needless trips to the database for every
 * one that could have found anything new. The stale window runs a week,
 * so even a long-forgotten query answers immediately and refreshes after.
 *
 * Anything that depends on who is asking must not be cached publicly, or
 * one member's response would be served to the next visitor.
 */
export const PUBLIC_CACHE =
  "public, s-maxage=86400, stale-while-revalidate=604800";
export const PRIVATE_CACHE = "private, no-store";

export function json(data, { status = 200, cache = PUBLIC_CACHE } = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cache,
  };
  /*
   * Vary travels with the private responses only.
   *
   * It used to be set on every /api route in vercel.json, which meant the
   * CDN split its cache by a header the app does not even send — every
   * request a MISS, every MISS a trip to the database. Attached here
   * instead, a public answer is one answer for everyone and caches
   * properly, while anything keyed to a signed-in user still tells the
   * CDN not to share it.
   */
  if (cache === PRIVATE_CACHE) headers.vary = "authorization";

  return new Response(JSON.stringify(data), { status, headers });
}

/*
 * A refusal the caller can act on: a missing parameter, a position that is
 * not a position. The message is written for whoever is reading it and is
 * safe to show, because it describes the request rather than the server.
 */
export function fail(message, status = 400) {
  return json({ error: message }, { status, cache: PRIVATE_CACHE });
}

/*
 * A failure the caller can do nothing about.
 *
 * Postgres error messages name tables, columns and constraints, and these
 * used to travel straight to the browser — a free tour of the schema for
 * anyone who could provoke one. The detail belongs in the logs, where it
 * is just as useful and nobody else is reading; the response says only
 * that something broke.
 */
export function serverError(err, where) {
  console.error(`[${where}]`, err);
  return json(
    { error: "Something went wrong on our side. Please try again." },
    { status: 500, cache: PRIVATE_CACHE }
  );
}

/* ------------------------------------------------------------- identity */

/*
 * Who is asking, if anyone.
 *
 * Supabase signs a JWT for every signed-in user and the browser sends it as
 * a bearer token. Verifying it here rather than trusting a header means a
 * forged "I am a member" claim gets nowhere.
 *
 * Returns { id, email, tier } or null for an anonymous visitor.
 */
export async function whoIs(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  /* Supabase verifies its own token; asking it is cheaper and safer than
     carrying the signing secret around in every function. */
  let user;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!res.ok) return null;
    user = await res.json();
  } catch {
    return null;
  }
  if (!user?.id) return null;

  /* The tier lives in our own table, not in the token, so a user cannot
     grant themselves access by editing a claim. */
  const { rows } = await db().query(
    `select tier, tier_expires from profiles where id = $1`,
    [user.id]
  );
  const p = rows[0];
  const active =
    p?.tier === "member" &&
    (p.tier_expires === null || new Date(p.tier_expires) > new Date());

  return { id: user.id, email: user.email, tier: active ? "member" : "free" };
}

/*
 * The leagues this caller may read. Members get everything; everyone else
 * gets the open ones. Returning ids rather than a boolean keeps the rule
 * in one place — every query filters on the same list.
 */
export async function readableLeagues(who) {
  if (who?.tier === "member") return null;          // null means "no filter"
  const { rows } = await db().query(
    `select id from leagues where is_open order by id`
  );
  return rows.map((r) => r.id);
}

/* -------------------------------------------------------------- parsing */

export function intParam(v, fallback = null) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/* Positions are a closed set; anything else is a typo or a probe. */
export const POSITIONS = [
  "GK", "CB", "RB", "LB", "DM", "CM", "AM", "RW", "LW", "ST",
];

export function validPosition(v) {
  return POSITIONS.includes(String(v || "").toUpperCase())
    ? String(v).toUpperCase()
    : null;
}
