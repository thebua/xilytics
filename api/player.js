/*
 * GET /api/player?id=123
 *
 * One player, every season of his that the caller may read, newest first.
 * The profile shows a career rather than a row, so this returns the lot
 * instead of making the interface ask season by season.
 */

import {
  db, json, fail, whoIs, readableLeagues,
  intParam, PUBLIC_CACHE, PRIVATE_CACHE,
} from "./_db.js";

export async function GET(request) {
  const url = new URL(request.url);
  const id = intParam(url.searchParams.get("id"));
  if (!id) return fail("id is required");

  const who = await whoIs(request);
  const allowed = await readableLeagues(who);

  const args = [id];
  let leagueFilter = "";
  if (allowed) {
    args.push(allowed);
    leagueFilter = `and e.league_id = any($2::int[])`;
  }

  try {
    const { rows } = await db().query(
      `select
         e.id, e.player_id, e.league_id, e.season_id,
         e.team, e.pos, e.detailed_pos, e.age,
         e.minutes, e.appearances, e.rating, e.goals, e.assists,
         e.score, e.score_adj, e.pool_size, e.coverage,
         e.role_label, e.role_kind,
         e.metric_values, e.percentiles, e.themes,
         e.role_fit, e.role_quality, e.transfers, e.trophies,
         p.name, p.image, p.dob, p.height, p.weight, p.foot,
         p.nationality, p.nat_code, p.nat_flag,
         l.name as league_name, l.code as league_code, l.hue as league_hue,
         s.name as season_name
       from entries e
       join players p on p.id = e.player_id
       join leagues l on l.id = e.league_id
       join seasons s on s.id = e.season_id
       where e.player_id = $1 ${leagueFilter}
       order by e.season_id desc, e.minutes desc`,
      args
    );

    if (!rows.length) {
      /*
       * Either the player does not exist or every season he has is in a
       * league this visitor cannot read. Saying which would leak the
       * contents of the closed set, so the answer is the same either way;
       * the interface can offer to sign in regardless.
       */
      return json({ found: false }, { status: 404, cache: PRIVATE_CACHE });
    }

    const first = rows[0];
    const player = {
      id: first.player_id,
      name: first.name,
      image: first.image,
      dob: first.dob,
      height: first.height,
      weight: first.weight,
      foot: first.foot,
      nationality: first.nationality,
      natCode: first.nat_code,
      natFlag: first.nat_flag,
    };

    const seasons = rows.map((r) => ({
      id: r.id,
      leagueId: r.league_id,
      leagueName: r.league_name,
      leagueCode: r.league_code,
      leagueHue: r.league_hue,
      seasonId: r.season_id,
      seasonName: r.season_name,
      team: r.team,
      pos: r.pos,
      detailedPos: r.detailed_pos,
      age: r.age,
      minutes: r.minutes,
      appearances: r.appearances,
      rating: r.rating,
      goals: r.goals,
      assists: r.assists,
      score: r.score,
      scoreAdj: r.score_adj,
      poolSize: r.pool_size,
      coverage: r.coverage,
      roleLabel: r.role_label,
      roleKind: r.role_kind,
      values: r.metric_values,
      percentiles: r.percentiles,
      themes: r.themes,
      roleFit: r.role_fit,
      roleQuality: r.role_quality,
    }));

    /* Transfers and trophies belong to the person, not a season. */
    const career = {
      transfers: first.transfers ?? [],
      trophies: first.trophies ?? 0,
    };

    return json(
      { found: true, player, seasons, career },
      { cache: who ? PRIVATE_CACHE : PUBLIC_CACHE }
    );
  } catch (err) {
    return fail(`player query failed: ${err.message}`, 500);
  }
}
