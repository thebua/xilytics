import { initials, imageUrl } from "../lib/util";

/** Player photo with a lettered fallback when the CDN has nothing. */
export default function Avatar({ row, base, size = 28 }) {
  const url = imageUrl(row, base);
  const style = { width: size, height: size };
  if (!url) {
    return (
      <span className="avatar-fallback" style={{ ...style, fontSize: size * 0.34 }}>
        {initials(row.n)}
      </span>
    );
  }
  return (
    <img
      className="avatar"
      src={url}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      style={style}
      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
    />
  );
}
