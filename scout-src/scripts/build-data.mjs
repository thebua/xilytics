/**
 * Turns the raw harvest files into one compact dataset the app can load.
 *
 *   npm run data
 *
 * Reads   scout_data/*.json   (whatever harvest.py collected)
 * Writes  public/data/players.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GROUPS, THEMES, THEME_SHORT, COLUMNS, CORE, ROLES, ROLE_RULES,
  SHORT, UNITS, HELP,
  POSITIONS, ORDER, LEAGUES, TIER_NAMES, LEAGUE_COEF, METRIC_BETA,
  bucketFor, groupApplies, metricsFor,
} from "../src/lib/metrics.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const IN_DIR = path.join(ROOT, "scout_data");
const OUT_DIR = path.join(ROOT, "public", "data");
const OUT_FILE = path.join(OUT_DIR, "players.json");

const MIN_MINUTES = Number(process.env.MIN_MINUTES || 900);
const IMG_PREFIX = "https://cdn.sportmonks.com/images/soccer/players/";

// ------------------------------------------------------------ helpers
const flat = GROUPS.flatMap(([group, specs]) =>
  specs.map((spec) => ({ ...spec, group })));
const labels = flat.map((m) => m.label);

function num(stats, key, sub = "total") {
  const v = stats[key];
  if (v == null) return 0;
  if (typeof v === "object") {
    for (const k of [sub, "total", "average", "expected"]) {
      if (k in v) {
        const n = Number(v[k]);
        return Number.isFinite(n) ? n : 0;
      }
    }
    return 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function present(stats, spec) {
  switch (spec.kind) {
    case "xgd": return "Expected Goals (xG)" in stats;
    case "save%": return "Saves" in stats;
    case "pct": return spec.key in stats || spec.of in stats;
    default:
      if (spec.key === "__npg") return "Goals" in stats;
      if (spec.key === "__xg") return "Expected Goals (xG)" in stats;
      if (spec.key === "__pensaved") return "Penalties" in stats;
      return spec.key in stats;
  }
}

function value(stats, minutes, spec) {
  switch (spec.kind) {
    case "raw":
      return num(stats, spec.key);
    case "tot":
      if (spec.key === "__pensaved") return Number(stats.Penalties?.saved || 0);
      return num(stats, spec.key);
    case "pct": {
      const a = num(stats, spec.key);
      const b = num(stats, spec.of);
      return b ? (a / b) * 100 : 0;
    }
    case "xgd": {
      const d = Number(stats["Expected Goals (xG)"]?.difference || 0);
      return minutes ? (d / minutes) * 90 : 0;
    }
    case "save%": {
      /* Shots on target faced = the ones saved plus the ones that went in. */
      const saves = num(stats, "Saves");
      const conceded = num(stats, "Goals Conceded");
      const faced = saves + conceded;
      return faced ? (saves / faced) * 100 : 0;
    }
    case "p90": {
      let t;
      if (spec.key === "__npg") t = Number(stats.Goals?.goals || 0);
      else if (spec.key === "__xg") t = Number(stats["Expected Goals (xG)"]?.expected || 0);
      else t = num(stats, spec.key);
      return minutes ? (t / minutes) * 90 : 0;
    }
    default:
      return 0;
  }
}

function percentile(v, pool) {
  if (!pool.length) return 50;
  let below = 0, equal = 0;
  for (const x of pool) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return ((below + equal / 2) / pool.length) * 100;
}

function ageFrom(dob) {
  if (!dob) return null;
  const [y, m, d] = String(dob).slice(0, 10).split("-").map(Number);
  if (!y) return null;
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a > 14 && a < 50 ? a : null;
}

function cleanName(s) {
  return String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function trimTail(arr) {
  const out = [...arr];
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

// ------------------------------------------------------------ load
if (!fs.existsSync(IN_DIR)) {
  console.error(`\n  No ${path.relative(ROOT, IN_DIR)}/ folder.`);
  console.error("  Drop the harvest JSON files there and run again.\n");
  process.exit(1);
}

const files = fs.readdirSync(IN_DIR).filter((f) => f.endsWith(".json")).sort();
if (!files.length) {
  console.error(`\n  ${path.relative(ROOT, IN_DIR)}/ is empty.\n`);
  process.exit(1);
}

const seasons = [];
for (const f of files) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(IN_DIR, f), "utf8"));
    if (raw.empty || !raw.players || !Object.keys(raw.players).length) continue;
    seasons.push(raw);
  } catch (err) {
    console.warn(`  skipping ${f}: ${err.message}`);
  }
}

console.log(`\n  ${seasons.length} league-seasons found\n`);

/*
 * A transfer or club-history row only carries team ids, not names. We
 * already see a name for every current club (p.team + p.team_id), so
 * gather those across every file into one id->name map and use it to turn
 * the ids in transfers/teams into readable clubs. No extra API calls —
 * just what harvest already wrote. Ids we never saw a name for stay blank.
 */
const teamNames = {};
for (const s of seasons) {
  for (const p of Object.values(s.players)) {
    if (p.team_id && p.team) teamNames[p.team_id] = cleanName(p.team);
  }
}

/* resolve_teams.py caches names for clubs outside our leagues (the older
   sides in a transfer history). Merge it in if present — our own current
   names win over the cache where both exist. */
try {
  const cachePath = path.join(IN_DIR, "..", "team_names.json");
  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    for (const [id, name] of Object.entries(cache)) {
      if (name && !teamNames[id]) teamNames[id] = cleanName(name);
    }
  }
} catch { /* no cache, ids just stay unresolved */ }

for (const s of seasons) {
  const n = Object.keys(s.players).length;
  const mark = s.complete ? "" : "  (partial)";
  console.log(`    ${String(s.league).padEnd(18)} ${String(s.season_name).padEnd(12)} ${String(n).padStart(4)} players${mark}`);
}

// ------------------------------------------------------------ build
const pools = new Map();      // "lid_sid_pos" -> [player]
for (const season of seasons) {
  for (const p of Object.values(season.players)) {
    if ((p.minutes || 0) < MIN_MINUTES) continue;
    const pos = bucketFor(p);
    if (!pos) continue;
    const key = `${season.league_id}_${season.season_id}_${pos}`;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(p);
  }
}

/*
 * A percentile is only as steady as the pool behind it. Sixteen attacking
 * midfielders in one league-season means a single place is worth six
 * points, and one assist can move a player a long way. Where a pool is
 * that thin, the other seasons of the same league are ranked alongside it.
 * The player still belongs to his own season; he is just measured against
 * a wider set of peers doing the same job in the same league.
 */
const THIN_POOL = 30;
const rankAgainst = new Map();   // pool key -> the players used for ranking
for (const [key, group] of pools) {
  const [lid, , pos] = key.split("_");
  if (group.length >= THIN_POOL) { rankAgainst.set(key, group); continue; }
  const wider = [];
  for (const [otherKey, otherGroup] of pools) {
    const [oLid, , oPos] = otherKey.split("_");
    if (oLid === lid && oPos === pos) wider.push(...otherGroup);
  }
  rankAgainst.set(key, wider.length > group.length ? wider : group);
}

const rows = [];
const poolSizes = {};
const peerCounts = {};

for (const [key, group] of pools) {
  const [lid, sid, pos] = key.split("_");
  const inScope = flat.map((m) => groupApplies(m.group, pos));

  const raws = group.map((p) =>
    flat.map((spec, j) =>
      inScope[j] && present(p.stats, spec) ? value(p.stats, p.minutes, spec) : null));

  /* the set a player is measured against, which is wider when his own
     league-season holds too few of his position to rank him steadily */
  const peers = rankAgainst.get(key) || group;
  const peerRaws = peers === group ? raws : peers.map((p) =>
    flat.map((spec, j) =>
      inScope[j] && present(p.stats, spec) ? value(p.stats, p.minutes, spec) : null));

  const pcts = group.map(() => new Array(flat.length).fill(null));
  flat.forEach((spec, j) => {
    const col = peerRaws.map((r) => r[j]).filter((v) => v !== null);
    if (col.length < 5) return;         // too thin to rank fairly
    group.forEach((_, i) => {
      if (raws[i][j] === null) return;
      const pc = percentile(raws[i][j], col);
      /* whole numbers: a percentile of 74.3 claims a precision the pool
         size cannot support, and the extra digit doubles the payload */
      pcts[i][j] = Math.round(spec.invert ? 100 - pc : pc);
    });
  });

  /*
   * Some "lower is better" metrics can be gamed by not competing: a player
   * who never enters a duel is never dribbled past. Where a metric names a
   * volume gauge (floorBy) and that volume sits in the bottom fifth, the
   * reward is capped at the midpoint — clean, but not credited as a strength.
   */
  flat.forEach((spec, j) => {
    if (!spec.invert || !spec.floorBy) return;
    const volJ = labels.indexOf(spec.floorBy);
    if (volJ < 0) return;
    group.forEach((_, i) => {
      if (pcts[i][j] === null) return;
      const vol = pcts[i][volJ];
      if (vol !== null && vol < (spec.floorMinPct ?? 20)) {
        pcts[i][j] = Math.min(pcts[i][j], 50);
      }
    });
  });

  poolSizes[key] = group.length;
  /* how many players actually stood behind the ranking */
  peerCounts[key] = peers.length;

  /* Each theme averages the percentiles of the metrics inside it. */
  const themes = (THEMES[pos] || []).map((t) => ({
    name: t.name,
    weight: t.weight ?? 1,
    note: t.note || null,
    idx: t.metrics.map((l) => labels.indexOf(l)).filter((j) => j >= 0),
    /* per-metric weights, for the ones that carry more luck than skill */
    mw: t.metrics.map((l) => t.metricWeights?.[l] ?? 1),
    /* an axis that only applies to players who actually do that job */
    gate: t.onlyIf
      ? { idx: labels.indexOf(t.onlyIf.metric), min: t.onlyIf.minPercentile }
      : null,
  }));

  group.forEach((p, i) => {
    /*
     * A theme only scores when most of its metrics are present. Without
     * that rule a player missing two of three would look identical to one
     * measured on all three, and the gap would be invisible.
     */
    const themeScores = themes.map((t) => {
      if (!t.idx.length) return null;

      /*
       * Some axes only describe part of the position. A central playmaker
       * who never crosses is not crossing badly — he is playing a different
       * role, so the axis is left blank rather than counted against him.
       */
      if (t.gate && t.gate.idx >= 0) {
        const vol = pcts[i][t.gate.idx];
        if (vol === null || vol < t.gate.min) return null;
      }

      let sum = 0, wt = 0, held = 0;
      t.idx.forEach((j, k) => {
        const v = pcts[i][j];
        if (v === null) return;
        held++;
        sum += v * t.mw[k];
        wt += t.mw[k];
      });

      /*
       * Two thirds of the metrics have to be there. At a half, a pair of
       * metrics could produce an "ability" from one number, which is a
       * guess dressed up as a measurement.
       */
      if (held / t.idx.length < 2 / 3) return null;
      return wt ? Math.round((sum / wt) * 10) / 10 : null;
    });

    /*
     * Some abilities are the position. A striker with no scoring data has
     * nothing worth ranking, so no score is produced at all rather than
     * one quietly built from the other five.
     */
    const coreMissing = themes.some(
      (t, k) => (CORE[pos] || []).includes(t.name) && themeScores[k] === null
    );

    /* Share of every metric this position uses that the player actually has. */
    const allIdx = [...new Set(themes.flatMap((t) => t.idx))];
    const held = allIdx.filter((j) => pcts[i][j] !== null).length;
    const coverage = allIdx.length ? Math.round((held / allIdx.length) * 100) : 0;

    let wSum = 0, wTot = 0;
    themeScores.forEach((v, k) => {
      if (v === null) return;
      wSum += v * themes[k].weight;
      wTot += themes[k].weight;
    });
    const raw = wTot && !coreMissing ? wSum / wTot : null;


    /*
     * Role reading. Two numbers, because they answer different questions.
     *
     *   quality — the weighted average of the abilities the role leans on.
     *             How good is he at the things this job needs?
     *
     *   fit     — how closely the shape of his profile matches the role's
     *             emphasis, regardless of level. A player whose strengths
     *             sit exactly where the role wants them scores high even
     *             if those strengths are modest.
     */
    const roleList = ROLES[pos] || [];
    const roleScores = roleList.map((role) => {
      let qNum = 0, qDen = 0;
      const pairs = [];

      themes.forEach((t, k) => {
        const v = themeScores[k];
        if (v === null) return;
        const w = role.w[t.name];
        if (w == null) return;
        qNum += v * w;
        qDen += w;
        pairs.push({ ability: v, want: w });
      });

      if (!pairs.length) return { quality: null, fit: null };

      const quality = Math.round((qNum / qDen) * 10) / 10;

      /*
       * An all-round role is not a shape to match — it is the absence of a
       * weak spot. Scoring it on the floor of a player's abilities stops
       * every balanced-looking profile from winning it by default.
       */
      if (role.allRound) {
        /*
         * An all-round role is not a shape to match — it is the absence of a
         * weak spot. So fit measures how even the profile is: a flat set of
         * abilities matches, a spiky one does not. Expressing it as spread
         * puts it on the same 0-100 footing as the drift-based fit below,
         * where 100 means a perfect match and 0 means none. "How good" still
         * lives in quality; this axis only asks "any holes?".
         */
        const vals = pairs.map((p) => p.ability);
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const spread = Math.sqrt(
          vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
        return {
          quality,
          fit: Math.round(Math.max(0, 100 - spread * 1.8) * 10) / 10,
        };
      }

      /*
       * Fit compares two shapes. Each ability is expressed as its share of
       * the player's own total, and each weight as its share of the role's
       * total; the closer those two distributions sit, the better the match.
       */
      const abilitySum = pairs.reduce((s, p) => s + p.ability, 0);
      const wantSum = pairs.reduce((s, p) => s + p.want, 0);
      let drift = 0;
      if (abilitySum > 0) {
        for (const p of pairs) {
          drift += Math.abs(p.ability / abilitySum - p.want / wantSum);
        }
      } else {
        drift = 2;
      }
      /* drift runs 0 to 2; halve it to get a 0-1 mismatch, then invert. */
      const fit = Math.round((100 - (drift / 2) * 100) * 10) / 10;

      return { quality, fit };
    });

    /*
     * Naming a role takes more than winning: the match has to be good
     * enough to mean something, and clear enough not to be a coin toss.
     */
    let label = null, labelKind = null;
    const ranked = roleScores
      .map((r, k) => ({ ...r, name: roleList[k]?.name, k }))
      .filter((r) => r.fit !== null)
      .sort((a, b) => b.fit - a.fit);

    if (ranked.length) {
      const top = ranked[0];
      const second = ranked[1];
      const lowLevel = top.quality != null && top.quality < ROLE_RULES.minQuality;
      if (top.fit < ROLE_RULES.minFit) {
        /* the shape does not match anything closely enough to name */
        label = "No clear role";
        labelKind = "none";
      } else if (lowLevel) {
        /* shape fits, level does not — name the profile, not a match */
        label = `${top.name} profile`;
        labelKind = "profile";
      } else if (!second || top.fit - second.fit >= ROLE_RULES.clearGap) {
        label = top.name;
        labelKind = "clear";
      } else if (top.fit - second.fit <= ROLE_RULES.versatile) {
        label = `${top.name} / ${second.name}`;
        labelKind = "versatile";
      } else {
        label = top.name;
        labelKind = "leaning";
      }
    }
    let img = p.image || "";
    if (img.startsWith(IMG_PREFIX)) img = img.slice(IMG_PREFIX.length);
    else if (img) img = "!" + img;

    /* preferred foot lives in metadata under type_id 229 */
    let foot = null;
    for (const m of p.metadata || []) {
      if (m.type_id === 229 && m.values) { foot = String(m.values); break; }
    }

    /* transfers: newest first, ids turned into club names where we have
       them, amount kept only when the feed actually gave one. Type ids
       (Sportmonks): 218 loan, 219 paid transfer, 220 free, 9688 end of loan */
    const transfers = (p.transfers || [])
      .filter((t) => t.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((t) => ({
        d: t.date,
        from: teamNames[t.from_team_id] || null,
        to: teamNames[t.to_team_id] || null,
        amt: t.amount ?? null,
        kind: t.type_id === 218 ? "loan"
            : t.type_id === 220 ? "free"
            : t.type_id === 9688 ? "endloan"
            : t.type_id === 219 ? "fee"
            : null,
      }))
      .slice(0, 12);

    rows.push({
      id: p.id,
      n: cleanName(p.name),
      t: cleanName(p.team),
      img,
      pos,
      dp: p.detailed_position || null,
      lid: Number(lid),
      sid: Number(sid),
      age: ageFrom(p.dob),
      dob: p.dob || null,
      ht: p.height || null,
      wt: p.weight || null,
      foot,
      nat: p.nationality || null,
      natc: p.nationality_fifa || null,
      flag: p.nationality_flag || null,
      tr: transfers,
      trc: (p.trophies || []).length,
      m: Math.round(p.minutes),
      ap: Math.round(num(p.stats, "Appearances")),
      rt: Math.round((Number(p.stats.Rating?.average) || 0) * 100) / 100,
      g: Math.round(Number(p.stats.Goals?.total) || 0),
      a: Math.round(num(p.stats, "Assists")),
      v: trimTail(raws[i].map((x) => (x === null ? null : Math.round(x * 100) / 100))),
      p: trimTail(pcts[i]),
      th: themeScores.map((v) => (v === null ? null : Math.round(v))),
      raw,
      rq: roleScores.map((r) => (r.quality === null ? null : Math.round(r.quality))),
      rf: roleScores.map((r) => (r.fit === null ? null : Math.round(r.fit))),
      rl: label,
      rk: labelKind,
      cov: coverage,
      pr: peerCounts[key],
      sc: null,   /* filled in below, once the pool is complete */
    });
  });
}

/*
 * Averaging percentiles into an ability, then averaging abilities into a
 * score, squeezes everyone toward the middle: the best centre-back in the
 * sample came out at 72 while his individual metrics ran to 99. Ranking
 * the weighted mean inside its own pool puts the score back on the same
 * 0-100 footing as everything else it sits beside.
 */
for (const [key] of pools) {
  const [lid, , pos] = key.split("_");
  const rowsHere = rows.filter((r) => `${r.lid}_${r.sid}_${r.pos}` === key);
  /* rank against the same set the metrics were ranked against */
  const wide = (peerCounts[key] || 0) > (poolSizes[key] || 0);
  const against = wide
    ? rows.filter((r) => String(r.lid) === lid && r.pos === pos)
    : rowsHere;
  const col = against.map((r) => r.raw).filter((v) => v != null);
  for (const r of rowsHere) {
    r.sc = r.raw == null ? null : Math.round(percentile(r.raw, col));
  }
}
/* only now is every pool done with the raw figures */
for (const r of rows) delete r.raw;

/*
 * How much tougher one league is than another, solved from players we hold
 * in both. A player moving to a harder league scores lower there; fitting a
 * level per league to those drops gives a scale.
 *
 * It explains about a fifth of the variance in a single move, which is to
 * say the average is real and the individual case is not. The app uses it
 * to answer "what would this look like over there", never to adjust a score.
 */
function solveLeagueLevels(rowsIn) {
  const byId = {};
  for (const r of rowsIn) (byId[r.id] = byId[r.id] || []).push(r);

  const moves = [];
  for (const list of Object.values(byId)) {
    const sorted = [...list].sort((a, b) => a.sid - b.sid);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (a.lid === b.lid || a.sc == null || b.sc == null) continue;
      moves.push({ from: a.lid, to: b.lid, diff: b.sc - a.sc });
    }
  }
  if (moves.length < 40) return { levels: {}, moves: moves.length, fit: 0 };

  const ids = [...new Set(rowsIn.map((r) => r.lid))];
  const level = Object.fromEntries(ids.map((i) => [i, 0]));
  const anchor = ids.includes(8) ? 8 : ids[0];

  /*
   * level is difficulty: the harder the league, the higher the number.
   * A move from A to B changes a score by (level A − level B), which is
   * negative when B is the tougher league.
   */
  for (let pass = 0; pass < 3000; pass++) {
    const adj = {}, cnt = {};
    for (const m of moves) {
      const err = m.diff - (level[m.from] - level[m.to]);
      /* the error is shared: raise where he came from, lower where he went */
      adj[m.from] = (adj[m.from] || 0) + err; cnt[m.from] = (cnt[m.from] || 0) + 1;
      adj[m.to] = (adj[m.to] || 0) - err;     cnt[m.to] = (cnt[m.to] || 0) + 1;
    }
    for (const i of ids) if (cnt[i]) level[i] += 0.05 * adj[i] / cnt[i];
    const base = level[anchor];
    for (const i of ids) level[i] -= base;
  }

  /*
   * The fit on the moves it was trained on flatters the model. What matters
   * is how it does on moves it has not seen, so five-fold cross-validation
   * gives the number worth quoting.
   */
  let seIn = 0, sa = 0;
  for (const m of moves) {
    seIn += (m.diff - (level[m.from] - level[m.to])) ** 2;
    sa += m.diff ** 2;
  }

  let seOut = 0, naive = 0, nOut = 0;
  for (let fold = 0; fold < 5; fold++) {
    const train = moves.filter((_, i) => i % 5 !== fold);
    const test = moves.filter((_, i) => i % 5 === fold);
    const lv = Object.fromEntries(ids.map((i) => [i, 0]));
    for (let pass = 0; pass < 2000; pass++) {
      const adj = {}, cnt = {};
      for (const m of train) {
        const err = m.diff - (lv[m.from] - lv[m.to]);
        adj[m.from] = (adj[m.from] || 0) + err; cnt[m.from] = (cnt[m.from] || 0) + 1;
        adj[m.to] = (adj[m.to] || 0) - err;     cnt[m.to] = (cnt[m.to] || 0) + 1;
      }
      for (const i of ids) if (cnt[i]) lv[i] += 0.05 * adj[i] / cnt[i];
      const base = lv[anchor];
      for (const i of ids) lv[i] -= base;
    }
    for (const m of test) {
      seOut += (m.diff - (lv[m.from] - lv[m.to])) ** 2;
      naive += m.diff ** 2;
      nOut++;
    }
  }

  const counts = {};
  for (const m of moves) {
    counts[m.from] = (counts[m.from] || 0) + 1;
    counts[m.to] = (counts[m.to] || 0) + 1;
  }

  return {
    levels: Object.fromEntries(ids.map((i) => [i, Math.round(level[i] * 10) / 10])),
    seen: counts,
    moves: moves.length,
    /* out-of-sample: how much of a real, unseen move it explains */
    fit: Math.round((1 - seOut / naive) * 100),
    error: Math.round(Math.sqrt(seOut / nOut)),
  };
}

const strength = solveLeagueLevels(rows);
console.log(`\n  league levels solved from ${strength.moves} moves ` +
  `(explains ${strength.fit}% of a single move)\n`);

/*
 * Level-adjusted score (sc2) from the hand-calibrated league coefficients.
 * A single coefficient can't hit every metric alike, so each position gets
 * an effective sensitivity: the beta of the metrics that actually drive its
 * score, averaged by weight, with inverted (volume) metrics counted the
 * other way. The score is then scaled by (coef_league / coef_PL) raised to
 * that effective beta — attacking-led roles move most, ratio-led least.
 * Leagues absent from LEAGUE_COEF keep sc2 == sc (no calibration on file).
 */
{
  const PL = LEAGUE_COEF[8] || 1;

  /* effective beta per position, from the themes/metrics that build its raw
     score and their weights — computed once, reused for every player */
  const posBeta = {};
  for (const pos of ORDER) {
    let bSum = 0, wSum = 0;
    for (const t of THEMES[pos] || []) {
      const tw = t.weight ?? 1;
      for (const label of t.metrics) {
        const spec = flat.find((m) => m.label === label);
        const key = spec?.key;
        const [beta] = METRIC_BETA[key] || METRIC_BETA._default;
        bSum += beta * tw;
        wSum += tw;
      }
    }
    posBeta[pos] = wSum ? bSum / wSum : 0.6;
  }

  for (const r of rows) {
    if (r.sc == null) { r.sc2 = null; continue; }
    const cs = LEAGUE_COEF[r.lid];
    if (cs == null) { r.sc2 = Math.round(r.sc); continue; }  // no calibration
    const beta = posBeta[r.pos] ?? 0.6;
    const factor = Math.pow(cs / PL, beta);       // <= 1 for weaker leagues
    r.sc2 = Math.max(1, Math.min(99, Math.round(r.sc * factor)));
  }
}

const leagueNames = {};
const seasonNames = {};
for (const s of seasons) {
  /*
   * The feed calls both the Belgian and Saudi top flights "Pro League",
   * which would leave a reader guessing. Where we hold a name of our own,
   * it wins.
   */
  leagueNames[s.league_id] = LEAGUES[s.league_id]?.name || s.league;
  seasonNames[s.season_id] = s.season_name || String(s.season_id);
}

/* distinct nationalities present, for the Explore filter — name + code +
   flag, sorted by how many players carry each so common ones lead */
const natCounts = new Map();
for (const r of rows) {
  if (!r.nat) continue;
  const e = natCounts.get(r.nat) || { nat: r.nat, code: r.natc, flag: r.flag, n: 0 };
  e.n++;
  natCounts.set(r.nat, e);
}
const nationalities = [...natCounts.values()].sort((a, b) => b.n - a.n || a.nat.localeCompare(b.nat));

const payload = {
  meta: {
    minMinutes: MIN_MINUTES,
    built: new Date().toISOString().slice(0, 10),
    leagues: leagueNames,
    seasons: seasonNames,
    pairs: [...new Set(seasons.map((s) => `${s.league_id}|${s.season_id}`))]
      .map((k) => k.split("|")),
    pools: poolSizes,
    peers: peerCounts,
    labels,
    short: labels.map((l) => SHORT[l] || l),
    units: flat.map((m) => UNITS[m.kind] || ""),
    help: labels.map((l) => HELP[l] || ""),
    invert: flat.map((m) => !!m.invert),
    groups: GROUPS.map(([name, specs]) => [
      name,
      specs.map((sp) => labels.indexOf(sp.label)),
    ]),
    themes: Object.fromEntries(ORDER.map((pos) => [
      pos,
      (THEMES[pos] || []).map((t) => ({
        name: t.name,
        short: THEME_SHORT[t.name] || t.name,
        weight: t.weight ?? 1,
        note: t.note || null,
        idx: t.metrics.map((l) => labels.indexOf(l)).filter((j) => j >= 0),
      })),
    ])),
    /*
     * Columns come in two shapes. A string is a raw metric, carried as its
     * label index into every row's v/p arrays. A { theme } entry is an whole
     * ability: it carries the theme's index into the row's th array, plus the
     * label indices of the metrics inside it, so the table can open a strip
     * showing what the ability was built from.
     */
    columns: Object.fromEntries(ORDER.map((pos) => {
      const posThemes = THEMES[pos] || [];
      const cols = (COLUMNS[pos] || []).map((c) => {
        if (typeof c === "string") {
          const i = labels.indexOf(c);
          return i >= 0 ? { k: "m", i } : null;
        }
        const ti = posThemes.findIndex((t) => t.name === c.theme);
        if (ti < 0) return null;
        const t = posThemes[ti];
        return {
          k: "t",
          i: ti,
          name: t.name,
          short: THEME_SHORT[t.name] || t.name,
          m: t.metrics.map((l) => labels.indexOf(l)).filter((j) => j >= 0),
        };
      }).filter(Boolean);
      return [pos, cols];
    })),
    roles: Object.fromEntries(ORDER.map((pos) => [
      pos,
      (ROLES[pos] || []).map((r) => ({
        name: r.name,
        blurb: r.blurb,
        note: r.note || null,
        /* weights as a share, which reads better than a raw multiplier */
        mix: (THEMES[pos] || []).map((t) => {
          const total = (THEMES[pos] || [])
            .reduce((s, x) => s + (r.w[x.name] ?? 0), 0);
          const w = r.w[t.name] ?? 0;
          return total ? Math.round((w / total) * 1000) / 10 : 0;
        }),
      })),
    ])),
    roleRules: ROLE_RULES,
    positions: POSITIONS,
    nationalities,
    order: ORDER,
    codes: Object.fromEntries(Object.entries(LEAGUES).map(([k, v]) => [k, v.code])),
    hues: Object.fromEntries(Object.entries(LEAGUES).map(([k, v]) => [k, v.hue])),
    flags: Object.fromEntries(Object.entries(LEAGUES)
      .filter(([, v]) => v.iso)
      .map(([k, v]) => [k, `https://cdn.sportmonks.com/images/countries/png/short/${v.iso}.png`])),
    tiers: Object.fromEntries(Object.entries(LEAGUES).map(([k, v]) => [k, v.tier])),
    tierRank: Object.fromEntries(Object.entries(LEAGUES).map(([k, v]) => [k, v.rank])),
    tierNames: TIER_NAMES,
    strength: strength.levels,
    strengthSeen: strength.seen,
    strengthMoves: strength.moves,
    strengthFit: strength.fit,
    imgbase: IMG_PREFIX,
  },
  rows,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(payload));

const kb = fs.statSync(OUT_FILE).size / 1024;
console.log(`\n  ${rows.length} player-seasons · ${labels.length} metrics each\n`);
for (const [lid, sid] of payload.meta.pairs) {
  const parts = ORDER
    .filter((pos) => poolSizes[`${lid}_${sid}_${pos}`])
    .map((pos) => `${pos} ${poolSizes[`${lid}_${sid}_${pos}`]}`);
  if (parts.length) {
    console.log(`    ${String(leagueNames[lid]).padEnd(18)} ${String(seasonNames[sid]).padEnd(12)} ${parts.join(" · ")}`);
  }
}
console.log(`\n  Written to public/data/players.json  (${kb.toFixed(0)} KB)\n`);
