/*
 * GET /api/health
 *
 * Says what is wired up and what is not. When something is wrong this is
 * the first place to look: it separates "the function did not run at all"
 * from "the function ran but could not reach the database", which the
 * platform's own error page cannot tell you.
 *
 * Deliberately reveals nothing beyond whether each piece is present — the
 * values themselves are never echoed.
 */

import { db, json, PRIVATE_CACHE } from "./_db.js";

export async function GET() {
  const report = {
    ok: false,
    runtime: `node ${process.version}`,
    config: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
    },
    database: null,
    dataset: null,
  };

  if (!process.env.DATABASE_URL) {
    report.database = "DATABASE_URL missing — nothing to connect to";
    return json(report, { status: 503, cache: PRIVATE_CACHE });
  }

  try {
    const started = Date.now();
    const { rows } = await db().query(
      `select
         (select count(*) from leagues)  as leagues,
         (select count(*) from entries)  as entries,
         (select count(*) from players)  as players,
         (select count(*) from leagues where is_open) as open_leagues,
         (select built_at from dataset_meta where id = 1) as built_at`
    );
    report.database = `reachable in ${Date.now() - started}ms`;
    report.dataset = {
      leagues: Number(rows[0].leagues),
      players: Number(rows[0].players),
      entries: Number(rows[0].entries),
      openLeagues: Number(rows[0].open_leagues),
      builtAt: rows[0].built_at,
    };
    report.ok = report.dataset.entries > 0;
  } catch (err) {
    report.database = `unreachable: ${err.message}`;
    return json(report, { status: 503, cache: PRIVATE_CACHE });
  }

  return json(report, { cache: PRIVATE_CACHE });
}
