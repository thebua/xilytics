import { useEffect, useRef, useState } from "react";
import { ALL, NONE, byStanding } from "../lib/util";
import "./leaguePicker.css";

/**
 * League chooser. A single league is the common case, so it stays one
 * click away; picking several is a checkbox each, which reads better than
 * a multi-select the moment there are more than three options.
 */
export default function LeaguePicker({ meta, value, onChange, counts }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    /*
     * pointerdown rather than mousedown.
     *
     * A touch fires pointerdown, then touchend, then a synthesised
     * mousedown some 300ms later — by which time the menu has opened and
     * the phantom event lands outside it and closes it again. On a phone
     * the list appeared to flicker and refuse to stay open. pointerdown is
     * the one event both kinds of input agree on.
     */
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  /*
   * On a phone the menu covers the screen from the bottom, and the page
   * behind it must not scroll — otherwise a drag meant for the league list
   * takes the page with it and the sheet slides away from under the finger.
   */
  useEffect(() => {
    if (!open) return;
    const narrow = window.matchMedia("(max-width: 700px)").matches;
    if (!narrow) return;
    const held = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = held; };
  }, [open]);

  const ids = byStanding([...new Set(meta.pairs.map((p) => p[0]))], meta);
  const isNone = value === NONE;
  const picked = value === ALL || isNone ? [] : value;
  const isAll = value === ALL || (!isNone && picked.length === 0);

  const label = isNone
    ? "No leagues"
    : isAll
      ? "All leagues"
      : picked.length === 1
        ? meta.leagues[picked[0]]
        : `${picked.length} leagues`;

  const toggle = (id) => {
    /* From "all", a click removes just that league. From "none", a click
       adds just that one. Otherwise toggle it in or out. */
    let next;
    if (isAll) {
      next = ids.filter((x) => x !== id);
    } else if (isNone) {
      next = [id];
    } else {
      next = picked.includes(id)
        ? picked.filter((x) => x !== id)
        : [...picked, id];
    }
    if (next.length === 0) { onChange(NONE); return; }
    onChange(next.length === ids.length ? ALL : next);
  };

  return (
    <div className="lp" ref={box}>
      <button className={"lp-button" + (open ? " open" : "")}
        onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="lp-label">{label}</span>
        {!isAll && (
          <span className="lp-dots">
            {picked.map((id) => (
              <i key={id} style={{ background: meta.hues[id] || "var(--dim)" }} />
            ))}
          </span>
        )}
        <span className="lp-chev" aria-hidden="true">▾</span>
      </button>

      {open && (
        <>
          {/*
            A backdrop, for the phone layout only. It dims what is behind
            the sheet and gives a tap target for closing it that is not a
            tiny × in a corner — CSS hides it entirely on a wide screen,
            where the menu is a dropdown and needs no such thing.
          */}
          <div className="lp-veil" onClick={() => setOpen(false)} />

          <div className="lp-menu" role="group" aria-label="Leagues">
            <div className="lp-head">
              <b>Leagues</b>
              <button className="lp-done" onClick={() => setOpen(false)}>Done</button>
            </div>

            <div className="lp-actions">
            <button className={"lp-act" + (isAll ? " on" : "")}
              onClick={() => onChange(ALL)}>
              Select all
            </button>
            <button className={"lp-act" + (isNone ? " on" : "")}
              onClick={() => onChange(NONE)}>
              Clear all
            </button>
            <span className="lp-actn">
              {isNone ? "0" : isAll
                ? Object.values(counts || {}).reduce((s, n) => s + n, 0)
                : picked.reduce((s, id) => s + (counts?.[id] || 0), 0)} shown
            </span>
          </div>

          <div className="lp-sep" />

          {ids.map((id, i) => {
            const on = isAll || picked.includes(id);
            const tier = meta.tiers?.[id];
            const newTier = tier != null && tier !== meta.tiers?.[ids[i - 1]];
            return (
              <div key={id}>
              {newTier && meta.tierNames?.[tier] && (
                <div className="lp-tier">{meta.tierNames[tier]}</div>
              )}
              <button className={"lp-row" + (on ? " on" : "")}
                onClick={() => toggle(id)}>
                <span className="lp-check" aria-hidden="true">{on ? "✓" : ""}</span>
                {meta.flags?.[id] && (
                  <img className="lp-flag" src={meta.flags[id]} alt="" loading="lazy" />
                )}
                <span className="lp-code" style={{
                  "--lg": meta.hues[id] || "var(--dim)",
                }}>
                  {meta.codes[id] || "—"}
                </span>
                <span className="lp-name">{meta.leagues[id]}</span>
                  <span className="lp-n">{counts?.[id] ?? 0}</span>
                </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
