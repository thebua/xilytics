import { useEffect, useState } from "react";
import { ramp } from "../lib/util";
import "./filters.css";

/**
 * Threshold filters. Two levels, because they answer different questions:
 *
 *   abilities — "show me centre-backs who are strong in the air"
 *   metrics   — "show me the ones taking more than three shots a game"
 *
 * Everything is set as a percentile so one slider means the same thing
 * wherever it is pointed.
 */
export default function Filters({
  meta, position, rules, setRules, matched, total, open, setOpen,
}) {
  const [showMetrics, setShowMetrics] = useState(false);

  /* abilities belong to a position, so a switch has to start clean */
  useEffect(() => { setShowMetrics(false); }, [position]);

  const themes = meta.themes[position] || [];
  const metricIdx = [...new Set(themes.flatMap((t) => t.idx))]
    .sort((a, b) => meta.labels[a].localeCompare(meta.labels[b]));

  const put = (bag, i, v) => {
    const next = { ...rules[bag] };
    if (v <= 0) delete next[i]; else next[i] = v;
    setRules({ ...rules, [bag]: next });
  };

  const active = [
    ...Object.entries(rules.abilities).map(([i, v]) => ({
      bag: "abilities", i: +i, v, label: themes[+i]?.name,
    })),
    ...Object.entries(rules.metrics).map(([i, v]) => ({
      bag: "metrics", i: +i, v, label: meta.labels[+i],
    })),
  ].filter((r) => r.label);

  return (
    <div className={"filters" + (open ? " open" : "")}>
      <div className="f-bar">
        <button className="f-toggle" onClick={() => setOpen((v) => !v)}
          aria-expanded={open}>
          <span className="f-chev" aria-hidden="true">{open ? "−" : "+"}</span>
          Requirements
          {active.length > 0 && <span className="f-count">{active.length}</span>}
        </button>

        {active.length > 0 && (
          <>
            <div className="f-chips">
              {active.map((r) => (
                <button key={`${r.bag}-${r.i}`} className="f-chip"
                  onClick={() => put(r.bag, r.i, 0)}
                  title="Remove this requirement">
                  {r.label} <b>{r.v}+</b>
                  <span className="f-x" aria-hidden="true">×</span>
                </button>
              ))}
            </div>
            <span className="f-hits">
              <b>{matched}</b> of {total} match
            </span>
            <button className="f-clear"
              onClick={() => setRules({ abilities: {}, metrics: {} })}>
              Clear
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="f-body">
          <p className="f-lede">
            Set a floor on any ability and only players clearing it stay in
            the table. Everything is a percentile, so 70 means better than
            seven in ten {meta.positions[position].toLowerCase()}.
          </p>

          <div className="f-grid">
            {themes.map((t, i) => (
              <Slider key={t.name} label={t.name}
                value={rules.abilities[i] ?? 0}
                onChange={(v) => put("abilities", i, v)} />
            ))}
          </div>

          <button className="f-more" onClick={() => setShowMetrics((v) => !v)}
            aria-expanded={showMetrics}>
            {showMetrics ? "Hide" : "Go deeper —"} individual metrics
            {!showMetrics && <span className="f-more-n">{metricIdx.length}</span>}
          </button>

          {showMetrics && (
            <div className="f-grid metrics">
              {metricIdx.map((i) => (
                <Slider key={i} label={meta.labels[i]}
                  hint={meta.invert[i] ? "lower is better" : null}
                  value={rules.metrics[i] ?? 0}
                  onChange={(v) => put("metrics", i, v)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, onChange, hint }) {
  const on = value > 0;
  return (
    <label className={"f-slider" + (on ? " on" : "")}>
      <span className="fs-top">
        <span className="fs-label">
          {label}
          {hint && <em>{hint}</em>}
        </span>
        <span className="fs-value" style={{ color: on ? ramp(value) : "var(--faint)" }}>
          {on ? `${value}+` : "any"}
        </span>
      </span>
      <input type="range" min={0} max={95} step={5}
        value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
