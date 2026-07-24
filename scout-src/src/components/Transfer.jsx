import { useEffect, useMemo, useRef, useState } from "react";
import { byStanding, ramp, band } from "../lib/util";
import "./transfer.css";

/**
 * What this player's season would have looked like in another league.
 *
 * Two readings, and the gap between them is the point:
 *
 *   as-is       his figures dropped into that league's pool, unchanged
 *   adjusted    the same figures moved by how much tougher that league is,
 *               measured from players we hold on both sides of a transfer
 *
 * The adjustment explains about a fifth of what actually happens to a
 * player who moves. It is an average, not a forecast.
 */
export default function Transfer({ row, data }) {
  const { meta, rows } = data;
  const [target, setTarget] = useState(null);
  const himRef = useRef(null);

  const options = useMemo(
    () => byStanding(
      [...new Set(meta.pairs.map((p) => p[0]))]
        .filter((id) => String(id) !== String(row.lid))
        .filter((id) => meta.strength?.[id] != null),
      meta
    ),
    [meta, row.lid]
  );

  const result = useMemo(() => {
    if (!target || row.sc == null) return null;

    /* the pool he would be joining, same position, closest season we hold */
    const seasonName = meta.seasons[row.sid];
    let pool = rows.filter(
      (r) => String(r.lid) === target && r.pos === row.pos &&
             meta.seasons[r.sid] === seasonName && r.sc != null
    );
    if (pool.length < 8) {
      pool = rows.filter(
        (r) => String(r.lid) === target && r.pos === row.pos && r.sc != null
      );
    }
    if (!pool.length) return null;

    /* levels rise with difficulty, so a step up costs points */
    const here = meta.strength[row.lid] ?? 0;
    const there = meta.strength[target] ?? 0;
    const shift = here - there;          // negative when moving up

    const place = (value) => {
      const ahead = pool.filter((r) => r.sc > value).length;
      return { place: ahead + 1, of: pool.length + 1 };
    };

    /*
     * The full table he would join, ranked on the adjusted footing: every
     * forward at his own score, plus this player at his stepped score, so
     * the single "1 of 35" becomes a real list he sits inside.
     */
    const adjScore = row.sc + shift;
    const ranked = pool
      .map((r) => ({
        key: r.lid + "-" + r.sid + "-" + r.id,
        name: r.n,
        team: r.t,
        score: r.sc,
        isHim: false,
        row: r,
      }))
      .concat([{
        key: "him",
        name: row.n,
        team: meta.leagues[row.lid],   // where he actually plays now
        score: adjScore,
        isHim: true,
        rawScore: row.sc,
        row,
      }])
      .sort((a, b) => b.score - a.score || (a.isHim ? -1 : b.isHim ? 1 : 0))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return {
      pool: pool.length,
      asIs: place(row.sc),
      adjusted: place(adjScore),
      shift,
      ranked,
      seasonUsed: pool[0] ? meta.seasons[pool[0].sid] : seasonName,
      harder: shift < -1,
      easier: shift > 1,
    };
  }, [target, rows, meta, row]);

  /* bring his row into view once a league is chosen — in a long table he
     could otherwise be scrolled out of sight */
  useEffect(() => {
    if (result && himRef.current) {
      himRef.current.scrollIntoView({ block: "center" });
    }
  }, [result]);

  if (!options.length || row.sc == null) return null;

  const posName = meta.positions[row.pos].toLowerCase();
  const axes = meta.columns[row.pos] || [];

  /* value + short label for a hybrid column on a given row */
  const cellVal = (r, ax) => (ax.k === "t" ? r.th?.[ax.i] : r.p[ax.i]);
  const colShort = (ax) => (ax.k === "t" ? ax.short : meta.short[ax.i]);
  return (
    <div className="card transfer">
      <div className="tr-head">
        <h2>If he played elsewhere</h2>
        <select value={target || ""} onChange={(e) => setTarget(e.target.value || null)}>
          <option value="">Pick a league</option>
          {[1, 2, 3, 4].map((tier) => {
            const inTier = options.filter((id) => meta.tiers?.[id] === tier);
            if (!inTier.length) return null;
            return (
              <optgroup key={tier} label={meta.tierNames?.[tier] || "Other"}>
                {inTier.map((id) => (
                  <option key={id} value={String(id)}>{meta.leagues[id]}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {!target && (
        <p className="tr-idle">
          Drop this season into another league's table and see where it
          lands — once as it stands, and once moved by how much tougher
          that league is.
        </p>
      )}

      {target && !result && (
        <p className="tr-idle">
          We hold no {posName} from {meta.leagues[target]} to compare against.
        </p>
      )}

      {result && (
        <>
          <div className="tr-cards">
            <div className="tr-card">
              <span className="tr-label">Same numbers, their table</span>
              <span className="tr-place" style={{ color: ramp(100 - (result.asIs.place / result.asIs.of) * 100) }}>
                {result.asIs.place}
                <em>of {result.asIs.of}</em>
              </span>
              <span className="tr-sub">his figures dropped in unchanged</span>
            </div>

            <div className="tr-arrow" aria-hidden="true">→</div>

            <div className="tr-card lead">
              <span className="tr-label">
                Allowing for the step {result.harder ? "up" : result.easier ? "down" : "across"}
              </span>
              <span className="tr-place" style={{ color: ramp(100 - (result.adjusted.place / result.adjusted.of) * 100) }}>
                {result.adjusted.place}
                <em>of {result.adjusted.of}</em>
              </span>
              <span className="tr-sub">
                {Math.abs(result.shift) < 1
                  ? "the two leagues sit at much the same level"
                  : `${result.harder ? "−" : "+"}${Math.abs(result.shift).toFixed(0)} points, the average move between these leagues`}
              </span>
            </div>
          </div>

          <div className="tr-table">
            <div className="tr-scroll">
              <div className="tr-th"
                style={{ gridTemplateColumns: `34px minmax(120px,1.4fr) repeat(${axes.length}, minmax(46px,1fr)) 74px` }}>
                <span className="tr-th-rank">#</span>
                <span className="tr-th-name">{posName} in {meta.leagues[target]}</span>
                {axes.map((ax, ci) => (
                  <span key={ci} className="tr-th-col" title={ax.k === "t" ? `${ax.name} ability` : meta.labels[ax.i]}>
                    {colShort(ax)}
                  </span>
                ))}
                <span className="tr-th-score">Score</span>
              </div>
              <div className="tr-rows">
                {result.ranked.map((r) => (
                  <div key={r.key} ref={r.isHim ? himRef : null}
                    className={"tr-row" + (r.isHim ? " him" : "")}
                    style={{ gridTemplateColumns: `34px minmax(120px,1.4fr) repeat(${axes.length}, minmax(46px,1fr)) 74px` }}>
                    <span className="tr-rk">{r.rank}</span>
                    <span className="tr-nm">
                      <span className="tr-nm-main">{r.name}</span>
                      <span className="tr-nm-team">
                        {r.isHim ? `adjusted from ${meta.leagues[row.lid]}` : r.team}
                      </span>
                    </span>
                    {axes.map((ax, ci) => {
                      const v = cellVal(r.row, ax);
                      return (
                        <span key={ci} className="tr-cell">
                          {v == null ? <i className="tr-dash">—</i>
                            : <b style={{ color: ramp(v) }}>{Math.round(v)}</b>}
                        </span>
                      );
                    })}
                    <span className="tr-sc">
                      <span className="tr-sc-num" style={{ color: ramp(r.score) }}>
                        {Math.round(r.score)}
                      </span>
                      {r.isHim && r.rawScore != null && (
                        <span className="tr-sc-raw">was {Math.round(r.rawScore)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="tr-colnote">
            The columns are each player's own percentile in that league. His
            row keeps the percentiles from {meta.leagues[row.lid]} — only the
            score is moved for the step, so read the columns as his profile,
            not a re-ranking.
          </p>

          <p className="tr-note">
            Measured against <b>{result.pool}</b> {posName} in{" "}
            {meta.leagues[target]} {result.seasonUsed}. The adjustment comes
            from <b>{meta.strengthMoves}</b> players we hold on both sides of
            a transfer, and it explains about <b>{meta.strengthFit}%</b> of
            what happens to any one of them. Form, age, minutes and a new
            system account for the rest, so read this as a rough bearing
            rather than a forecast.
          </p>
        </>
      )}
    </div>
  );
}
