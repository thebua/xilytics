import { useMemo, useState } from "react";
import Avatar from "./Avatar";
import LeagueTag from "./LeagueTag";
import Radar from "./Radar";
import {
  ALL, MAX_PICK, RADAR_MAX, SERIES, fmt, keyOf, lastName, placeOf, confidenceOf,
} from "../lib/util";
import "./compare.css";

export default function Compare({ data, picked, setPicked, position, onOpen }) {
  const { meta, rows } = data;
  const [query, setQuery] = useState("");

  const pool = useMemo(
    () => rows.filter((r) => r.pos === position),
    [rows, position]
  );

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return pool
      .filter((r) => r.n.toLowerCase().includes(q) || r.t.toLowerCase().includes(q))
      .filter((r) => !picked.some((p) => keyOf(p) === keyOf(r)))
      .sort((a, b) => (b.sc ?? -1) - (a.sc ?? -1))
      .slice(0, 8);
  }, [pool, picked, query]);

  const themes = meta.themes[position];
  const axes = meta.columns[position];
  const multi = picked.length > 1;
  const tight = picked.length > 3;

  /* Row-by-row places, plus how many firsts each player takes. */
  const table = useMemo(() => {
    const wins = picked.map(() => 0);
    const body = axes.map((ax, ci) => {
      /* a theme column ranks on the ability score; a metric column on its
         percentile, with the raw figure shown underneath */
      const isTheme = ax.k === "t";
      const valOf = (r) => (isTheme ? r.th?.[ax.i] : r.p[ax.i]);
      const rawOf = (r) => (isTheme ? r.th?.[ax.i] : r.v[ax.i]);

      const shownPct = picked.map((r) => {
        const v = valOf(r);
        return v == null ? null : Math.round(v);
      });
      const cells = picked.map((r, k) => {
        const v = valOf(r), raw = rawOf(r);
        if (v == null || raw == null) return null;
        const place = multi ? placeOf(shownPct[k], shownPct) : null;
        if (place === 1) wins[k]++;
        return { raw, pct: v, place, isTheme };
      });
      return { ci, ax, cells };
    });
    return { body, wins };
  }, [picked, axes, multi]);

  const add = (row) => {
    setPicked(picked.length >= MAX_PICK
      ? [...picked.slice(1), row]
      : [...picked, row]);
    setQuery("");
  };

  const drop = (row) => setPicked(picked.filter((p) => keyOf(p) !== keyOf(row)));

  const spread = useMemo(() => {
    const L = new Set(picked.map((r) => r.lid));
    const S = new Set(picked.map((r) => meta.seasons[r.sid]));
    return { any: L.size > 1 || S.size > 1, season: S.size > 1 };
  }, [picked, meta]);

  const bestWins = Math.max(0, ...table.wins);

  return (
    <>
      <div className="bar">
        <div className="bar-row">
          <div className="fld search-fld">
            <span className="fld-label">
              Add {meta.positions[position].toLowerCase()}
            </span>
            <input type="text" className="txt" autoComplete="off"
              placeholder="Start typing a name"
              value={query} onChange={(e) => setQuery(e.target.value)} />
            {hits.length > 0 && (
              <div className="hits">
                {hits.map((r) => (
                  <button key={keyOf(r)} onClick={() => add(r)}>
                    <Avatar row={r} base={meta.imgbase} size={24} />
                    <span className="hit-n">{r.n}</span>
                    <span className="hit-t">
                      {r.t}<br />
                      <LeagueTag row={r} meta={meta} withSeason />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {picked.length > 0 && (
            <button className="pill-btn danger" onClick={() => setPicked([])}>
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="slots">
        {picked.length === 0 && (
          <div className="slot void">Pick up to {MAX_PICK} players</div>
        )}
        {picked.map((r, k) => (
          <div key={keyOf(r)} className="slot">
            <span className="slot-stripe" style={{ background: SERIES[k] }} />
            <button className="slot-main" onClick={() => onOpen(r)}>
              <Avatar row={r} base={meta.imgbase} size={44} />
              <span className="slot-id">
                <span className="slot-n">
                  {r.flag && (
                    <img className="slot-flag" src={r.flag} alt={r.nat || ""}
                      title={r.nat || ""} loading="lazy" />
                  )}
                  {r.n}
                </span>
                <span className="slot-club">{r.t}</span>
                <span className="slot-m">
                  {spread.any && <LeagueTag row={r} meta={meta} withSeason={spread.season} />}
                  {r.dp || meta.positions[r.pos]} · {r.age ?? "?"} · {r.m.toLocaleString()}′
                </span>
              </span>
              <span className="slot-score">
                <span className="slot-num" style={{ color: SERIES[k] }}>
                  {r.sc == null ? "—" : Math.round(r.sc)}
                </span>
                <span className="slot-lab">
                  score
                  {(() => {
                    const cf = confidenceOf(r);
                    if (!cf || cf.level === "high") return null;
                    return (
                      <span className={"slot-conf " + cf.level}
                        title={`Ranked against ${cf.pool} players. ${cf.poolNote}.`
                          + (cf.positionNote ? " " + cf.positionNote : "")}>
                        {cf.level === "low" ? " ·  low conf" : " ·  med conf"}
                      </span>
                    );
                  })()}
                </span>
              </span>
            </button>
            <button className="slot-x" aria-label={`Remove ${r.n}`}
              onClick={() => drop(r)}>×</button>
          </div>
        ))}
      </div>

      <div className={"duo" + (tight ? " wide" : "")}>
        <div className="card">
          <h2>Abilities</h2>
          {picked.length ? (
            <>
              <Radar players={picked.slice(0, RADAR_MAX)} themes={themes} meta={meta}
                size={420} radius={118} />
              <div className="ability-list">
                {themes.map((t, i) => (
                  <div className="ab-row" key={t.name}>
                    <span className="ab-name">
                      {t.name}
                      {t.weight !== 1 && <em>×{t.weight}</em>}
                    </span>
                    <span className="ab-vals">
                      {picked.slice(0, RADAR_MAX).map((r, k) => (
                        <span key={k} className="ab-v" style={{ color: SERIES[k] }}>
                          {r.th[i] == null ? "—" : Math.round(r.th[i])}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              {picked.length > RADAR_MAX && (
                <p className="radar-note">
                  The radar draws the first {RADAR_MAX} — more shapes stop
                  being readable. Every pick is in the table.
                </p>
              )}
            </>
          ) : (
            <div className="blank">
              <b>Empty radar</b>
              Search above, or tick players in Explore and send them here.
            </div>
          )}
        </div>

        <div className="card">
          <h2>Metric by metric</h2>
          {picked.length ? (
            <>
              {/* wrapped so a narrow screen can scroll it sideways rather
                  than squeezing every column past legibility */}
              <div className="mini-wrap">
              <table className={"mini" + (tight ? " tight" : "")}>
                <colgroup>
                  <col style={{ width: tight ? "22%" : "31%" }} />
                  {picked.map((_, k) => (
                    <col key={k} style={{ width: `${(tight ? 78 : 69) / picked.length}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="mlab">Metric</th>
                    {picked.map((r, k) => (
                      <th key={keyOf(r)} className="mcol">
                        <span className="hname" style={{ color: SERIES[k] }} title={r.n}>
                          {lastName(r.n)}
                        </span>
                        {multi && (
                          <span className="hwins" style={{
                            color: table.wins[k] === bestWins && bestWins > 0
                              ? "var(--gold)" : "var(--faint)",
                          }}>
                            1st in {table.wins[k]} of {axes.length}
                          </span>
                        )}
                        <span className="hkey">place · figure · rank</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.body.map(({ ci, ax, cells }) => {
                    const isTheme = ax.k === "t";
                    const rowLabel = isTheme ? ax.name : meta.labels[ax.i];
                    const rowUnit = isTheme ? "ability" : meta.units[ax.i];
                    const rowInv = !isTheme && meta.invert[ax.i];
                    const rowHelp = isTheme
                      ? `${ax.name} — ability score, out of 100`
                      : (meta.help[ax.i] || undefined);
                    return (
                    <tr key={ci}>
                      <td className={"mlab" + (isTheme ? " theme" : "")} title={rowHelp}>
                        <span className="ml-name">{rowLabel}</span>
                        <span className="ml-unit">
                          {rowUnit}
                          {rowInv && <span className="down"> · lower better</span>}
                        </span>
                      </td>
                      {cells.map((c, k) => (
                        <td key={k} className={"mcol" + (c?.place === 1 ? " win" : "")}>
                          {c ? (
                            <div className={"fig" + (c.place === 1 ? " top" : multi ? " behind" : "")}>
                              <span className={"rank r" + (c.place && c.place <= 3 ? c.place : "x")}>
                                {c.place ?? "·"}
                              </span>
                              <span className="raw2">
                                {c.isTheme ? Math.round(c.raw) : fmt(c.raw)}
                              </span>
                              <span className="pct2">{Math.round(c.pct)}</span>
                            </div>
                          ) : (
                            <div className="fig"><span className="none">—</span></div>
                          )}
                        </td>
                      ))}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              <details className="how-to">
                <summary>How to read this</summary>
                <p>
                  Every cell holds three numbers. The <b>medal</b> is the place
                  among the players shown here — equal figures share it. The{" "}
                  <b>middle figure</b> is the metric itself, in the unit named
                  beside the row. The <b>small number</b> is where that figure
                  ranks out of 100 against everyone in the same position, league
                  and season. Leagues are not adjusted for strength, so the
                  rankings compare but the standards behind them may not.
                </p>
              </details>
            </>
          ) : (
            <div className="blank">
              <b>Nothing to show</b>
              Values and rankings land here once you pick someone.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
