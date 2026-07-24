/*
 * =====================================================================
 *  Load the built dataset into Postgres
 * =====================================================================
 *  Reads public/data/players.json — the file the site used to download
 *  whole — and writes it into the tables the API reads from.
 *
 *  Safe to run again. Every insert is an upsert keyed on the natural id,
 *  so a re-run after a fresh harvest updates in place rather than
 *  doubling the table. Entries that no longer exist upstream are removed
 *  at the end, which matters when a player drops below the minutes
 *  threshold and should stop appearing.
 *
 *  SETUP
 *    npm install pg dotenv
 *    put your connection string in .env as DATABASE_URL
 *    node scripts/load-db.mjs
 *
 *  The connection string is the "Session pooler" URI from Supabase:
 *  Project Settings -> Database -> Connection string -> URI.
 *  Never commit .env.
 * =====================================================================
 */

import fs from "fs";
import path from "path";
import pg from "pg";
import "dotenv/config";

/* The leagues anyone can read without an account. */
const OPEN_LEAGUES = [
  8,    // Premier League
  384,  // Serie A
  600,  // Süper Lig
];

const DATA_FILE = path.join("public", "data", "players.json");
const BATCH = 500;

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("\n  DATABASE_URL is not set. Put it in .env:\n");
  console.error("    DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres\n");
  process.exit(1);
}

if (!fs.existsSync(DATA_FILE)) {
  console.error(`\n  ${DATA_FILE} not found — run "npm run data" first.\n`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

/* ------------------------------------------------------------ helpers */

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/*
 * Build a multi-row INSERT. Passing every row as a parameter keeps the
 * driver escaping values rather than us, and one statement per 500 rows
 * is far cheaper than 500 round trips.
 *
 * Column names are quoted because two of them — "values" and "position" —
 * are reserved words, and an unquoted `values` in a column list is a
 * syntax error rather than a subtle bug, so it would fail loudly on the
 * first run either way. Quoting all of them keeps the rule simple.
 */
function insertMany(cols, rows, table, conflict) {
  const q = (c) => `"${c}"`;
  const params = [];
  const tuples = rows.map((row, r) => {
    const marks = cols.map((_, c) => `$${r * cols.length + c + 1}`);
    params.push(...cols.map((c) => row[c]));
    return `(${marks.join(",")})`;
  });
  const updates = cols
    .filter((c) => !conflict.key.includes(c))
    .map((c) => `${q(c)} = excluded.${q(c)}`)
    .join(", ");
  const sql =
    `insert into ${table} (${cols.map(q).join(",")}) values ${tuples.join(",")} ` +
    `on conflict (${conflict.key.map(q).join(",")}) do update set ${updates}`;
  return { sql, params };
}

async function loadTable(client, label, table, cols, rows, conflict) {
  if (!rows.length) { console.log(`  ${label.padEnd(10)} nothing to write`); return; }
  let done = 0;
  for (const part of chunk(rows, BATCH)) {
    const { sql, params } = insertMany(cols, part, table, conflict);
    await client.query(sql, params);
    done += part.length;
    process.stdout.write(`\r  ${label.padEnd(10)} ${done}/${rows.length}   `);
  }
  console.log(`\r  ${label.padEnd(10)} ${rows.length} rows written        `);
}

/* --------------------------------------------------------------- main */

async function main() {
  console.log("\n" + "=".repeat(62));
  console.log("  Loading dataset into Postgres");
  console.log("=".repeat(62) + "\n");

  const payload = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const { meta, rows } = payload;
  const open = new Set(OPEN_LEAGUES.map(Number));

  console.log(`  source     ${rows.length} player-seasons, ` +
              `${Object.keys(meta.leagues).length} leagues`);
  console.log(`  open tier  ${OPEN_LEAGUES.join(", ")}\n`);

  const client = await pool.connect();
  try {
    await client.query("begin");

    /* ---- leagues ---- */
    const leagues = Object.entries(meta.leagues).map(([id, name]) => ({
      id: Number(id),
      name,
      code: meta.codes?.[id] ?? null,
      hue: meta.hues?.[id] ?? null,
      iso: null,                       // derived from flags below
      tier: meta.tiers?.[id] ?? null,
      tier_rank: meta.tierRank?.[id] ?? null,
      coef: null,
      is_open: open.has(Number(id)),
    }));
    /* the flag url ends in the iso code, which is the part worth keeping */
    for (const l of leagues) {
      const url = meta.flags?.[l.id];
      if (url) l.iso = url.split("/").pop().replace(".png", "");
    }
    await loadTable(client, "leagues", "leagues",
      ["id", "name", "code", "hue", "iso", "tier", "tier_rank", "coef", "is_open"],
      leagues, { key: ["id"] });

    /* ---- seasons ---- */
    const seasons = Object.entries(meta.seasons).map(([id, name]) => ({
      id: Number(id), name,
    }));
    await loadTable(client, "seasons", "seasons", ["id", "name"],
      seasons, { key: ["id"] });

    /* ---- players ---- */
    /* One row per person. The same player appears in several entries, and
       the later season carries the better biographical data, so take the
       last one seen rather than the first. */
    const byPlayer = new Map();
    for (const r of rows) {
      byPlayer.set(r.id, {
        id: r.id,
        name: r.n,
        image: r.img ?? null,
        dob: r.dob ?? null,
        height: r.ht ?? null,
        weight: r.wt ?? null,
        foot: r.foot ?? null,
        nationality: r.nat ?? null,
        nat_code: r.natc ?? null,
        nat_flag: r.flag ?? null,
      });
    }
    await loadTable(client, "players", "players",
      ["id", "name", "image", "dob", "height", "weight", "foot",
       "nationality", "nat_code", "nat_flag"],
      [...byPlayer.values()], { key: ["id"] });

    /* ---- entries ---- */
    const entries = rows.map((r) => ({
      player_id: r.id,
      league_id: r.lid,
      season_id: r.sid,
      team: r.t ?? null,
      pos: r.pos,
      detailed_pos: r.dp ?? null,
      age: r.age ?? null,
      minutes: r.m ?? null,
      appearances: r.ap ?? null,
      rating: r.rt ?? null,
      goals: r.g ?? null,
      assists: r.a ?? null,
      score: r.sc == null ? null : Math.round(r.sc),
      score_adj: r.sc2 ?? null,
      pool_size: r.pr ?? null,
      coverage: r.cov ?? null,
      role_label: r.rl ?? null,
      role_kind: r.rk ?? null,
      metric_values: JSON.stringify(r.v ?? []),
      percentiles: JSON.stringify(r.p ?? []),
      themes: JSON.stringify(r.th ?? []),
      role_fit: JSON.stringify(r.rf ?? []),
      role_quality: JSON.stringify(r.rq ?? []),
      transfers: JSON.stringify(r.tr ?? []),
      trophies: r.trc ?? 0,
    }));
    await loadTable(client, "entries", "entries",
      ["player_id", "league_id", "season_id", "team", "pos",
       "detailed_pos", "age", "minutes", "appearances", "rating", "goals",
       "assists", "score", "score_adj", "pool_size", "coverage",
       "role_label", "role_kind", "metric_values", "percentiles", "themes",
       "role_fit", "role_quality", "transfers", "trophies"],
      entries, { key: ["player_id", "league_id", "season_id"] });

    /* ---- meta ---- */
    /* The front end still needs the labels, themes, roles and help text.
       They are small and change with the build, so they travel as one
       document rather than a dozen tables nothing joins against. */
    await client.query(
      `insert into dataset_meta (id, built_at, min_minutes, payload)
       values (1, $1, $2, $3)
       on conflict (id) do update set
         built_at = excluded.built_at,
         min_minutes = excluded.min_minutes,
         payload = excluded.payload`,
      [meta.built, meta.minMinutes, JSON.stringify(meta)]
    );
    console.log("  meta       written");

    /* ---- prune ---- */
    /* A player who fell below the minutes threshold, or a league dropped
       from the harvest, should disappear rather than linger from an
       earlier run. */
    const keep = entries.map((e) => `${e.player_id}:${e.league_id}:${e.season_id}`);
    const { rowCount } = await client.query(
      `delete from entries
       where (player_id::text || ':' || league_id::text || ':' || season_id::text)
             <> all($1::text[])`,
      [keep]
    );
    if (rowCount) console.log(`  pruned     ${rowCount} stale entries`);

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  /* ---- verify ---- */
  const counts = await pool.query(`
    select 'leagues' t, count(*) n from leagues
    union all select 'seasons', count(*) from seasons
    union all select 'players', count(*) from players
    union all select 'entries', count(*) from entries
    union all select 'open leagues', count(*) from leagues where is_open
  `);
  console.log("\n  " + "-".repeat(30));
  for (const r of counts.rows) console.log(`  ${r.t.padEnd(14)} ${r.n}`);
  console.log("  " + "-".repeat(30));
  console.log("\n  Done.\n");

  await pool.end();
}

main().catch((err) => {
  console.error("\n  Load failed:", err.message);
  if (err.detail) console.error("  detail:", err.detail);
  process.exit(1);
});
