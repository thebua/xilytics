export const ALL = "*";
export const NONE = "∅";   // explicitly nothing selected, distinct from ALL

/**
 * Leagues in the order a reader expects: the top five first, second tiers
 * last. Alphabetical would put the Championship above the Premier League,
 * which is nobody's mental model.
 */
export function byStanding(ids, meta) {
  return [...ids].sort((a, b) => {
    const ta = meta.tiers?.[a] ?? 9, tb = meta.tiers?.[b] ?? 9;
    if (ta !== tb) return ta - tb;
    const ra = meta.tierRank?.[a] ?? 9, rb = meta.tierRank?.[b] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(meta.leagues[a]).localeCompare(String(meta.leagues[b]));
  });
}

/**
 * League selection is either the ALL sentinel or a list of ids. One
 * helper keeps every view reading it the same way.
 */
export function inLeagues(row, selection) {
  if (selection === NONE) return false;
  if (selection === ALL || !selection?.length) return true;
  return selection.includes(String(row.lid));
}
export const MAX_PICK = 6;
export const RADAR_MAX = 4;

/*
 * Colours for the compare radar. Six players at once, so they have to stay
 * apart at a glance — the first takes the brand accent and the rest spread
 * around the wheel from there, avoiding the greens so nothing is mistaken
 * for the accent at a distance.
 */
export const SERIES = [
  "#caff3f", "#ff7a52", "#4d9fff", "#c77dff", "#ffc857", "#5fd3c4",
];

/**
 * Percentile colour. The middle of the range stays neutral on purpose —
 * if every good-ish figure is green then green stops meaning anything.
 * Only the top band gets the accent.
 */
const BANDS = [
  { at: 0,   rgb: [216, 104, 78] },   // poor, muted terracotta
  { at: 35,  rgb: [130, 152, 132] },  // below par, the muted green-grey
  { at: 55,  rgb: [150, 172, 150] },  // average, a shade lighter
  { at: 72,  rgb: [174, 214, 118] },  // good, leaning toward the accent
  { at: 88,  rgb: [202, 255, 63] },   // elite, accent
  { at: 100, rgb: [202, 255, 63] },
];

export function ramp(p) {
  const v = Math.max(0, Math.min(100, p ?? 0));
  let i = 0;
  while (i < BANDS.length - 2 && v > BANDS[i + 1].at) i++;
  const lo = BANDS[i], hi = BANDS[i + 1];
  const t = hi.at === lo.at ? 0 : (v - lo.at) / (hi.at - lo.at);
  const mix = lo.rgb.map((c, k) => Math.round(c + (hi.rgb[k] - c) * t));
  return `rgb(${mix.join(",")})`;
}

/** A word for a percentile, used where a number alone reads as noise. */
export function band(p) {
  if (p == null) return "";
  if (p >= 88) return "Elite";
  if (p >= 72) return "Strong";
  if (p >= 45) return "Solid";
  if (p >= 25) return "Below par";
  return "Weak";
}

/** Show enough digits to be useful without becoming noise. */
export function fmt(v) {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a < 0.005) return "0";
  return v.toFixed(2);
}

export function initials(name) {
  return String(name).split(" ").map((w) => w[0]).slice(0, 2).join("");
}

export function lastName(name) {
  return String(name).split(" ").slice(-1)[0];
}

/*
 * One row is one player in one league-season. The season id already differs
 * per league (a player in two leagues the same year gets two sids), so id_sid
 * is unique today — but a move inside the same league would break that, so
 * the league is carried too. Cheap insurance for a key that selection,
 * profile links and React all rely on.
 */
export function keyOf(row) {
  return `${row.id}_${row.sid}_${row.lid}`;
}

export function imageUrl(row, base) {
  if (!row.img) return null;
  return row.img[0] === "!" ? row.img.slice(1) : base + row.img;
}

/** "2025/2026" -> "25/26" */
export function shortSeason(name) {
  const m = String(name || "").match(/(\d{4})\D+(\d{2,4})/);
  return m ? `${m[1].slice(2)}/${m[2].slice(-2)}` : String(name || "");
}

/**
 * Standard competition ranking: equal figures share a place and the
 * next one skips ahead, so 99, 99, 96 gives 1, 1, 3.
 */
export function placeOf(value, all) {
  if (value == null) return null;
  return all.filter((v) => v != null && v > value).length + 1;
}

/** How alike two players look across their ability scores, as a % match. */
export function similarity(a, b) {
  let sum = 0, count = 0;
  for (let i = 0; i < a.th.length; i++) {
    if (a.th[i] != null && b.th[i] != null) {
      sum += (a.th[i] - b.th[i]) ** 2;
      count++;
    }
  }
  if (!count) return null;
  return Math.max(0, 100 - Math.sqrt(sum / count));
}

/** Pad the arrays the data script trimmed, so index lookups stay simple. */
export function hydrate(payload) {
  const n = payload.meta.labels.length;
  for (const r of payload.rows) {
    while (r.v.length < n) r.v.push(null);
    while (r.p.length < n) r.p.push(null);
  }
  return payload;
}

/*
 * How much weight a score can carry.
 *
 * Two things limit it, and they are different in kind. The first is the size
 * of the pool a player was ranked in: in a group of sixteen, one place is six
 * percentile points, so 75 and 81 are the same reading. The second is whether
 * the position's score holds up from one season to the next — strikers and
 * keepers swing enough that a single campaign describes the season more than
 * the player, whatever the pool size.
 *
 * The lower of the two wins, because a score is only as sound as its weakest
 * support. Returns null when there is no score to qualify.
 */
/*
 * Thresholds set by what a place is actually worth. In a pool of 50 one
 * place moves the figure 2 points, which is finer than the noise in the
 * underlying stats; by 30 it is 3.3 points, and by 20 it is 5, at which
 * point neighbouring scores say nothing about each other. Pools here run
 * from about 11 to 105, median 46, so these bands split the real spread
 * rather than an imagined one.
 */
const POOL_BANDS = [
  { min: 50, level: "high",   note: "a full field, where a place is worth about two points" },
  { min: 28, level: "medium", note: "a moderate field, where a place is worth three or four points" },
  { min: 0,  level: "low",    note: "a small field — a place or two swings the figure" },
];

/*
 * Positions whose scores move about from one season to the next, measured
 * rather than assumed. Taking every player who stayed in the same league and
 * position across two seasons and correlating the two scores gives:
 *
 *   CM .55   DM .55   CB .53   RW .48   AM .44
 *   LW .44   LB .40   RB .36   ST .27   GK .21
 *
 * The bottom two are the unsteady ones. Strikers swing because scoring is
 * lumpy — a handful of finishes either way rewrites a season — and keepers
 * because save percentage depends heavily on what is thrown at them. Both
 * are still worth reading; they just describe one season more than they
 * describe the player, so neither can reach the top confidence band.
 *
 * Note this is the opposite of the usual assumption about centre-backs. Their
 * scores are among the steadiest here, and stay steady even when the player
 * changes club (.52), so the measurement is tracking the defender rather than
 * the team around him. It does not follow the transfer market, but that is a
 * different question from whether it measures something real.
 */
const UNSTEADY_POSITIONS = {
  ST: "Striker scores swing more than any other outfield position from season "
    + "to season — a few finishes either way move the figure a long way. Read "
    + "this as a description of the campaign more than of the player.",
  GK: "Goalkeeper scores are the least repeatable here. Save percentage leans "
    + "on what the defence in front lets through, so a season says less about "
    + "the keeper than the number suggests.",
};

export function confidenceOf(row) {
  if (!row || row.sc == null) return null;

  const pool = row.pr ?? 0;
  const byPool = POOL_BANDS.find((b) => pool >= b.min) || POOL_BANDS[POOL_BANDS.length - 1];

  const thin = UNSTEADY_POSITIONS[row.pos];
  const level = thin && byPool.level === "high" ? "medium" : byPool.level;

  return {
    level,                 // "high" | "medium" | "low"
    pool,                  // how many players stood behind the ranking
    poolNote: byPool.note,
    positionNote: thin || null,
  };
}

/* Half-width of the band a percentile could reasonably sit in, given the
   pool. One place is 100/pool points, so that is the honest granularity. */
export function scoreBand(row) {
  const pool = row?.pr ?? 0;
  if (!pool || row?.sc == null) return null;
  const step = 100 / pool;
  if (step < 1.5) return null;            // fine enough not to bother
  const half = Math.round(step);
  return {
    lo: Math.max(0, Math.round(row.sc) - half),
    hi: Math.min(100, Math.round(row.sc) + half),
    step: Math.round(step),
  };
}
