import { ALL, NONE } from "./util";

/**
 * Filters live in the address bar so a view can be sent to someone else,
 * kept in a bookmark, or survive a reload. Only what differs from the
 * defaults is written, which keeps the URL short and readable.
 */

const DEFAULTS = {
  view: "explore",
  league: ALL,
  season: ALL,
  position: "ST",
  role: null,
  roleMin: 0,
  minMinutes: 900,
  ageLo: null,
  ageHi: null,
  team: null,
  nat: null,
  query: "",
};

/** filters + rules -> "?pos=CB&min=1200&ab=0:75,3:60" */
export function toHash(filters, rules, view, profileKey) {
  const p = new URLSearchParams();

  if (view && view !== DEFAULTS.view) p.set("view", view);
  if (profileKey) p.set("player", profileKey);

  if (filters.league === NONE) p.set("lg", "none");
  else if (filters.league !== ALL) p.set("lg", filters.league.join(","));
  if (filters.season !== ALL) p.set("season", filters.season);
  if (filters.position !== DEFAULTS.position) p.set("pos", filters.position);
  if (filters.role != null) p.set("role", String(filters.role));
  if (filters.roleMin) p.set("roleMin", String(filters.roleMin));
  if (filters.minMinutes !== DEFAULTS.minMinutes) p.set("min", String(filters.minMinutes));
  if (filters.ageLo) p.set("ageLo", String(filters.ageLo));
  if (filters.ageHi) p.set("ageHi", String(filters.ageHi));
  if (filters.team) p.set("club", filters.team);
  if (filters.nat) p.set("nat", filters.nat);
  if (filters.query) p.set("q", filters.query);

  const pack = (bag) => Object.entries(bag)
    .map(([k, v]) => `${k}:${v}`).join(",");
  if (Object.keys(rules.abilities).length) p.set("ab", pack(rules.abilities));
  if (Object.keys(rules.metrics).length) p.set("mt", pack(rules.metrics));

  const s = p.toString();
  return s ? "#" + s : "";
}

/** "?pos=CB&min=1200" -> { filters, rules, view, playerKey } */
export function fromHash(hash) {
  const p = new URLSearchParams((hash || "").replace(/^#/, ""));
  if (![...p].length) return null;

  const num = (k) => {
    const v = p.get(k);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const unpack = (key) => {
    const raw = p.get(key);
    if (!raw) return {};
    const out = {};
    for (const pair of raw.split(",")) {
      const [i, v] = pair.split(":");
      const idx = Number(i), val = Number(v);
      if (Number.isFinite(idx) && Number.isFinite(val) && val > 0) out[idx] = val;
    }
    return out;
  };

  return {
    view: p.get("view") || DEFAULTS.view,
    playerKey: p.get("player") || null,
    filters: {
      league: p.get("lg") === "none" ? NONE
        : p.get("lg") ? p.get("lg").split(",") : ALL,
      season: p.get("season") || ALL,
      position: p.get("pos") || DEFAULTS.position,
      role: num("role"),
      roleMin: num("roleMin") || 0,
      minMinutes: num("min") ?? DEFAULTS.minMinutes,
      ageLo: num("ageLo"),
      ageHi: num("ageHi"),
      team: p.get("club") || null,
      nat: p.get("nat") || null,
      query: p.get("q") || "",
    },
    rules: { abilities: unpack("ab"), metrics: unpack("mt") },
  };
}

export { DEFAULTS };
