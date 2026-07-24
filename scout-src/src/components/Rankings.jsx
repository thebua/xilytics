import { useMemo, useState } from "react";
import { ALL, byStanding, ramp, fmt } from "../lib/util";
import "./rankings.css";

/**
 * Where a player actually finishes on every metric, not just what
 * percentile he lands in. "4th of 65" says something a bar cannot.
 *
 * The comparison set is the reader's to choose: his own league is the
 * fair test, a wider pool is the interesting one — with the caveat that
 * nothing here adjusts for the standard of the league.
 */
export default function Rankings({ row, data }) {
  const { meta, rows } = data;
  const [scope, setScope] = useState("own");

  /* Everyone playing the same position, filtered by the chosen scope. */
  const pool = useMemo(() => {
    const samePos = rows.filter((r) => r.pos === row.pos);
    if (scope === "own") {
      return samePos.filter((r) => r.lid === row.lid && r.sid === row.sid);
    }
    if (scope === "own-all-seasons") {
      return samePos.filter((r) => r.lid === row.lid);
    }
    if (scope === "all") {
      return samePos.filter((r) => meta.seasons[r.sid] === meta.seasons[row.sid]);
    }
    /* a specific league, matched on season name so ids across leagues line up */
    return samePos.filter(
      (r) => String(r.lid) === scope && meta.seasons[r.sid] === meta.seasons[row.sid]
    );
  }, [rows, meta, row, scope]);

  /*
   * One competition ranking per metric, direction-aware, plus the
   * percentile that falls out of the same placing. Both are read off the
   * chosen pool, so the bar and the "4th of 65" can never disagree.
   */
  const ranks = useMemo(() => {
    const out = {};
    const mine = new Set(meta.groups.flatMap(([, idx]) => idx));
    for (const i of mine) {
      const mineVal = row.v[i];
      if (mineVal == null) continue;
      const col = pool.map((r) => r.v[i]).filter((v) => v != null);
      if (col.length < 3) continue;
      const better = meta.invert[i]
        ? col.filter((v) => v < mineVal).length
        : col.filter((v) => v > mineVal).length;
      const place = better + 1;
      const of = col.length;
      /* share of the field he is ahead of, on a 0-100 scale */
      const pct = Math.round((1 - (place - 1) / Math.max(of - 1, 1)) * 100);
      out[i] = { place, of, pct };
    }
    return out;
  }, [pool, row, meta]);

  const leagueIds = useMemo(
    () => byStanding(
      [...new Set(meta.pairs.map((p) => p[0]))]
        .filter((id) => String(id) !== String(row.lid)),
      meta
    ),
    [meta, row.lid]
  );

  /* his league only has more than one season worth offering if we hold one */
  const ownSeasons = useMemo(
    () => new Set(meta.pairs.filter((p) => String(p[0]) === String(row.lid)).map((p) => p[1])).size,
    [meta, row.lid]
  );

  const scopeLabel = {
    own: `${meta.leagues[row.lid]} ${meta.seasons[row.sid]}`,
    "own-all-seasons": `${meta.leagues[row.lid]}, every season`,
    all: `every league, ${meta.seasons[row.sid]}`,
  }[scope] || `${meta.leagues[scope]} ${meta.seasons[row.sid]}`;

  const posName = meta.positions[row.pos].toLowerCase();
  const crossLeague = scope === "all" || (scope !== "own" && scope !== "own-all-seasons");

  return (
    <div className="card rankings">
      <div className="rk-head">
        <h2>Every metric, and where he ranks</h2>
        <label className="rk-scope">
          <span>Against</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="own">His own league and season</option>
            {ownSeasons > 1 && (
              <option value="own-all-seasons">His league, every season</option>
            )}
            <option value="all">Every league, same season</option>
            {[1, 2, 3, 4].map((tier) => {
              const inTier = leagueIds.filter((id) => meta.tiers?.[id] === tier);
              if (!inTier.length) return null;
              return (
                <optgroup key={tier} label={meta.tierNames?.[tier] || "Other"}>
                  {inTier.map((id) => (
                    <option key={id} value={String(id)}>{meta.leagues[id]}</option>
                  ))}
                </optgroup>
              );
            })}
            {(() => {
              const rest = leagueIds.filter((id) => meta.tiers?.[id] == null);
              return rest.length ? (
                <optgroup label="Other">
                  {rest.map((id) => (
                    <option key={id} value={String(id)}>{meta.leagues[id]}</option>
                  ))}
                </optgroup>
              ) : null;
            })()}
          </select>
        </label>
      </div>

      <p className="rk-lede">
        Placed among <b>{pool.length}</b> {posName} in {scopeLabel}.
        {crossLeague && (
          <span className="rk-warn">
            {" "}League strength is not adjusted for — a place here says who
            produced more, not who faced better opposition.
          </span>
        )}
      </p>

      <div className="rk-colhead">
        <span>Metric</span>
        <span className="rc-fig">Figure</span>
        <span className="rc-bar">Percentile</span>
        <span className="rc-place">Rank</span>
      </div>

      {meta.groups.map(([name, idxs]) => {
        const live = idxs.filter((i) => ranks[i]);
        if (!live.length) return null;
        return (
          <section className="rk-group" key={name}>
            <h3>{name}</h3>
            <div className="rk-rows">
              {live.map((i) => {
                const { place, of, pct } = ranks[i];
                const colour = ramp(pct);
                return (
                  <div className="rk-row" key={i}>
                    <span className="rk-label" title={meta.help[i] || undefined}>
                      <span className="rl-name">{meta.labels[i]}</span>
                      <span className="rl-unit">
                        {meta.units[i]}
                        {meta.invert[i] && <span className="down"> · lower better</span>}
                      </span>
                    </span>
                    <span className="rk-value">{fmt(row.v[i])}</span>
                    <span className="rk-meter">
                      <span className="rk-track">
                        <i style={{ width: `${Math.max(pct, 2)}%`, background: colour }} />
                      </span>
                      <span className="rk-pct" style={{ color: colour }}>{pct}</span>
                    </span>
                    <span className="rk-place" style={{ color: colour }}>
                      {place}<em>/{of}</em>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="note">
        <b>Percentile</b> is the share of the field he is ahead of;{" "}
        <b>rank</b> is his actual place, and ties share it — two players on
        the same figure both read as 4th, the next as 6th.{" "}
        <span className="down">↓</span> marks metrics where a lower figure is
        the better one, ranked accordingly. A metric is left out only where
        the pool is too small to place him.
      </p>
    </div>
  );
}
