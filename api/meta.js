/*
 * GET /api/meta
 *
 * Everything the interface needs before it can draw anything: the metric
 * labels, the ability definitions, the roles, and the list of leagues and
 * seasons the caller may actually choose from.
 *
 * Small, and the same for every anonymous visitor, so it sits in the CDN
 * and the database is rarely troubled for it.
 */

import {
  db, json, fail, whoIs, readableLeagues, PUBLIC_CACHE, PRIVATE_CACHE,
} from "./_db.js";

export async function GET(request) {
  const who = await whoIs(request);
  const allowed = await readableLeagues(who);

  try {
    const pool = db();

    /* The build script's own metadata — labels, themes, roles, help text. */
    const metaRes = await pool.query(
      `select built_at, min_minutes, payload from dataset_meta where id = 1`
    );
    if (!metaRes.rows.length) {
      return fail("no dataset loaded yet", 503);
    }
    const { built_at, min_minutes, payload } = metaRes.rows[0];

    /*
     * Leagues, with the ones holding no entries left out. Coupe de France
     * is in the harvest but returns no player data, and offering a filter
     * that can only ever produce an empty table is worse than not offering
     * it. The count also tells the interface how much sits behind each
     * option before anyone clicks it.
     */
    const leagueArgs = [];
    let leagueFilter = "";
    if (allowed) {
      leagueArgs.push(allowed);
      leagueFilter = `and l.id = any($1::int[])`;
    }
    const leagues = await pool.query(
      `select l.id, l.name, l.code, l.hue, l.iso, l.tier, l.tier_rank,
              l.is_open, count(e.id)::int as entries
         from leagues l
         join entries e on e.league_id = l.id
        where true ${leagueFilter}
        group by l.id
       having count(e.id) > 0
        order by l.tier nulls last, l.tier_rank nulls last, l.name`,
      leagueArgs
    );

    /* Seasons that actually carry rows for those leagues. */
    const seasons = await pool.query(
      `select distinct s.id, s.name
         from seasons s
         join entries e on e.season_id = s.id
         ${allowed ? `where e.league_id = any($1::int[])` : ``}
        order by s.name desc`,
      allowed ? [allowed] : []
    );

    /* Nationalities present in the readable set, commonest first. */
    const nats = await pool.query(
      `select p.nationality as nat,
              max(p.nat_code) as code,
              max(p.nat_flag) as flag,
              count(*)::int as n
         from entries e
         join players p on p.id = e.player_id
        where p.nationality is not null
          ${allowed ? `and e.league_id = any($1::int[])` : ``}
        group by p.nationality
        order by n desc, nat asc`,
      allowed ? [allowed] : []
    );

    /*
     * How many leagues are being withheld. The interface can then say what
     * signing in would open up, which is more useful — and more honest —
     * than quietly showing a shorter list.
     */
    const locked = await pool.query(
      `select count(*)::int as n
         from leagues l
        where not l.is_open
          and exists (select 1 from entries e where e.league_id = l.id)`
    );

    return json(
      {
        builtAt: built_at,
        minMinutes: min_minutes,
        tier: who?.tier ?? "free",
        signedIn: Boolean(who),
        lockedLeagues: who?.tier === "member" ? 0 : locked.rows[0].n,
        leagues: leagues.rows,
        seasons: seasons.rows,
        nationalities: nats.rows,
        /* labels, short names, units, help, themes, columns, roles, order */
        labels: payload.labels,
        short: payload.short,
        units: payload.units,
        help: payload.help,
        invert: payload.invert,
        themes: payload.themes,
        columns: payload.columns,
        roles: payload.roles,
        roleRules: payload.roleRules,
        positions: payload.positions,
        order: payload.order,
        tierNames: payload.tierNames,
        imgbase: payload.imgbase,
      },
      { cache: who ? PRIVATE_CACHE : PUBLIC_CACHE }
    );
  } catch (err) {
    return fail(`meta failed: ${err.message}`, 500);
  }
}
