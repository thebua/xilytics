import { useMemo } from "react";
import { ramp } from "../lib/util";
import "./strength.css";

/**
 * How far apart the leagues sit, measured rather than assumed.
 *
 * Every player we hold on both sides of a transfer is one observation:
 * he scored X here and Y there, and the gap is what the step cost him.
 * Fitting a level per league to hundreds of those gaps gives a scale.
 *
 * It explains roughly a fifth of what happens to any single player, which
 * is the honest headline: the average is real, the individual case is not.
 */
export default function Strength({ meta }) {
  const table = useMemo(() => {
    const entries = Object.entries(meta.strength || {})
      .map(([id, level]) => ({
        id,
        level,
        code: meta.codes[id],
        name: meta.leagues[id],
        hue: meta.hues[id],
        seen: meta.strengthSeen?.[id] ?? 0,
      }))
      .filter((x) => x.name);
    entries.sort((a, b) => b.level - a.level);
    return entries;
  }, [meta]);

  if (!table.length) return null;

  const floor = Math.min(...table.map((x) => x.level));
  const width = (level) => ((level - floor) / Math.abs(floor || 1)) * 100;

  return (
    <div className="card strength">
      <h2>How far apart the leagues sit</h2>

      <p className="st-lede">
        Not a judgement — a measurement. Every player we hold on both sides
        of a transfer tells us what the step cost him, and{" "}
        <b>{meta.strengthMoves}</b> of them together give this scale. A move
        down the list is easier; the number is roughly how many points a
        player's score would move.
      </p>

      <div className="st-rows">
        {table.map((x, i) => (
          <div className="st-row" key={x.id}>
            <span className="st-rank">{i + 1}</span>
            <span className="st-code" style={{ "--lg": x.hue }}>{x.code}</span>
            <span className="st-name">{x.name}</span>
            <span className="st-track">
              <i style={{
                width: `${Math.max(width(x.level), 2)}%`,
                background: ramp(width(x.level)),
              }} />
            </span>
            <span className="st-level">
              {x.level === 0 ? "—" : x.level.toFixed(0)}
            </span>
            <span className="st-seen">{x.seen}</span>
          </div>
        ))}
      </div>

      <p className="note">
        The Premier League is the fixed point at zero and everything else is
        read against it, so <b>−25</b> means a player's score tends to rise
        by about twenty-five points on the way there and fall by the same on
        the way back. The last column counts the moves behind each figure —
        the fewer there are, the less to trust it.
        <br /><br />
        Two things are worth separating. As a <b>ranking of leagues</b> the
        scale is steady: work out the gap between two leagues directly, or
        add it up through a third, and the two agree to within a few points.
        As a <b>prediction for one player</b> it is weak — tested on moves it
        had not seen, it explains about <b>{meta.strengthFit}%</b> of what
        happens, the rest being form, age, minutes and a new system.
        <br /><br />
        So trust the order and the rough size of the gaps; treat any single
        "he'd rank Nth over there" as a bearing, not a number. Nothing here
        touches a score — the model still ranks each player inside his own
        league, and this sits beside it as context.
      </p>
    </div>
  );
}
