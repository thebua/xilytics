import { ALL, NONE } from "./util";

/**
 * Writes the filtered table out as a CSV. Raw values and percentiles sit
 * side by side so the file is useful in a spreadsheet without needing the
 * app to explain it.
 */
export function exportRows({ rows, meta, filters, axes }) {
  const head = ["Player", "Team", "League", "Season", "Position",
                "Age", "Minutes", "Rating"]
    .concat(axes.flatMap((ax) => ax.k === "t"
      ? [`${ax.name} (ability)`,
         ...ax.m.flatMap((i) => [meta.labels[i], `${meta.labels[i]} percentile`])]
      : [meta.labels[ax.i], `${meta.labels[ax.i]} percentile`]))
    .concat(["Position score"]);

  const lines = [head.join(",")];
  for (const r of rows) {
    const cells = [
      r.n, r.t, meta.leagues[r.lid], meta.seasons[r.sid],
      r.dp || filters.position, r.age ?? "", r.m, r.rt,
    ]
      .concat(axes.flatMap((ax) => ax.k === "t"
        ? [r.th?.[ax.i] ?? "",
           ...ax.m.flatMap((i) => [r.v[i] ?? "", r.p[i] ?? ""])]
        : [r.v[ax.i] ?? "", r.p[ax.i] ?? ""]))
      .concat([r.sc]);
    lines.push(cells.map(quote).join(","));
  }

  download(lines.join("\n"), fileName(meta, filters));
}

function quote(cell) {
  return typeof cell === "string" && /[",\n]/.test(cell)
    ? `"${cell.replace(/"/g, '""')}"`
    : cell;
}

function fileName(meta, filters) {
  const league = filters.league === ALL
    ? "all_leagues"
    : filters.league === NONE
      ? "no_leagues"
      : filters.league.map((id) => meta.leagues[id]).join("_");
  const season = filters.season === ALL ? "all_seasons" : filters.season;
  return `${league}_${season}_${filters.position}`
    .replace(/[^a-z0-9]+/gi, "_") + ".csv";
}

function download(text, name) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
