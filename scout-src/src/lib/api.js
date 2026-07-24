/*
 * Where the data comes from.
 *
 * The interface was built around having every row in memory, and it is
 * good at that: filtering, sorting, comparing and finding similar players
 * all happen without a round trip. Rebuilding all of it to ask the server
 * for each list would make the app slower to use and much easier to break.
 *
 * So the fetch changes and nothing else does. This module asks the API for
 * a slice of the dataset and returns it in exactly the shape the file used
 * to have, which is why the components below it never learn that anything
 * moved.
 *
 * How much it asks for depends on who is asking:
 *
 *   open visitor   three leagues, about 1,900 rows — small enough to send
 *                  in one go, and then the whole interface is instant
 *   member         one position at a time, about 3,000 rows, because all
 *                  fifty-eight leagues at once is several megabytes and
 *                  nobody needs goalkeepers while reading about strikers
 */

const API = "/api";

/* ------------------------------------------------------------ transport */

async function get(path, { token, signal } = {}) {
  const res = await fetch(`${API}${path}`, {
    signal,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch { /* a non-JSON error body is not worth reporting verbatim */ }
    throw new Error(detail);
  }
  return res.json();
}

/* --------------------------------------------------------------- shapes */

/*
 * The API returns database columns; the interface expects the short keys
 * the build script used. Translating here keeps that vocabulary in one
 * place rather than spreading two names for everything through the app.
 */
function toRow(r) {
  return {
    id: Number(r.player_id),
    n: r.name,
    t: r.team,
    img: r.image,
    pos: r.pos,
    dp: r.detailed_pos,
    lid: r.league_id,
    sid: r.season_id,
    age: r.age,
    dob: r.dob ?? null,
    ht: r.height ?? null,
    wt: r.weight ?? null,
    foot: r.foot ?? null,
    nat: r.nationality ?? null,
    natc: r.nat_code ?? null,
    flag: r.nat_flag ?? null,
    tr: r.transfers ?? [],
    trc: r.trophies ?? 0,
    m: r.minutes,
    ap: r.appearances,
    rt: r.rating == null ? null : Number(r.rating),
    g: r.goals,
    a: r.assists,
    v: r.metric_values ?? [],
    p: r.percentiles ?? [],
    th: r.themes ?? [],
    rq: r.role_quality ?? [],
    rf: r.role_fit ?? [],
    rl: r.role_label,
    rk: r.role_kind,
    cov: r.coverage,
    pr: r.pool_size,
    sc: r.score,
    sc2: r.score_adj,
  };
}

/*
 * Meta arrives with the league and season lists already narrowed to what
 * the caller may read, but as arrays. The interface indexes them by id, as
 * the old file did.
 */
function toMeta(m) {
  const byId = (arr, val) =>
    Object.fromEntries(arr.map((x) => [x.id, val(x)]));

  return {
    minMinutes: m.minMinutes,
    built: m.builtAt,
    leagues: byId(m.leagues, (l) => l.name),
    seasons: byId(m.seasons, (s) => s.name),
    codes: byId(m.leagues, (l) => l.code),
    hues: byId(m.leagues, (l) => l.hue),
    tiers: byId(m.leagues, (l) => l.tier),
    tierRank: byId(m.leagues, (l) => l.tier_rank),
    flags: Object.fromEntries(
      m.leagues.filter((l) => l.iso).map((l) => [
        l.id,
        `https://cdn.sportmonks.com/images/countries/png/short/${l.iso}.png`,
      ])
    ),
    tierNames: m.tierNames,
    labels: m.labels,
    short: m.short,
    units: m.units,
    help: m.help,
    invert: m.invert,
    groups: m.groups ?? [],
    themes: m.themes,
    columns: m.columns,
    roles: m.roles,
    roleRules: m.roleRules,
    positions: m.positions,
    order: m.order,
    nationalities: m.nationalities,
    imgbase: m.imgbase,

    /* filled in once rows arrive — the interface derives pools from them */
    pairs: [],
    pools: {},
    peers: {},

    /* league levels, solved at build time from players who moved */
    strength: m.strength ?? {},
    strengthSeen: m.strengthSeen ?? {},
    strengthMoves: m.strengthMoves ?? 0,
    strengthFit: m.strengthFit ?? 0,

    /* what the visitor is not being shown, so the app can say so */
    tier: m.tier,
    signedIn: m.signedIn,
    lockedLeagues: m.lockedLeagues,
  };
}

/*
 * pairs and pools were computed by the build script over the whole file.
 * With only part of the dataset in hand they have to be derived from what
 * actually arrived, or the season filter would offer combinations that
 * hold nothing.
 */
function derivePairs(meta, rows) {
  const pairs = new Set();
  const pools = {};
  const peers = {};
  for (const r of rows) {
    pairs.add(`${r.lid}_${r.sid}`);
    const key = `${r.lid}_${r.sid}_${r.pos}`;
    pools[key] = (pools[key] || 0) + 1;
    peers[key] = r.pr ?? pools[key];
  }
  /*
   * Both ids stay strings, as the build script produced them. inLeagues
   * compares with String(row.lid) and the picker builds its selection
   * straight from these, so numbers here make every comparison fail and
   * empty the table.
   */
  meta.pairs = [...pairs].map((p) => p.split("_"));
  meta.pools = pools;
  meta.peers = peers;
  return meta;
}

/* ------------------------------------------------------------- fetching */

/*
 * Pull a whole position in one request.
 *
 * This used to page through in hundreds, which meant twenty to sixty
 * round trips for a single position change and two or three seconds of
 * staring at a spinner. The rows fit comfortably in one response — the
 * largest position is under seven thousand, a couple of hundred kilobytes
 * compressed — so the pagination was buying nothing and costing the wait.
 */
async function fetchAll(query, { token, signal, onProgress } = {}) {
  onProgress?.(0, null);
  const res = await get(`/players?${query}&limit=10000&page=1`, { token, signal });
  if (res.locked) return { rows: [], locked: true };
  const rows = res.rows.map(toRow);
  onProgress?.(rows.length, res.total ?? rows.length);
  return { rows, locked: false };
}

/* ----------------------------------------------------------------- api */

export async function loadMeta({ token, signal } = {}) {
  const raw = await get("/meta", { token, signal });
  return toMeta(raw);
}

/*
 * Everything the caller is entitled to see, for one position. Members get
 * a position at a time; an open visitor's three leagues are small enough
 * that the position filter barely matters, but it keeps the two paths the
 * same and the first paint quicker.
 *
 * Answers are kept for the session. Flicking between CM and DM and back is
 * a common way to read this data, and the second visit should not cost
 * another wait — the dataset only changes when a harvest is loaded, so
 * nothing here goes stale while the tab is open.
 */
const positionCache = new Map();

export async function loadPosition(pos, { token, signal, onProgress } = {}) {
  const key = `${pos}|${token ? "member" : "open"}`;
  const held = positionCache.get(key);
  if (held) {
    onProgress?.(held.rows.length, held.rows.length);
    return held;
  }

  const params = new URLSearchParams({ pos, minMins: "0", sort: "score", dir: "desc" });
  const result = await fetchAll(params.toString(), { token, signal, onProgress });
  if (!result.locked) positionCache.set(key, result);
  return result;
}

/* One player's whole career, for the profile. */
export async function loadPlayer(id, { token, signal } = {}) {
  const raw = await get(`/player?id=${id}`, { token, signal });
  if (!raw.found) return null;
  return raw;
}

export { derivePairs, toRow, toMeta };
