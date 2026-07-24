import "./career.css";

/*
 * The player's move history, newest first. Each row is a transfer the feed
 * gave us: date, the clubs either side (named where we could resolve the
 * id, otherwise left blank), a fee if one was reported, and a loan mark.
 * Clubs outside the leagues we hold often can't be named — that's a gap in
 * the source, not an error, so a blank side just reads as "—".
 */

function money(n) {
  if (!n) return null;
  if (n >= 1e6) return "€" + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M";
  if (n >= 1e3) return "€" + Math.round(n / 1e3) + "K";
  return "€" + n;
}

function year(d) {
  return d ? d.slice(0, 4) : "";
}

export default function Career({ row }) {
  const moves = row.tr || [];
  if (!moves.length) return null;

  return (
    <div className="card career">
      <h2>Career moves</h2>
      <p className="cr-lede">
        Transfer history from the feed, newest first. A blank club is one
        outside the leagues held here, so its name isn't on file.
        {row.trc ? ` ${row.trc} career honour${row.trc === 1 ? "" : "s"} on record.` : ""}
      </p>

      <ol className="cr-list">
        {moves.map((m, i) => {
          const fee = money(m.amt);
          const tag = m.kind === "loan" ? "loan"
            : m.kind === "free" ? "free"
            : m.kind === "endloan" ? "loan ended"
            : null;
          return (
            <li key={i} className="cr-row">
              <span className="cr-year">{year(m.d)}</span>
              <span className="cr-line">
                <span className="cr-clubs">
                  <span className="cr-from">{m.from || "—"}</span>
                  <span className="cr-arrow">→</span>
                  <span className="cr-to">{m.to || "—"}</span>
                </span>
                <span className="cr-meta">
                  {tag && <span className={"cr-tag cr-" + m.kind}>{tag}</span>}
                  {fee && <span className="cr-fee">{fee}</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
