import { useState } from "react";
import { ramp } from "../lib/util";
import "./roles.css";

/**
 * Two numbers per role, and they are not the same question.
 *
 *   Fit      how closely this player's shape matches what the role asks for
 *   Quality  how good he is in the areas the role leans on
 *
 * A defender can be a textbook stylistic match for a ball-playing role and
 * still not be good enough to do it. Showing one number would hide that.
 */
export default function RoleFit({ row, meta }) {
  const [open, setOpen] = useState(null);

  const roles = meta.roles[row.pos] || [];
  const themes = meta.themes[row.pos] || [];
  if (!roles.length || !row.rf) return null;

  const ranked = roles
    .map((r, i) => ({ ...r, i, fit: row.rf[i], quality: row.rq[i] }))
    .filter((r) => r.fit != null)
    .sort((a, b) => b.fit - a.fit);

  if (!ranked.length) return null;

  const kindWord = {
    clear: "Clear match",
    leaning: "Leans towards",
    versatile: "Fits either",
    profile: "Right profile, below level",
    none: "No strong match",
  }[row.rk] || "";

  return (
    <div className="card roles">
      <h2>Playing style</h2>

      <div className="role-verdict">
        <span className="rv-kind">{kindWord}</span>
        <span className="rv-name">{row.rl}</span>
      </div>

      <div className="role-list">
        {ranked.map((r) => {
          const isOpen = open === r.i;
          return (
            <div className="role" key={r.name}>
              <button className="role-row" onClick={() => setOpen(isOpen ? null : r.i)}
                aria-expanded={isOpen}>
                <span className="ro-name">
                  {r.name}
                  {r.note && <span className="ro-flag" title={r.note}>ⓘ</span>}
                </span>
                <span className="meter ro-bar">
                  <i style={{ width: `${Math.max(r.fit, 2)}%`, background: ramp(r.fit) }} />
                </span>
                <span className="ro-fit" style={{ color: ramp(r.fit) }}>
                  {Math.round(r.fit)}
                </span>
                <span className="ro-quality" style={{ color: ramp(r.quality) }}>
                  {Math.round(r.quality)}
                </span>
              </button>

              {isOpen && (
                <div className="role-detail">
                  <p className="ro-blurb">{r.blurb}</p>
                  {r.note && <p className="ro-note">{r.note}</p>}
                  <div className="ro-mix">
                    {themes.map((t, k) => {
                      const share = r.mix[k];
                      if (!share) return null;
                      const v = row.th[k];
                      return (
                        <div className="mix-row" key={t.name}>
                          <span className="mx-name">{t.name}</span>
                          <span className="mx-share">{share.toFixed(0)}%</span>
                          <span className="mx-val"
                            style={{ color: v == null ? "var(--faint)" : ramp(v) }}>
                            {v == null ? "—" : Math.round(v)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="role-key">
        <span><b>Fit</b> is how closely this player's shape matches the role.</span>
        <span><b>Level</b> is how good he is in the areas that role leans on.</span>
        <span className="rk-warn">
          A high fit with a low level means the style is right and the
          standard is not.
        </span>
      </div>
    </div>
  );
}
