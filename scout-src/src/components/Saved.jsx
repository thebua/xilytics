import { useState } from "react";
import Avatar from "./Avatar";
import { ramp, band, keyOf } from "../lib/util";
import "./saved.css";

/*
 * What an account is actually for.
 *
 * Four lists, each answering a different question a returning reader has:
 * who was I interested in, who am I assembling, who did I just look at,
 * and what was I searching for.
 *
 * Empty states matter more here than anywhere else in the app — this is
 * the screen a new member sees first, and four blank panels would make an
 * account look pointless. Each one says what would fill it and how.
 */

const TABS = [
  { id: "favourites", label: "Favourites", icon: "★" },
  { id: "squad",      label: "My squad",   icon: "▦" },
  { id: "history",    label: "Recently viewed", icon: "◷" },
  { id: "searches",   label: "Saved searches",  icon: "⌕" },
];

export default function Saved({ tab = "favourites", data, meta, saved, onOpen, onRemove, onTab }) {
  const [active, setActive] = useState(tab);
  const go = (t) => { setActive(t); onTab?.(t); };

  const rows = saved?.[active] ?? [];

  return (
    <div className="saved">
      <header className="saved-head">
        <h1>Your shelf</h1>
        <p>
          Players you kept, a squad in progress, and what you were looking at
          last time. Nothing here leaves your account.
        </p>
      </header>

      <div className="saved-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id}
            className={active === t.id ? "on" : ""}
            onClick={() => go(t.id)}>
            <span className="saved-ico">{t.icon}</span>
            {t.label}
            {saved?.[t.id]?.length ? (
              <span className="saved-n">{saved[t.id].length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="saved-body">
        {rows.length === 0 ? <Empty which={active} /> : (
          active === "searches"
            ? <SearchList items={rows} onOpen={onOpen} onRemove={onRemove} />
            : <PlayerList rows={rows} meta={meta} onOpen={onOpen} onRemove={onRemove}
                showRemove={active !== "history"} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- lists */

function PlayerList({ rows, meta, onOpen, onRemove, showRemove }) {
  return (
    <div className="saved-grid">
      {rows.map((r) => (
        <div key={keyOf(r)} className="saved-card">
          <button className="saved-main" onClick={() => onOpen?.(r)}>
            <Avatar row={r} base={meta.imgbase} size={40} />
            <span className="saved-id">
              <span className="saved-n-main">
                {r.flag && <img className="saved-flag" src={r.flag} alt="" loading="lazy" />}
                {r.n}
              </span>
              <span className="saved-meta">
                {r.t} · {r.dp || meta.positions?.[r.pos]} · {r.age ?? "?"}
              </span>
            </span>
            <span className="saved-score">
              <b style={{ color: ramp(r.sc) }}>{r.sc == null ? "—" : Math.round(r.sc)}</b>
              <i>{r.sc == null ? "" : band(r.sc)}</i>
            </span>
          </button>
          {showRemove && (
            <button className="saved-x" aria-label={`Remove ${r.n}`}
              onClick={() => onRemove?.(r)}>×</button>
          )}
        </div>
      ))}
    </div>
  );
}

function SearchList({ items, onOpen, onRemove }) {
  return (
    <div className="saved-searches">
      {items.map((s) => (
        <div key={s.id} className="saved-search">
          <button className="saved-search-main" onClick={() => onOpen?.(s)}>
            <b>{s.name}</b>
            <span>{s.summary}</span>
          </button>
          <button className="saved-x" aria-label={`Remove ${s.name}`}
            onClick={() => onRemove?.(s)}>×</button>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- empties */

/*
 * An empty panel that only says "nothing here" wastes the one moment a
 * new member is paying attention. Each of these says what the list is for
 * and exactly how to put the first thing in it.
 */
const EMPTY = {
  favourites: {
    icon: "★",
    title: "No favourites yet",
    body: "Star a player from any table or profile and they land here, so a "
        + "name you found once is not one you have to find again.",
  },
  squad: {
    icon: "▦",
    title: "No squad yet",
    body: "Add players to a squad while you browse and see them together — "
        + "the shape of a side rather than eleven separate searches.",
  },
  history: {
    icon: "◷",
    title: "Nothing viewed yet",
    body: "Profiles you open are listed here for a while, which is usually "
        + "enough to find your way back to the one you meant to keep.",
  },
  searches: {
    icon: "⌕",
    title: "No saved searches",
    body: "Set up a search worth repeating — under 23, over 80, left foot — "
        + "and save it rather than building it again next week.",
  },
};

function Empty({ which }) {
  const e = EMPTY[which] ?? EMPTY.favourites;
  return (
    <div className="saved-empty">
      <span className="saved-empty-ico">{e.icon}</span>
      <b>{e.title}</b>
      <p>{e.body}</p>
    </div>
  );
}
