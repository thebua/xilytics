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
 * `s-maxage` lets Vercel's CDN answer repeat requests without waking a
 * function or touching the database, and `stale-while-revalidate` means the
 * one request arriving after expiry still gets an instant answer while the
 * refresh happens behind it.
 *
 * The window used to be a day, reasoning that the dataset only changes when
 * a harvest is loaded. That was true of the players and false of everything
 * else in the response: which leagues are open is a business decision, and
 * closing fifty-five of them left the edge serving the old list for the
 * rest of the day. An access rule that takes a day to take effect is not an
 * access rule.
 *
 * Five minutes instead. Long enough that a burst of traffic still lands on
 * one database query, short enough that a change made in the afternoon is
 * live before anyone has finished asking whether it worked. The stale
 * window stays long, so a page opened after a quiet night still paints
 * immediately and refreshes behind itself.
 *
 * Anything that depends on who is asking must not be cached publicly, or
 * one member's response would be served to the next visitor.
 */
export const PUBLIC_CACHE =
  "public, s-maxage=300, stale-while-revalidate=86400";
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
 * Answering "who is this" costs two round trips: one to Supabase to check
 * the token, one to our own database for the tier. Both are cheap in
 * isolation and neither is cheap on every request — a visitor flicking
 * between positions pays for the same answer four or five times a minute,
 * and the Supabase call in particular is a separate service over the
 * network rather than a query on a warm pool.
 *
 * So the answer is held for a short while, per token, per warm function
 * instance.
 *
 * The window is deliberately short. A token that has been revoked, or a
 * tier that has just been paid for, stays wrong for up to a minute — and
 * that is the whole of the cost, because what sits behind this is a list
 * of football leagues rather than anything private. A minute of stale
 * access to public statistics is a fair trade for taking a third off the
 * time every request spends waiting.
 *
 * Serverless instances are recycled often and each keeps its own map, so
 * this stays small without any sweeping: a cold instance starts empty and
 * a busy one holds however many people are reading at once.
 */
const IDENTITY_TTL = 60_000;
const identityCache = new Map();

function cachedIdentity(token) {
  const held = identityCache.get(token);
  if (!held) return undefined;
  if (Date.now() > held.until) {
    identityCache.delete(token);
    return undefined;
  }
  return held.who;
}

function holdIdentity(token, who) {
  /*
   * A map that only grows is a leak, however slow. Nothing here needs to be
   * clever — past a few hundred entries the oldest are dropped, and anyone
   * whose answer goes with them simply pays for one more lookup.
   */
  if (identityCache.size > 500) {
    for (const k of identityCache.keys()) {
      identityCache.delete(k);
      if (identityCache.size <= 250) break;
    }
  }
  identityCache.set(token, { who, until: Date.now() + IDENTITY_TTL });
}

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

  const held = cachedIdentity(token);
  if (held !== undefined) return held;

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
    if (!res.ok) {
      /*
       * A rejected token is worth remembering too. An expired session that
       * keeps being sent would otherwise ask Supabase the same question on
       * every request and get the same no.
       */
      holdIdentity(token, null);
      return null;
    }
    user = await res.json();
  } catch {
    /* A network failure is not an answer, so nothing is remembered. */
    return null;
  }
  if (!user?.id) {
    holdIdentity(token, null);
    return null;
  }

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

  const who = {
    id: user.id,
    email: user.email,
    tier: active ? "member" : "free",
  };
  holdIdentity(token, who);
  return who;
}

/*
 * The leagues this caller may read. Members get everything; everyone else
 * gets the open ones. Returning ids rather than a boolean keeps the rule
 * in one place — every query filters on the same list.
 *
 * Which leagues are open is a business decision that changes a few times a
 * year, and it was being fetched on every anonymous request. Held for the
 * same minute as an identity, for the same reason and at the same cost.
 */
let openLeagues = null;
let openLeaguesUntil = 0;

export async function readableLeagues(who) {
  if (who?.tier === "member") return null;          // null means "no filter"

  if (openLeagues && Date.now() < openLeaguesUntil) return openLeagues;

  const { rows } = await db().query(
    `select id from leagues where is_open order by id`
  );
  openLeagues = rows.map((r) => r.id);
  openLeaguesUntil = Date.now() + IDENTITY_TTL;
  return openLeagues;
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
