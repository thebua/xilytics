import { useMemo } from "react";
import Avatar from "./Avatar";
import Radar from "./Radar";
import Verdict from "./Verdict";
import ScoreBreakdown from "./ScoreBreakdown";
import RoleFit from "./RoleFit";
import Rankings from "./Rankings";
import Transfer from "./Transfer";
import Career from "./Career";
import { ramp, similarity, keyOf } from "../lib/util";
import "./profile.css";

export default function Profile({ row, data, onOpen, onCompare,
  isFavourite, onFavourite, inSquad, onSquad }) {
  const { meta, rows } = data;

  const pool = useMemo(
    () => rows.filter((x) => x.lid === row.lid && x.sid === row.sid && x.pos === row.pos),
    [rows, row]
  );

  const similar = useMemo(() => {
    return pool
      .filter((x) => keyOf(x) !== keyOf(row))
      .map((x) => ({ row: x, match: similarity(row, x) }))
      .filter((s) => s.match != null)
      .sort((a, b) => b.match - a.match)
      .slice(0, 6);
  }, [pool, row]);

  const hue = meta.hues[row.lid] || "var(--dim)";

  /* every row that is the same player (same id) — his other seasons, and
     any mid-season move that put him in two leagues in one year. Sorted
     newest first so the latest campaign leads. */
  const careerRows = useMemo(() => {
    return rows
      .filter((x) => x.id === row.id)
      .sort((a, b) => b.sid - a.sid || (b.sc ?? -1) - (a.sc ?? -1));
  }, [rows, row.id]);

  return (
    <div className="profile">
      <header className="hero">
        <Avatar row={row} base={meta.imgbase} size={74} />
        <div className="hero-id">
          <h1>
            {row.flag && (
              <img className="hero-flag" src={row.flag} alt={row.nat || ""}
                title={row.nat || ""} />
            )}
            {row.n}
          </h1>
          <p className="hero-sub">
            {row.t} · <span style={{ color: hue }}>
              {meta.leagues[row.lid]} {meta.seasons[row.sid]}
            </span>
          </p>
          <div className="hero-tags">
            <span className="tag hot">{row.dp || meta.positions[row.pos]}</span>
            {row.rl && row.rk !== "none" && (
              <span className="tag style" title="Playing style, from the ability profile">
                {row.rl}
              </span>
            )}
            {row.age && <span className="tag">{row.age} yrs</span>}
            {row.nat && <span className="tag">{row.nat}</span>}
            {row.foot && (
              <span className="tag" title="Preferred foot">
                {row.foot === "right" ? "Right foot"
                  : row.foot === "left" ? "Left foot"
                  : row.foot === "both" ? "Both feet" : row.foot}
              </span>
            )}
            {row.ht && <span className="tag">{row.ht} cm</span>}
            {row.wt && <span className="tag">{row.wt} kg</span>}
          </div>
        </div>

        <div className="hero-kpis">
          <Kpi label="Apps" value={row.ap} />
          <Kpi label="Minutes" value={row.m.toLocaleString()} />
          <Kpi label="Goals" value={row.g} />
          <Kpi label="Assists" value={row.a} />
          <Kpi label="Rating" value={row.rt ? row.rt.toFixed(2) : "—"} />
          {row.sc != null && row.sc2 != null && row.sc2 !== Math.round(row.sc) && (
            <Kpi label="Adjusted" value={row.sc2}
              hint="Score shifted for how strong this league is, so it compares across leagues" />
          )}
        </div>

        {/*
          Keeping a player is a decision made while reading them, so the
          controls sit with the profile rather than in a table row. Both
          are quiet until used and unmistakable after.
        */}
        {(onFavourite || onSquad) && (
          <div className="hero-keep">
            {onFavourite && (
              <button className={"keep-btn" + (isFavourite ? " on" : "")}
                onClick={() => onFavourite(row)}
                aria-pressed={!!isFavourite}>
                <span aria-hidden="true">{isFavourite ? "★" : "☆"}</span>
                {isFavourite ? "Saved" : "Save player"}
              </button>
            )}
            {onSquad && (
              <button className={"keep-btn" + (inSquad ? " on" : "")}
                onClick={() => onSquad(row)}
                aria-pressed={!!inSquad}>
                <span aria-hidden="true">▦</span>
                {inSquad ? "In squad" : "Add to squad"}
              </button>
            )}
          </div>
        )}
      </header>

      {careerRows.length > 1 && (
        <div className="season-switch">
          <span className="ss-label">Also on file</span>
          <div className="ss-tabs">
            {careerRows.map((o) => {
              const active = keyOf(o) === keyOf(row);
              return (
                <button key={keyOf(o)}
                  className={"ss-tab" + (active ? " active" : "")}
                  onClick={() => !active && onOpen(o)}
                  title={`${meta.leagues[o.lid]} ${meta.seasons[o.sid]}`}>
                  <span className="ss-season">{meta.seasons[o.sid]}</span>
                  <span className="ss-league" style={{ color: meta.hues[o.lid] || "var(--faint)" }}>
                    {meta.codes[o.lid] || meta.leagues[o.lid]}
                  </span>
                  {o.sc != null && <span className="ss-score">{Math.round(o.sc)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Verdict row={row} meta={meta} poolSize={pool.length} />

      <div className="profile-split">
        <div className="profile-side">
          <ScoreBreakdown row={row} meta={meta} poolSize={pool.length} />

          <RoleFit row={row} meta={meta} />

          <div className="card">
            <h2>Ability profile</h2>
            <Radar players={[row]} themes={meta.themes[row.pos]} meta={meta}
              size={350} radius={100} />
          </div>

          <div className="card">
            <h2>Closest profiles</h2>
            {similar.length ? (
              <div className="sim-list">
                {similar.map(({ row: o, match }) => (
                  <button key={keyOf(o)} className="sim" onClick={() => onOpen(o)}>
                    <Avatar row={o} base={meta.imgbase} size={26} />
                    <span className="sim-id">
                      <span className="sim-n">{o.n}</span>
                      <span className="sim-t">{o.t}</span>
                    </span>
                    <span className="sim-pair">
                      <b>{match.toFixed(0)}%</b>
                      <em style={{ color: o.sc == null ? "var(--faint)" : ramp(o.sc) }}>
                        {o.sc == null ? "—" : Math.round(o.sc)}</em>
                    </span>
                  </button>
                ))}
                <p className="sim-key">
                  Left figure is style match, right is that player's own
                  position score. A close match is not the same as an equal.
                </p>
              </div>
            ) : (
              <p className="blank">Pool too small for comparisons.</p>
            )}
          </div>

          <button className="pill-btn wide" onClick={() => onCompare(row)}>
            Open in Compare
          </button>
        </div>

        <Rankings row={row} data={data} />
      </div>

      <Transfer row={row} data={data} />

      <Career row={row} />
    </div>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <div className="kpi" title={hint || undefined}>
      <div className="kpi-v">{value}</div>
      <div className="kpi-l">{label}</div>
    </div>
  );
}
