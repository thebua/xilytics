import { useState } from "react";
import { ramp, fmt, confidenceOf, scoreBand } from "../lib/util";
import "./score.css";

/**
 * The headline number, opened up: six themes, what sits inside each one,
 * and how much each counts. Saying it out loud is the difference between
 * a statistic and a claim.
 */
export default function ScoreBreakdown({ row, meta, poolSize }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const themes = meta.themes[row.pos] || [];
  const posName = meta.positions[row.pos].toLowerCase().replace(/s$/, "");
  const metricCount = new Set(themes.flatMap((t) => t.idx)).size;
  const conf = confidenceOf(row);
  const band = scoreBand(row);

  return (
    <div className={"score-box" + (open ? " open" : "")}>
      <button className="score-head" onClick={() => setOpen((v) => !v)}
        aria-expanded={open}>
        <span className={"score-val" + (row.sc == null ? " none" : "")}
          style={row.sc == null ? undefined : { color: ramp(row.sc) }}>
          {row.sc == null ? "—" : Math.round(row.sc)}
        </span>
        <span className="score-meta">
          <b>Position score</b>
          <span>
            {row.sc == null
              ? "not enough data to rank this player"
              : `rank among ${row.pr ?? poolSize} · ${themes.length} abilities · ${metricCount} metrics`}
            {row.cov < 100 && ` · ${row.cov}% covered`}
          </span>
        </span>
        {conf && conf.level !== "high" && (
          <span className={"score-conf " + conf.level}>
            {conf.level === "low" ? "low confidence" : "medium confidence"}
          </span>
        )}
        <span className="score-chev" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="score-body">
          <div className="score-pool">
            Compared with <b>{poolSize}</b> {posName}s in {meta.leagues[row.lid]}{" "}
            {meta.seasons[row.sid]}
            {poolSize < 25 && (
              <span className="pool-warn"> — a small pool, so a place or two
                moves the ranking a long way</span>
            )}
          </div>

          {(band || conf?.positionNote) && (
            <div className="score-caveat">
              {band && (
                <p>
                  With {conf.pool} players behind it, one place is worth about{" "}
                  <b>{band.step} points</b>. Read the figure as{" "}
                  <b>{band.lo}–{band.hi}</b> rather than an exact{" "}
                  {Math.round(row.sc)}.
                </p>
              )}
              {conf?.positionNote && <p>{conf.positionNote}</p>}
            </div>
          )}

          {/* the weight each ability actually carried, over those present */}
          {(() => null)()}
          {themes.map((t, k) => {
            const v = row.th[k];
            const live = themes.reduce(
              (sum, x, j) => sum + (row.th[j] == null ? 0 : x.weight), 0);
            const share = v == null || !live ? 0 : (t.weight / live) * 100;
            const isOpen = detail === k;
            return (
              <div className="theme" key={t.name}>
                <button className="theme-row" onClick={() => setDetail(isOpen ? null : k)}
                  aria-expanded={isOpen}>
                  <span className="th-name">
                    {t.name}
                    {t.note && <span className="th-flag" title={t.note}>ⓘ</span>}
                  </span>
                  <span className="th-weight">
                    {t.weight === 1 ? "" : `×${t.weight}`}
                  </span>
                  <span className="meter th-bar">
                    <i style={{
                      width: v == null ? 0 : `${Math.max(v, 2)}%`,
                      background: v == null ? "var(--faint)" : ramp(v),
                    }} />
                  </span>
                  <span className="th-val" style={{ color: v == null ? "var(--faint)" : ramp(v) }}
                    title={v == null && t.note ? t.note : undefined}>
                    {v == null ? "—" : Math.round(v)}
                  </span>
                  <span className="th-share-inline">
                    {share ? `${share.toFixed(0)}%` : ""}
                  </span>
                </button>

                {isOpen && (
                  <div className="theme-detail">
                    {t.note && <p className="th-note">{t.note}</p>}
                    {t.idx.map((j) => {
                      const pct = row.p[j];
                      return (
                        <div className="sub-row" key={j}>
                          <span className="sub-label">
                            {meta.labels[j]}
                            {meta.invert[j] && <span className="down"> ↓</span>}
                          </span>
                          <span className="sub-raw">{fmt(row.v[j])}</span>
                          <span className="sub-pct"
                            style={{ color: pct == null ? "var(--faint)" : ramp(pct) }}>
                            {pct == null ? "—" : Math.round(pct)}
                          </span>
                        </div>
                      );
                    })}
                    <p className="th-share">
                      Carried {share.toFixed(0)}% of the score.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          <p className="score-note">
            Each ability averages the percentiles of the metrics inside it.
            The abilities are then combined using the weights shown, and
            that figure is ranked against everyone else in the pool — so
            the score reads on the same 0–100 scale as everything beside
            it. A player on 90 sits ahead of nine in ten {posName}s here.
            <br /><br />
            The weights are our reading of what each position is for, not
            something the data proved. Abilities marked{" "}
            <span className="th-flag">ⓘ</span> carry a caveat worth opening,
            and one with fewer than two thirds of its metrics is left blank
            rather than guessed at.
            <br /><br />
            Two players on 90 in different leagues are each near the top of
            their own pool. That is not a claim that they are equally good.
          </p>
        </div>
      )}
    </div>
  );
}
