/*
 * GET /api/players
 *
 * The ranked table. One page at a time, because a visitor looks at
 * twenty-five players and the browser has no use for the other thirty
 * thousand.
 *
 * Query parameters
 *   pos      GK|CB|RB|LB|DM|CM|AM|RW|LW|ST      required
 *   league   league id, repeatable               default: all readable
 *   season   season id, repeatable               default: all
 *   minMins  minimum minutes played              default: 900
 *   ageMin   ageMax                              optional
 *   nat      nationality name                    optional
 *   team     club name                           optional
 *   q        search in player or club name       optional
 *   sort     score|adj|age|minutes|rating|name   default: score
 *   dir      asc|desc                            default: desc
 *   page     1-based                             default: 1
 *   limit    rows per page, 1-10000              default: 25
 */

import {
  db, json, fail, serverError, whoIs, readableLeagues,
  intParam, clamp, validPosition, PUBLIC_CACHE, PRIVATE_CACHE,
} from "./_db.js";

const SORTS = {
  score: "e.score",
  adj: "coalesce(e.score_adj, e.score)",
  age: "e.age",
  minutes: "e.minutes",
  rating: "e.rating",
  name: "p.name",
};

export async function GET(request) {
  const url = new URL(request.url);
  const qs = url.searchParams;

  const pos = validPosition(qs.get("pos"));
  if (!pos) return fail("pos must be one of GK CB RB LB DM CM AM RW LW ST");

  let who;
  let allowed;
  try {
    who = await whoIs(request);
    allowed = await readableLeagues(who);
  } catch (err) {
    return serverError(err, "players/identity");
  }

  /*
   * Parameters are collected into an array and referenced by position, so
   * nothing a visitor types is ever concatenated into the statement. The
   * only place a caller influences the shape of the SQL is the sort column
   * and its direction, both looked up in fixed tables rather than passed
   * through.
   */
  const args = [pos];
  const where = ["e.pos = $1", "e.score is not null"];

  /* Leagues: what was asked for, narrowed to what may be read. */
  const asked = qs.getAll("league").map((v) => intParam(v)).filter(Boolean);
  let leagues = asked;
  if (allowed) {
    leagues = asked.length ? asked.filter((id) => allowed.includes(id)) : allowed;
    /* An anonymous visitor asking only for closed leagues gets an empty
       page rather than a silent substitution — quieter would be lying. */
    if (asked.length && !leagues.length) {
      return json(
        { rows: [], total: 0, page: 1, limit: 0, pages: 0, locked: true },
        { cache: PRIVATE_CACHE }
      );
    }
  }
  if (leagues.length) {
    args.push(leagues);
    where.push(`e.league_id = any($${args.length}::int[])`);
  }

  const seasons = qs.getAll("season").map((v) => intParam(v)).filter(Boolean);
  if (seasons.length) {
    args.push(seasons);
    where.push(`e.season_id = any($${args.length}::int[])`);
  }

  const minMins = clamp(intParam(qs.get("minMins"), 900) ?? 900, 0, 5000);
  args.push(minMins);
  where.push(`e.minutes >= $${args.length}`);

  const ageMin = intParam(qs.get("ageMin"));
  if (ageMin != null) { args.push(ageMin); where.push(`e.age >= $${args.length}`); }
  const ageMax = intParam(qs.get("ageMax"));
  if (ageMax != null) { args.push(ageMax); where.push(`e.age <= $${args.length}`); }

  const nat = qs.get("nat");
  if (nat) { args.push(nat); where.push(`p.nationality = $${args.length}`); }

  const team = qs.get("team");
  if (team) { args.push(team); where.push(`e.team = $${args.length}`); }

  const q = (qs.get("q") || "").trim();
  if (q) {
    args.push(`%${q}%`);
    where.push(`(p.name ilike $${args.length} or e.team ilike $${args.length})`);
  }

  const sortCol = SORTS[qs.get("sort")] || SORTS.score;
  const dir = qs.get("dir") === "asc" ? "asc" : "desc";

  /*
   * A page caps at 100 for a table, but the interface keeps a whole
   * position in memory and filters there, so it asks for the lot in one
   * go. Fetching that in hundred-row pages meant twenty to sixty round
   * trips per position change — seconds of waiting for data that fits in
   * a single response. The ceiling is generous rather than unlimited:
   * the largest position in the largest tier is under seven thousand.
   */
  const limit = clamp(intParam(qs.get("limit"), 25) ?? 25, 1, 10000);
  const page = Math.max(1, intParam(qs.get("page"), 1) ?? 1);
  const offset = (page - 1) * limit;

  const clause = where.join(" and ");

  /*
   * limit and offset are bound like everything else.
   *
   * They were interpolated for a while, which was safe only because clamp
   * and intParam happened to leave nothing but a number behind. That is a
   * guarantee held in two other functions rather than in the statement,
   * and one careless edit to either would turn a page number into a way
   * into the database. Binding them costs nothing and removes the
   * question.
   */
  args.push(limit);
  const limitAt = args.length;
  args.push(offset);
  const offsetAt = args.length;

  /*
   * The tiebreak used to be `p.name`, which meant sorting on a joined
   * table and gave up the index on (pos, score). Ties break on the entry
   * id instead: arbitrary, but stable, and it lets the planner walk the
   * index in order rather than sorting six thousand rows.
   */
  const sql = `
    select
      e.id, e.player_id, e.league_id, e.season_id,
      e.team, e.pos, e.detailed_pos, e.age,
      e.minutes, e.appearances, e.rating, e.goals, e.assists,
      e.score, e.score_adj, e.pool_size, e.coverage,
      e.role_label, e.role_kind,
      e.metric_values, e.percentiles, e.themes, e.role_fit, e.role_quality,
      p.name, p.image, p.nationality, p.nat_code, p.nat_flag, p.foot
    from entries e
    join players p on p.id = e.player_id
    where ${clause}
    order by ${sortCol} ${dir} nulls last, e.id asc
    limit $${limitAt} offset $${offsetAt}
  `;

  let result;
  const started = Date.now();
  try {
    result = await db().query(sql, args);
  } catch (err) {
    return serverError(err, "players/query");
  }
  const took = Date.now() - started;

  const rows = result.rows;

  /*
   * How many there are altogether.
   *
   * `count(*) over ()` used to ride along on every row, which meant
   * counting the whole set to answer a question the caller usually had
   * not asked. Dropping it was right; replacing it with offset + rows
   * was not, because a full page tells you nothing about what follows and
   * the figure quietly became "how many you have seen so far".
   *
   * A short page is the end of the set and needs no second query. A full
   * one asks, and only then.
   */
  let total = offset + rows.length;
  if (rows.length === limit) {
    try {
      const counted = await db().query(
        `select count(*)::int as n
           from entries e
           join players p on p.id = e.player_id
          where ${clause}`,
        args.slice(0, limitAt - 1)
      );
      total = counted.rows[0].n;
    } catch (err) {
      /*
       * The rows are in hand and worth serving. A total that stops at the
       * end of this page is a worse answer than the true one and a much
       * better answer than an error screen.
       */
      console.error("[players/count]", err);
    }
  }

  /*
   * A signed-in member sees more than an anonymous visitor, so their
   * response must not land in a shared cache. Anonymous responses are the
   * same for everyone and can be held at the edge.
   */
  return json(
    { rows, total, page, limit, pages: Math.ceil(total / limit), ms: took },
    { cache: who ? PRIVATE_CACHE : PUBLIC_CACHE }
  );
}
