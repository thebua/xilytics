import { confidenceOf } from "../lib/metrics";
import { ramp } from "../lib/util";
import "./verdict.css";

/**
 * The read-in-five-seconds layer: what this player is good at, where the
 * gaps are, and how much of the season the numbers actually cover.
 */

const DEFENSIVE = ["CB", "RB", "LB", "DM"];

const STRONG = 75;   // percentile at or above this counts as a strength
const WEAK = 30;     // at or below this counts as a concern

function band(p) {
  if (p >= 90) return "Elite";
  if (p >= 75) return "Strong";
  if (p >= 40) return "Solid";
  if (p >= 25) return "Below par";
  return "Weak";
}

/** Rank every metric this player has, best first. */
function ranked(row, meta) {
  return meta.labels
    .map((label, i) => ({ label, i, pct: row.p[i], raw: row.v[i] }))
    .filter((m) => m.pct != null)
    .sort((a, b) => b.pct - a.pct);
}

export default function Verdict({ row, meta, poolSize }) {
  const all = ranked(row, meta);
  const axisSet = new Set((meta.themes[row.pos] || []).flatMap((t) => t.idx));

  /* Prefer metrics that matter for the position, then fall back to any. */
  const pick = (list, n) => {
    const core = list.filter((m) => axisSet.has(m.i));
    const rest = list.filter((m) => !axisSet.has(m.i));
    return [...core, ...rest].slice(0, n);
  };

  const strengths = pick(all.filter((m) => m.pct >= STRONG), 4);
  const concerns = pick([...all].reverse().filter((m) => m.pct <= WEAK), 3);

  const conf = confidenceOf(row.m);
  const posName = meta.positions[row.pos].toLowerCase().replace(/s$/, "");

  return (
    <div className="verdict">
      <section className="vcol">
        <h3>Strengths</h3>
        {strengths.length ? (
          <ul>
            {strengths.map((m) => (
              <li key={m.i}>
                <span className="vlabel">{m.label}</span>
                <span className="vband" style={{ color: ramp(m.pct) }}>
                  {band(m.pct)}
                  <b>{Math.round(m.pct)}</b>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vnone">
            Nothing clears the {STRONG}th percentile among {poolSize} {posName}s.
          </p>
        )}
      </section>

      <section className="vcol">
        <h3>Concerns</h3>
        {concerns.length ? (
          <ul>
            {concerns.map((m) => (
              <li key={m.i}>
                <span className="vlabel">
                  {m.label}
                  {meta.invert[m.i] && <span className="down"> ↓</span>}
                </span>
                <span className="vband" style={{ color: ramp(m.pct) }}>
                  {band(m.pct)}
                  <b>{Math.round(m.pct)}</b>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vnone">
            No metric drops below the {WEAK}th percentile.
          </p>
        )}
      </section>

      <section className="vcol">
        <h3>Reading the data</h3>
        <div className="conf">
          <span className={"conf-dot c-" + conf.label.toLowerCase()} />
          <div>
            <b>{conf.label} confidence</b>
            <span>{row.m.toLocaleString()} minutes — {conf.note}</span>
          </div>
        </div>
        <p className="vnote">
          {row.pr > poolSize ? (
            <>
              Only <b>{poolSize}</b> {posName}s played {meta.minMinutes} minutes
              in {meta.leagues[row.lid]} {meta.seasons[row.sid]} — too few for a
              steady ranking, so the figures here compare him with{" "}
              <b>{row.pr}</b> {posName}s across every season of that league.
            </>
          ) : (
            <>
              Every figure here is a rank against <b>{poolSize}</b> {posName}s
              in {meta.leagues[row.lid]} {meta.seasons[row.sid]} who played at
              least {meta.minMinutes} minutes.
            </>
          )}{" "}
          League strength is not adjusted for, so the same number in two
          leagues is not the same standard.
        </p>
        {DEFENSIVE.includes(row.pos) && (
          <p className="vnote vcaveat">
            Defending is measured by counting actions. A player at a side that
            dominates the ball defends less often and scores lower here, which
            is a limit of the data rather than a judgement on him.
          </p>
        )}
      </section>
    </div>
  );
}
