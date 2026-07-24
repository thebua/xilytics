import { shortSeason } from "../lib/util";

/** Small coloured badge naming the competition a row belongs to. */
export default function LeagueTag({ row, meta, withSeason = false }) {
  const code = meta.codes[row.lid] || meta.leagues[row.lid] || "";
  if (!code) return null;
  const hue = meta.hues[row.lid] || "#8A97A8";
  const text = withSeason
    ? `${code} ${shortSeason(meta.seasons[row.sid])}`
    : code;
  return <span className="league-tag" style={{ "--lg": hue }}>{text}</span>;
}
