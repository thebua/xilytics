import { SERIES } from "../lib/util";
import "./radar.css";

/**
 * Six themes, six spokes. Each spoke is the average percentile of the
 * metrics behind it, so the shape reads as a set of abilities rather
 * than a scatter of individual numbers.
 */
export default function Radar({ players, themes, meta, size = 460, radius }) {
  /* more spokes need a smaller wheel to keep the labels clear */
  const r = radius ?? (themes.length > 6 ? 120 : 132);
  const n = themes.length;
  if (!n || !players.length) return null;

  const c = size / 2;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i, r) => [c + Math.cos(angle(i)) * r, c + Math.sin(angle(i)) * r];

  /*
   * Percentiles cluster in the 40-80 band, and on a straight 0-100 radius
   * that band sits where a small change in radius is a large change in
   * area — so similar players draw nearly the same shape and read as one.
   * This eases that: the weak end (below 25) is folded into the inner
   * eighth of the wheel, keeping its order but not its spread, and 25-100
   * opens out across the remaining radius. Middle-band differences grow,
   * strong values reach nearer the rim, and nothing is invented — a higher
   * number is still further out than a lower one, everywhere.
   */
  const FLOOR = 25;
  const spoke = (v) => {
    const val = v ?? 0;
    const frac = val <= FLOOR
      ? 0.12 * (Math.max(val, 0) / FLOOR)
      : 0.12 + 0.88 * ((val - FLOOR) / (100 - FLOOR));
    return r * Math.max(frac, 0.015);
  };

  return (
    <svg className="radar-svg" viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`Ability radar for ${players.map((p) => p.n).join(", ")}`}>
      {[25, 50, 75, 100].map((v) => (
        <circle key={v} className={"ring" + (v === 50 ? " mid" : "")}
          cx={c} cy={c} r={spoke(v)} />
      ))}

      {themes.map((_, i) => {
        const [x, y] = point(i, r);
        return <line key={i} className="spoke" x1={c} y1={c} x2={x} y2={y} />;
      })}

      {players.map((p, k) => {
        const pts = themes.map((_, i) => point(i, spoke(p.th[i])));
        const d = pts.map((q, i) =>
          `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ") + " Z";
        return <path key={k} className="blob" d={d} fill={SERIES[k]} stroke={SERIES[k]} />;
      })}

      {players.map((p, k) =>
        themes.map((t, i) => {
          const [x, y] = point(i, spoke(p.th[i]));
          const detail = t.idx
            .map((j) => `${meta.labels[j]} ${p.p[j] ?? "—"}`)
            .join("\n");
          return (
            <circle key={`${k}-${i}`} className="dot"
              cx={x.toFixed(1)} cy={y.toFixed(1)} r={4} fill={SERIES[k]}>
              <title>{`${p.n} — ${t.name}: ${p.th[i] ?? "—"}\n${detail}`}</title>
            </circle>
          );
        })
      )}

      {themes.map((t, i) => {
        /* One line per spoke. Long names have a short form so labels never
           stack up and run into their neighbours. */
        const gap = themes.length > 6 ? 20 : 24;
        const [x, y] = point(i, r + gap);
        const anchor = x > c + 12 ? "start" : x < c - 12 ? "end" : "middle";
        const top = y < c - 10;
        return (
          <g key={i}>
            <text className="axis-label" x={x.toFixed(1)}
              y={(y + (top ? -2 : 10)).toFixed(1)} textAnchor={anchor}>
              {t.short || t.name}
              <title>{t.name}</title>
            </text>
            {t.weight !== 1 && (
              <text className="axis-weight" x={x.toFixed(1)}
                y={(y + (top ? 9 : 21)).toFixed(1)} textAnchor={anchor}>
                ×{t.weight}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
