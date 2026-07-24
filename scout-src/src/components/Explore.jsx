import { Fragment, useEffect, useMemo, useState } from "react";
import Avatar from "./Avatar";
import Filters from "./Filters";
import LeaguePicker from "./LeaguePicker";
import LeagueTag from "./LeagueTag";
import { ALL, NONE, MAX_PICK, ramp, band, fmt, keyOf, inLeagues, confidenceOf, scoreBand } from "../lib/util";
import { exportRows } from "../lib/exportCsv";
import { pageList } from "../lib/pagination";
import "./explore.css";

export default function Explore({
  data, filters, setFilters, rules, setRules, marked, setMarked, onOpen,
  panelOpen, setPanelOpen,
}) {
  const { meta, rows } = data;
  const [sort, setSort] = useState({ col: "sc", dir: -1 });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [mode, setMode] = useState("rank");   // "rank" or "figure"
  const [openCell, setOpenCell] = useState(null);  // `${rowKey}:${colIdx}` of an open theme strip

  /*
   * On a phone the filters open closed.
   *
   * Everything below the position row — league, season, minutes, age, club,
   * nationality, search — stacks to most of a screen, and a visitor arriving
   * for the first time met a form rather than a table. They had to scroll
   * past nine controls to reach the thing the page is for.
   *
   * So on a narrow screen the controls sit behind a summary line that says
   * what they are currently set to, and the table starts where the position
   * buttons end. Nothing changes on a wide screen, where there was room for
   * both all along.
   */
  const [filtersOpen, setFiltersOpen] = useState(false);

  /*
   * Sorting, on a phone.
   *
   * Every column is sortable by its header, and the header is the first
   * thing a narrow screen gives up — the table becomes a list of cards and
   * thead goes with it. Which left the ranking sorted by score and no way
   * to change it: no age, no minutes, no ability, in a tool whose whole
   * purpose is finding the player who is best at one particular thing.
   *
   * So the same choices arrive as a sheet, opened from a bar above the
   * list. Desktop keeps its headers and never sees this.
   */
  const [sortOpen, setSortOpen] = useState(false);

  /* the position sheet, opened from the quick bar on a phone */
  const [posOpen, setPosOpen] = useState(false);

  /*
   * Which layout to build, decided in script rather than in CSS.
   *
   * The card the phone shows is not the table rearranged — the photograph
   * carries a flag, the score sits beside the name with its band beneath,
   * three abilities share a row of bars, and a strip of figures closes it.
   * None of that can be reached by restyling table cells, and pretending
   * otherwise produces markup that fights its own stylesheet.
   *
   * So the two are built separately from the same rows. matchMedia rather
   * than a resize listener: it fires when the answer changes rather than
   * on every pixel of a drag.
   */
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined"
      && window.matchMedia("(max-width: 760px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /*
   * A sheet that covers the screen must stop the page behind it scrolling,
   * or a drag meant for the list of options takes the ranking with it and
   * the sheet slides out from under the finger.
   */
  useEffect(() => {
    if (!sortOpen && !posOpen) return;
    const held = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e) => {
      if (e.key !== "Escape") return;
      setSortOpen(false);
      setPosOpen(false);
    };
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = held;
      document.removeEventListener("keydown", esc);
    };
  }, [sortOpen, posOpen]);

  const seasonNames = useMemo(() => {
    const ids = filters.league === ALL
      ? meta.pairs.map((p) => p[1])
      : filters.league === NONE
        ? []
        : meta.pairs.filter((p) => filters.league.includes(p[0])).map((p) => p[1]);
    const names = [...new Set(ids.map((id) => meta.seasons[id]))];
    return names.sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
  }, [meta, filters.league]);

  /* how many players each league would bring, before any other filter */
  const leagueCounts = useMemo(() => {
    const out = {};
    for (const r of rows) {
      if (r.pos !== filters.position) continue;
      if (filters.season !== ALL && meta.seasons[r.sid] !== filters.season) continue;
      out[r.lid] = (out[r.lid] || 0) + 1;
    }
    return out;
  }, [rows, meta, filters.position, filters.season]);

  const pool = useMemo(() => rows.filter((r) =>
    inLeagues(r, filters.league) &&
    (filters.season === ALL || meta.seasons[r.sid] === filters.season) &&
    r.pos === filters.position
  ), [rows, meta, filters]);

  /* the basics: who is even eligible before any requirement is applied */
  const eligible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return pool.filter((r) => {
      if (r.m < filters.minMinutes) return false;
      if (filters.ageLo && (r.age == null || r.age < filters.ageLo)) return false;
      if (filters.ageHi && (r.age == null || r.age > filters.ageHi)) return false;
      if (filters.team && r.t !== filters.team) return false;
      if (filters.nat && r.nat !== filters.nat) return false;
      if (q && !(r.n.toLowerCase().includes(q) || r.t.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [pool, filters]);

  /* then the thresholds, which are the part worth counting separately */
  const shown = useMemo(() => {
    const ab = Object.entries(rules.abilities);
    const mt = Object.entries(rules.metrics);
    const roleMin = filters.roleMin || 0;
    if (!ab.length && !mt.length && !roleMin) return eligible;
    return eligible.filter((r) => {
      for (const [i, min] of ab) {
        const v = r.th?.[+i];
        if (v == null || v < min) return false;
      }
      for (const [i, min] of mt) {
        const v = r.p?.[+i];
        if (v == null || v < min) return false;
      }
      if (roleMin && filters.role != null) {
        const f = r.rf?.[filters.role];
        if (f == null || f < roleMin) return false;
      }
      return true;
    });
  }, [eligible, rules, filters.role, filters.roleMin]);

  const axes = meta.columns[filters.position];

  const teams = useMemo(
    () => [...new Set(pool.map((r) => r.t))].sort((a, b) => a.localeCompare(b)),
    [pool]
  );

  /* a club filter left over from another league would empty the table */
  useEffect(() => {
    if (filters.team && !teams.includes(filters.team)) {
      setFilters({ ...filters, team: null });
    }
  }, [teams]);

  const sorted = useMemo(() => {
    const list = [...shown];
    const { col, dir } = sort;

    /* Ability average, used to break ties on the headline score. Worked out
       once per player rather than inside the comparator, which would run it
       O(n log n) times. */
    const meanCache = new Map();
    const mean = (r) => {
      const k = keyOf(r);
      if (!meanCache.has(k)) {
        const live = (r.th || []).filter((v) => v != null);
        meanCache.set(k, live.length ? live.reduce((s, v) => s + v, 0) / live.length : 0);
      }
      return meanCache.get(k);
    };

    list.sort((a, b) => {
      if (col === "n") return a.n.localeCompare(b.n) * -dir;
      let x, y;
      if (col === "sc") {
        if (filters.role != null) { x = a.rf?.[filters.role] ?? -1; y = b.rf?.[filters.role] ?? -1; }
        else {
          x = a.sc ?? -1; y = b.sc ?? -1;
          /*
           * Every pool has a top player, so across leagues the 99s pile up
           * — a dozen league leaders sharing the top of the table with no
           * obvious order between them.
           *
           * The tie breaks on the adjusted score, which answers exactly
           * the question a reader is asking at that point: which of these
           * 99s is worth more. That figure used to be hidden, and sorting
           * by something invisible was the problem; it has its own column
           * now, so the order can be read straight off the screen.
           *
           * Where two leagues rate the same, the ability average settles
           * it — a wider read of the same in-league evidence.
           */
          if (x === y) {
            const ax = a.sc2 ?? a.sc ?? -1, ay = b.sc2 ?? b.sc ?? -1;
            if (ax !== ay) { x = ax; y = ay; }
            else { x = mean(a); y = mean(b); }
          }
        }
      }
      else if (col === "adj") { x = a.sc2 ?? a.sc ?? -1; y = b.sc2 ?? b.sc ?? -1; }
      else if (col === "m") { x = a.m; y = b.m; }
      else if (col === "age") { x = a.age ?? 0; y = b.age ?? 0; }
      else if (col === "rt") { x = a.rt; y = b.rt; }
      else if (col === "ov") { x = a.sc ?? -1; y = b.sc ?? -1; }
      else {
        const ax = axes[Number(col)];
        if (ax?.k === "t") { x = a.th?.[ax.i] ?? -1; y = b.th?.[ax.i] ?? -1; }
        else { x = a.p[ax.i] ?? -1; y = b.p[ax.i] ?? -1; }
      }
      return (x - y) * dir;
    });
    return list;
  }, [shown, sort, axes, filters.role]);

  const pages = perPage === 0 ? 1 : Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, pages);
  const from = perPage === 0 ? 0 : (safePage - 1) * perPage;
  const slice = perPage === 0 ? sorted : sorted.slice(from, from + perPage);

  const spread = useMemo(() => {
    const L = new Set(shown.map((r) => r.lid));
    const S = new Set(shown.map((r) => meta.seasons[r.sid]));
    return { league: L.size > 1, season: S.size > 1, any: L.size > 1 || S.size > 1 };
  }, [shown, meta]);

  /*
   * The adjusted column only earns its width when more than one league is on
   * screen and the calibration actually moves something — within a single
   * competition it would just repeat the score.
   */
  const showAdj = useMemo(() => {
    if (!spread.league) return false;
    return shown.some((r) => r.sc != null && r.sc2 != null && r.sc2 !== Math.round(r.sc));
  }, [shown, spread.league]);

  const set = (patch) => { setFilters({ ...filters, ...patch }); setPage(1); };

  const toggleSort = (col) => {
    setSort((s) => s.col === col ? { col, dir: -s.dir } : { col, dir: -1 });
    setPage(1);
  };

  const toggleMark = (row) => {
    const has = marked.some((m) => keyOf(m) === keyOf(row));
    if (has) setMarked(marked.filter((m) => keyOf(m) !== keyOf(row)));
    else if (marked.length < MAX_PICK) setMarked([...marked, row]);
  };

  const exportCsv = () => exportRows({ rows: sorted, meta, filters, axes });

  const arrow = (col) => sort.col === col
    ? <span className="arrow">{sort.dir < 0 ? "▼" : "▲"}</span> : null;

  /*
   * Every sortable column, named.
   *
   * The table gets these from its own headers; the phone has no headers, so
   * the list is built once here and both read from it. The axes come last
   * because they change with the position — a striker sorts on finishing, a
   * keeper on shot stopping, and neither has the other's column.
   */
  const sortOptions = useMemo(() => {
    const out = [
      /*
       * With a style chosen, the headline column stops being the score and
       * becomes how closely a player matches that style — the comparator
       * already switches on it, so the label follows rather than adding a
       * second option that would sort by the same thing.
       */
      { col: "sc", label: filters.role != null ? "Style fit" : "Score" },
      ...(showAdj ? [{ col: "adj", label: "Adjusted for league" }] : []),
      { col: "n", label: "Name" },
      { col: "age", label: "Age" },
      { col: "m", label: "Minutes" },
      { col: "rt", label: "Rating" },
    ];
    axes.forEach((ax, i) => {
      out.push({
        col: String(i),
        label: ax.k === "t" ? ax.name : meta.labels[ax.i],
        kind: ax.k === "t" ? "ability" : "metric",
      });
    });
    return out;
  }, [axes, meta, showAdj, filters.role]);

  const sortLabel =
    sortOptions.find((o) => o.col === sort.col)?.label ?? "Score";

  /*
   * What the closed drawer says.
   *
   * A collapsed control that reads only "Filters" makes people open it to
   * find out whether anything is set. Naming the current state answers that
   * without a tap, and the count beside it marks how far the list has been
   * narrowed from its defaults.
   */
  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.league !== ALL) n++;
    if (filters.season !== ALL) n++;
    if (filters.minMinutes !== 900) n++;
    if (filters.ageLo || filters.ageHi) n++;
    if (filters.team) n++;
    if (filters.nat) n++;
    if (filters.query.trim()) n++;
    if (filters.role != null) n++;
    if (filters.roleMin) n++;
    return n;
  }, [filters]);

  /*
   * The league button's label, on its own.
   *
   * The wide summary line names everything that is set; this names only
   * the leagues, because that is the one thing the button changes and a
   * label that mentions age ranges would be lying about what it does.
   */
  const leagueSummary = useMemo(() => {
    if (filters.league === ALL) return "All leagues";
    if (filters.league === NONE) return "No leagues";
    if (filters.league.length === 1) {
      return meta.codes?.[filters.league[0]] ?? meta.leagues[filters.league[0]] ?? "1 league";
    }
    return `${filters.league.length} leagues`;
  }, [filters.league, meta]);

  const summary = useMemo(() => {
    const bits = [];
    bits.push(
      filters.league === ALL
        ? "All leagues"
        : filters.league === NONE
          ? "No leagues"
          : filters.league.length === 1
            ? (meta.leagues[filters.league[0]] ?? "1 league")
            : `${filters.league.length} leagues`
    );
    if (filters.season !== ALL) bits.push(filters.season);
    if (filters.role != null) bits.push(meta.roles[filters.position][filters.role].name);
    if (filters.team) bits.push(filters.team);
    if (filters.nat) bits.push(filters.nat);
    if (filters.ageLo || filters.ageHi) {
      bits.push(`${filters.ageLo || 16}–${filters.ageHi || 42}`);
    }
    bits.push(`${filters.minMinutes}′+`);
    return bits.join(" · ");
  }, [filters, meta]);

  return (
    <>
      <div className={"bar" + (filtersOpen ? " open" : "")}>
        <div className="posrow">
          <span className="posrow-label">Position</span>
          <div className="seg">
            {meta.order.map((p) => {
              /*
               * Rows are fetched one position at a time, so a count only
               * exists for the one on screen. Judging the others by what
               * is in memory would disable all of them — they are always
               * available, we simply have not asked for them yet.
               */
              const loaded = p === filters.position;
              const n = loaded
                ? rows.filter((r) =>
                    inLeagues(r, filters.league) &&
                    (filters.season === ALL || meta.seasons[r.sid] === filters.season) &&
                    r.pos === p).length
                : null;
              return (
                <button key={p}
                  aria-pressed={p === filters.position}
                  title={n == null
                    ? meta.positions[p]
                    : `${meta.positions[p]} — ${n} in pool`}
                  onClick={() => {
                    set({ position: p, role: null, roleMin: 0, team: null });
                    setRules({ abilities: {}, metrics: {} });
                    setSort({ col: "sc", dir: -1 });
                    setMarked([]);
                  }}>
                  {p}
                </button>
              );
            })}
          </div>

          {(meta.roles[filters.position] || []).length > 0 && (
            <div className="stylegroup">
              <span className="posrow-label role-label">Style</span>
              <div className="seg roles-seg">
                <button aria-pressed={filters.role == null}
                  onClick={() => set({ role: null })}>
                  Any
                </button>
                {meta.roles[filters.position].map((r, i) => (
                  <button key={r.name} aria-pressed={filters.role === i}
                    title={r.blurb}
                    onClick={() => set({ role: filters.role === i ? null : i })}>
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/*
          The phone's filter row: three controls where the wide screen has
          nine.

          Position and league are here because they are the two people
          change constantly — a scout looks at strikers in Spain, then
          strikers in Italy, then midfielders in Spain. Everything else is
          set once and left, so it folds behind the third button with a
          count of what is currently on.

          Position opens the same sheet the sort control uses; league opens
          the picker it already had. CSS hides the whole row wherever the
          real controls are visible.
        */}
        <div className="quickbar">
          <button className="qb-pos" onClick={() => setPosOpen(true)}
            aria-expanded={posOpen}>
            <b>{filters.position}</b>
            <span className="qb-chev" aria-hidden="true">▾</span>
          </button>

          <button className="qb-league" onClick={() => setFiltersOpen(true)}>
            <span className="qb-globe" aria-hidden="true">◍</span>
            <span className="qb-league-t">{leagueSummary}</span>
            <span className="qb-chev" aria-hidden="true">▾</span>
          </button>

          <button className="qb-more" onClick={() => setFiltersOpen(true)}
            aria-expanded={filtersOpen}>
            <span className="qb-sliders" aria-hidden="true">⚌</span>
            Filters
            {activeCount > 0 && <span className="qb-count">{activeCount}</span>}
          </button>
        </div>

        {/* the wide-screen handle, kept for the tablet range between the two */}
        <button className="bar-toggle" aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}>
          <span className="bt-icon" aria-hidden="true">⚙</span>
          <span className="bt-summary">{summary}</span>
          {activeCount > 0 && <span className="bt-count">{activeCount}</span>}
          <span className="bt-chev" aria-hidden="true">{filtersOpen ? "▲" : "▼"}</span>
        </button>

        <div className="bar-row">
          <Field label="League">
            <LeaguePicker meta={meta} value={filters.league}
              counts={leagueCounts}
              onChange={(league) => set({ league })} />
          </Field>

          <Field label="Season">
            <select value={filters.season} onChange={(e) => set({ season: e.target.value })}>
              <option value={ALL}>All seasons</option>
              {seasonNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>

          <Field label={<>Minimum minutes <b>{filters.minMinutes}</b></>} wide>
            <input type="range" min={500} max={3000} step={100}
              value={filters.minMinutes}
              onChange={(e) => set({ minMinutes: Number(e.target.value) })} />
          </Field>

          <Field label="Age">
            <div className="pair">
              <input type="number" placeholder="16" min={14} max={45}
                value={filters.ageLo || ""}
                onChange={(e) => set({ ageLo: e.target.value ? Number(e.target.value) : null })} />
              <span>to</span>
              <input type="number" placeholder="42" min={14} max={45}
                value={filters.ageHi || ""}
                onChange={(e) => set({ ageHi: e.target.value ? Number(e.target.value) : null })} />
            </div>
          </Field>

          <Field label="Club">
            <select value={filters.team || ""}
              onChange={(e) => set({ team: e.target.value || null })}>
              <option value="">All clubs</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Nationality">
            <select value={filters.nat || ""}
              onChange={(e) => set({ nat: e.target.value || null })}>
              <option value="">All nationalities</option>
              {(meta.nationalities || []).map((x) => (
                <option key={x.nat} value={x.nat}>{x.nat} ({x.n})</option>
              ))}
            </select>
          </Field>

          {filters.role != null && (
            <Field label={<>Style fit <b>{filters.roleMin || 0}+</b></>} wide>
              <input type="range" min={0} max={95} step={5}
                value={filters.roleMin || 0}
                onChange={(e) => set({ roleMin: Number(e.target.value) })} />
            </Field>
          )}

          <Field label="Search">
            <input type="text" placeholder="Player or club" className="txt"
              value={filters.query} onChange={(e) => set({ query: e.target.value })} />
          </Field>

          <div className="fld push">
            <span className="fld-label">&nbsp;</span>
            <div className="pair">
              <button className="pill-btn" onClick={exportCsv}>Export CSV</button>
              <button className="pill-btn danger" onClick={() => {
                setFilters({ ...filters, minMinutes: 900, ageLo: null, ageHi: null,
                             team: null, nat: null, query: "", roleMin: 0 });
                setRules({ abilities: {}, metrics: {} });
                setSort({ col: "sc", dir: -1 });
                setPage(1);
              }}>Reset</button>
            </div>
          </div>
        </div>
      </div>

      <Filters meta={meta} position={filters.position}
        rules={rules} setRules={setRules}
        open={panelOpen} setOpen={setPanelOpen}
        matched={shown.length} total={eligible.length} />

      {/*
        The sort bar, and only on a phone.

        It carries three things a reader wants before they start scrolling:
        how many players are in front of them, what the list is ordered by,
        and a way to change that. CSS hides the whole thing on a wide
        screen, where the column headers already do the job.
      */}
      <div className="sortbar">
        <span className="sb-count">
          <b>{sorted.length.toLocaleString()}</b> players
        </span>
        <button className="sb-sort" onClick={() => setSortOpen(true)}
          aria-expanded={sortOpen}>
          <span className="sb-sort-l">Sort</span>
          <b>{sortLabel}</b>
          <span className="sb-dir" aria-hidden="true">{sort.dir < 0 ? "▼" : "▲"}</span>
        </button>
      </div>

      {posOpen && (
        <>
          <div className="sheet-veil" onClick={() => setPosOpen(false)} />
          <div className="sortsheet" role="dialog" aria-label="Position">
            <div className="ss-head">
              <b>Position</b>
              <button className="ss-done" onClick={() => setPosOpen(false)}>Done</button>
            </div>
            <div className="ss-list">
              {meta.order.map((p) => (
                <button key={p} className={"ss-row" + (filters.position === p ? " on" : "")}
                  onClick={() => {
                    setFilters((f) => ({ ...f, position: p, role: null }));
                    setPage(1);
                    setPosOpen(false);
                  }}>
                  <span className="ss-tick" aria-hidden="true">
                    {filters.position === p ? "✓" : ""}
                  </span>
                  <span className="ss-name">{meta.positions[p]}</span>
                  <span className="ss-kind">{p}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {sortOpen && (
        <>
          <div className="sheet-veil" onClick={() => setSortOpen(false)} />
          <div className="sortsheet" role="dialog" aria-label="Sort by">
            <div className="ss-head">
              <b>Sort by</b>
              <button className="ss-done" onClick={() => setSortOpen(false)}>Done</button>
            </div>

            {/*
              Direction is its own control rather than a second tap on the
              chosen column. On a table, clicking a header twice to reverse
              it is understood; in a list of options it is a hidden gesture,
              and the one people miss.
            */}
            <div className="ss-dir">
              <button aria-pressed={sort.dir < 0}
                onClick={() => setSort((s) => ({ ...s, dir: -1 }))}>
                Highest first
              </button>
              <button aria-pressed={sort.dir > 0}
                onClick={() => setSort((s) => ({ ...s, dir: 1 }))}>
                Lowest first
              </button>
            </div>

            <div className="ss-list">
              {sortOptions.map((o) => (
                <button key={o.col} className={"ss-row" + (sort.col === o.col ? " on" : "")}
                  onClick={() => { setSort((s) => ({ ...s, col: o.col })); setPage(1); }}>
                  <span className="ss-tick" aria-hidden="true">
                    {sort.col === o.col ? "✓" : ""}
                  </span>
                  <span className="ss-name">{o.label}</span>
                  {o.kind && <span className="ss-kind">{o.kind}</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="tablebox">
        <div className="table-key">
          <div className="mode-switch" role="group" aria-label="What the columns show">
            <button aria-pressed={mode === "rank"} onClick={() => setMode("rank")}>
              Rankings
            </button>
            <button aria-pressed={mode === "figure"} onClick={() => setMode("figure")}>
              Figures
            </button>
          </div>
          <span className="key-text">
            {filters.role != null
              ? <><b>{meta.roles[filters.position][filters.role].name}</b> —{" "}
                  {meta.roles[filters.position][filters.role].blurb}{" "}
                  Sorted by how closely each player matches that style, not by
                  how good they are.</>
              : mode === "rank"
              ? <>Each column shows where a player ranks out of 100 against{" "}
                  {meta.positions[filters.position].toLowerCase()} in the same
                  league and season. Hover a cell for the figure behind it.</>
              : <>Each column shows the figure itself, in the unit under the
                  heading. Colour still marks how that figure ranks.</>}
          </span>
        </div>
        {slice.length === 0 ? (
          <div className="blank">
            <b>Nothing clears every requirement</b>
            {Object.keys(rules.abilities).length + Object.keys(rules.metrics).length > 0
              ? <>{eligible.length} players fit the league, age and minutes —
                  the thresholds above rule them all out. Lower one and they
                  come back.</>
              : <>Try widening the minutes or age range.</>}
          </div>
        ) : narrow ? (
          /*
           * The phone gets cards built from the same rows, in the same
           * order, under the same filters. Only the arrangement differs.
           */
          <div className="cardlist">
            {slice.map((r, i) => (
              <PlayerCard
                key={keyOf(r)}
                row={r}
                rank={from + i + 1}
                meta={meta}
                axes={axes}
                spread={spread}
                showAdj={showAdj}
                marked={marked.some((m) => keyOf(m) === keyOf(r))}
                onToggle={toggleMark}
                onOpen={onOpen}
              />
            ))}
          </div>
        ) : (
          <div className="scrollx">
            <table>
              <thead>
                <tr>
                  <th className="pick" />
                  <th className="lead" onClick={() => toggleSort("n")}>Player {arrow("n")}</th>
                  <th onClick={() => toggleSort("age")}>Age {arrow("age")}</th>
                  <th onClick={() => toggleSort("m")}>Min {arrow("m")}</th>
                  <th onClick={() => toggleSort("rt")}>Rating {arrow("rt")}</th>
                  {axes.map((ax, i) => {
                    if (ax.k === "t") {
                      return (
                        <th key={"t" + ax.i} onClick={() => toggleSort(String(i))}
                          className="metric theme-col"
                          title={`${ax.name} — ability score, click a cell to see what it is built from`}>
                          <span className="h-name">{ax.short} {arrow(String(i))}</span>
                          <span className="h-unit">ability</span>
                        </th>
                      );
                    }
                    const mi = ax.i;
                    return (
                      <th key={"m" + mi} onClick={() => toggleSort(String(i))}
                        className={"metric" + (meta.invert[mi] ? " inv" : "")}
                        title={`${meta.labels[mi]}${meta.help[mi] ? " — " + meta.help[mi] : ""}`}>
                        <span className="h-name">{meta.short[mi]} {arrow(String(i))}</span>
                        <span className="h-unit">
                          {mode === "figure" ? meta.units[mi] : "of 100"}
                          {meta.invert[mi] ? " · lower better" : ""}
                        </span>
                      </th>
                    );
                  })}
                  {filters.role != null && (
                    <th className="metric" onClick={() => toggleSort("sc")}>
                      <span className="h-name">
                        {meta.roles[filters.position][filters.role].name} {arrow("sc")}
                      </span>
                      <span className="h-unit">fit · level</span>
                    </th>
                  )}
                  <th className="metric score-h" onClick={() => toggleSort(filters.role != null ? "ov" : "sc")}>
                    <span className="h-name">Score {arrow(filters.role != null ? "ov" : "sc")}</span>
                    <span className="h-unit">rank in pool</span>
                  </th>
                  {showAdj && (
                    <th className="metric adj-h" onClick={() => toggleSort("adj")}
                      title="The same score moved for how strong the league is, so figures from different competitions can be read side by side. A separate model from the in-pool score.">
                      <span className="h-name">Adj {arrow("adj")}</span>
                      <span className="h-unit">league</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, i) => {
                  const isMarked = marked.some((m) => keyOf(m) === keyOf(r));
                  /* which theme cell in this row is open, and its column def */
                  const openHere = openCell?.startsWith(keyOf(r) + ":")
                    ? Number(openCell.split(":")[1]) : null;
                  const openAx = openHere != null ? axes[openHere] : null;
                  /* total columns: pick + player + age + min + rating + axes + [role] + score + [adjusted] */
                  const totalCols = 5 + axes.length + (filters.role != null ? 1 : 0) + 1 + (showAdj ? 1 : 0);
                  return (
                    <Fragment key={keyOf(r)}>
                    <tr className={isMarked ? "sel" : ""} tabIndex={0}
                      onClick={(e) => { if (!e.target.closest(".pick")) onOpen(r); }}
                      onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }}>
                      <td className="pick">
                        <input type="checkbox" checked={isMarked}
                          aria-label={`Select ${r.n}`}
                          onChange={() => toggleMark(r)}
                          onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td>
                        <div className="who">
                          <span className="rk">{from + i + 1}</span>
                          <Avatar row={r} base={meta.imgbase} size={34} />
                          <span className="who-id">
                            <span className="who-n">
                              {r.flag && (
                                <img className="who-flag" src={r.flag} alt={r.nat || ""}
                                  title={r.nat || ""} loading="lazy" />
                              )}
                              {r.n}
                            </span>
                            <span className="who-m">
                              {spread.any && <LeagueTag row={r} meta={meta} withSeason={spread.season} />}
                              {r.t}{r.dp ? ` · ${r.dp}` : ""}
                            </span>
                          </span>

                          {/*
                            Adding a player to the comparison, on a phone.

                            The checkbox that does this on a wide screen
                            lives in a column of its own, and that column is
                            the first thing the card layout drops — which
                            left Compare reachable only from a profile, and
                            the selection tray unreachable altogether. The
                            feature was there and could not be used.

                            So the card carries its own control, in the
                            corner where a save button belongs, sized for a
                            thumb rather than a cursor. CSS hides it wherever
                            the real checkbox is visible, so neither layout
                            offers two ways to do one thing.
                          */}
                          <button className={"who-pick" + (isMarked ? " on" : "")}
                            aria-pressed={isMarked}
                            aria-label={isMarked
                              ? `Remove ${r.n} from comparison`
                              : `Add ${r.n} to comparison`}
                            onClick={(e) => { e.stopPropagation(); toggleMark(r); }}>
                            {isMarked ? "✓" : "＋"}
                          </button>
                        </div>
                      </td>
                      <td data-label="Age"><span className="cel">{r.age ?? "—"}</span></td>
                      <td data-label="Min"><span className="cel">{r.m}</span></td>
                      <td data-label="Rating"><span className="cel">{r.rt ? r.rt.toFixed(2) : "—"}</span></td>
                      {axes.map((ax, ci) => {
                        /* a theme column: show the ability score, click to expand */
                        if (ax.k === "t") {
                          const tv = r.th?.[ax.i];
                          if (tv == null) {
                            return <td key={"t" + ci} data-label={ax.short}><span className="pc"><span className="tx dim">—</span></span></td>;
                          }
                          const cellId = `${keyOf(r)}:${ci}`;
                          const isOpen = openCell === cellId;
                          const c = ramp(tv);
                          return (
                            <td key={"t" + ci} data-label={ax.short}>
                              <span className={"pc theme-cell" + (isOpen ? " open" : "")}
                                role="button" tabIndex={0}
                                title={`${ax.name} ability — click for the metrics behind it`}
                                onClick={(e) => { e.stopPropagation(); setOpenCell(isOpen ? null : cellId); }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault(); e.stopPropagation();
                                    setOpenCell(isOpen ? null : cellId);
                                  }
                                }}>
                                <span className={"v-main" + (tv >= 88 ? " elite" : tv < 25 ? " poor" : "")}>
                                  {Math.round(tv)}
                                </span>
                                <span className="v-bar">
                                  <i style={{ width: `${Math.max(tv, 2)}%`, background: c }} />
                                </span>
                                <span className="theme-caret" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                              </span>
                            </td>
                          );
                        }
                        /* a raw metric column: unchanged */
                        const mi = ax.i;
                        const p = r.p[mi], v = r.v[mi];
                        if (p == null || v == null) {
                          return <td key={"m" + mi} data-label={meta.short[mi]}><span className="pc"><span className="tx dim">—</span></span></td>;
                        }
                        const c = ramp(p);
                        const shown = mode === "rank" ? Math.round(p) : fmt(v);
                        const behind = mode === "rank"
                          ? `${fmt(v)} ${meta.units[mi]}`
                          : `ranks ${Math.round(p)} of 100`;
                        return (
                          <td key={"m" + mi} data-label={meta.short[mi]}>
                            <span className="pc" title={`${meta.labels[mi]} — ${behind}`}>
                              <span className={"v-main" + (p >= 88 ? " elite" : p < 25 ? " poor" : "")}>
                                {shown}
                              </span>
                              <span className="v-bar">
                                <i style={{ width: `${Math.max(p, 2)}%`, background: c }} />
                              </span>
                            </span>
                          </td>
                        );
                      })}
                      {filters.role != null && (
                        <td>
                          <span className="role-cell">
                            <span className="rc-fit" style={{ color: ramp(r.rf?.[filters.role] ?? 0) }}>
                              {r.rf?.[filters.role] == null ? "—" : Math.round(r.rf[filters.role])}
                            </span>
                            <span className="rc-lvl" style={{ color: ramp(r.rq?.[filters.role] ?? 0) }}>
                              {r.rq?.[filters.role] == null ? "—" : Math.round(r.rq[filters.role])}
                            </span>
                          </span>
                        </td>
                      )}
                      <td>
                        <span className="sc-cell">
                          {r.sc == null ? (
                            <>
                              <span className="sc-num none">—</span>
                              <span className="sc-word" title={
                                "The feed is missing too much of what this position " +
                                "is judged on for a score to mean anything."
                              }>no data</span>
                            </>
                          ) : (
                            <>
                              <span className="sc-num" style={{ color: ramp(r.sc) }}>
                                {Math.round(r.sc)}
                              </span>
                              <span className="sc-word">{band(r.sc)}</span>
                              {(() => {
                                const cf = confidenceOf(r);
                                if (!cf || cf.level === "high") return null;
                                const sb = scoreBand(r);
                                const why = [
                                  `Ranked against ${cf.pool} players — ${cf.poolNote}.`,
                                  sb ? `A place is worth about ${sb.step} points here, so read this as ${sb.lo}–${sb.hi}.` : "",
                                  cf.positionNote || "",
                                ].filter(Boolean).join(" ");
                                return (
                                  <span className={"sc-conf " + cf.level} title={why}>
                                    {cf.level === "low" ? "low conf." : "med. conf."}
                                  </span>
                                );
                              })()}
                            </>
                          )}
                        </span>
                      </td>
                      {showAdj && (
                        <td>
                          <span className="adj-cell">
                            {r.sc2 == null || r.sc == null ? (
                              <span className="adj-num none">—</span>
                            ) : (
                              <span className="adj-num" style={{ color: ramp(r.sc2) }}>
                                {r.sc2}
                                {r.sc2 !== Math.round(r.sc) && (
                                  <span className="adj-delta">
                                    {r.sc2 > Math.round(r.sc) ? "+" : "−"}
                                    {Math.abs(r.sc2 - Math.round(r.sc))}
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                    {openAx && openAx.k === "t" && (
                      <tr className="theme-strip">
                        <td colSpan={totalCols}>
                          <div className="ts-inner">
                            <span className="ts-title">
                              {openAx.name}
                              <span className="ts-sub"> · what this ability is built from</span>
                            </span>
                            <div className="ts-grid">
                              {openAx.m.map((mi) => {
                                const p = r.p[mi], v = r.v[mi];
                                return (
                                  <div className="ts-metric" key={mi}>
                                    <span className="ts-lbl">
                                      {meta.short[mi]}
                                      {meta.invert[mi] && <span className="ts-inv"> ·lower better</span>}
                                    </span>
                                    {p == null || v == null ? (
                                      <span className="ts-val dim">—</span>
                                    ) : (
                                      <>
                                        <span className="ts-bar">
                                          <i style={{ width: `${Math.max(p, 2)}%`, background: ramp(p) }} />
                                        </span>
                                        <span className="ts-fig">
                                          <b style={{ color: ramp(p) }}>{Math.round(p)}</b>
                                          <span className="ts-raw">{fmt(v)} {meta.units[mi]}</span>
                                        </span>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {slice.length > 0 && (
          <div className="pager">
            <span className="count">
              Showing <b>{from + 1}–{from + slice.length}</b> of{" "}
              <b>{sorted.length}</b> {meta.positions[filters.position].toLowerCase()}
              {spread.any && (() => {
                const n = new Set(shown.map((r) => `${r.lid}_${r.sid}`)).size;
                return n > 1 ? ` across ${n} competitions` : "";
              })()}
            </span>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
              {[25, 50, 100, 0].map((n) => (
                <option key={n} value={n}>{n === 0 ? "Show all" : `${n} per page`}</option>
              ))}
            </select>
            {pages > 1 && (
              <nav className="pnav">
                <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}
                  aria-label="Previous page">‹</button>
                {pageList(safePage, pages).map((n, i) =>
                  n === "…"
                    ? <span key={`gap${i}`} className="gap">…</span>
                    : <button key={n} aria-current={n === safePage}
                        onClick={() => setPage(n)}>{n}</button>
                )}
                <button disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}
                  aria-label="Next page">›</button>
              </nav>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, children, wide }) {
  return (
    <div className={"fld" + (wide ? " wide" : "")}>
      <span className="fld-label">{label}</span>
      {children}
    </div>
  );
}

/* =====================================================================
 *  The card a phone shows instead of a table row
 * =====================================================================
 *  A table needs a header to be read, and a header needs width. Below
 *  760px there is neither, so the same facts are arranged as a card: the
 *  player and their score at the top where the eye lands, the abilities
 *  that decide the ranking in the middle, and the supporting figures in a
 *  strip along the bottom.
 *
 *  Three abilities rather than all six or seven. The rest are a tap away
 *  in the profile, and a card that lists everything is a card nobody
 *  scrolls past — twenty-five of them at full height is eight thousand
 *  pixels of ranking.
 * ===================================================================== */

function PlayerCard({ row, rank, meta, axes, marked, onToggle, onOpen, spread, showAdj }) {
  const cf = confidenceOf(row);

  /*
   * Which three abilities to show.
   *
   * The columns for this position, in the order the model considers them
   * — which puts the ones that carry the most weight first. Metrics are
   * skipped: a raw figure without its unit means little at this size, and
   * the abilities are what the score is built from.
   */
  const shown = axes
    .filter((ax) => ax.k === "t" && row.th?.[ax.i] != null)
    .slice(0, 3);

  /*
   * The style label, where the model was confident enough to give one.
   * A player who fits three roles equally gets none, and that silence is
   * information — better than naming whichever won by a point.
   */
  const style = row.rl || null;

  return (
    <article className={"pcard" + (marked ? " sel" : "")}
      onClick={() => onOpen(row)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(row); }}>

      <div className="pc-top">
        <div className="pc-face">
          <Avatar row={row} base={meta.imgbase} size={68} />
          {row.flag && (
            <img className="pc-flag" src={row.flag} alt={row.nat || ""} loading="lazy" />
          )}
        </div>

        <div className="pc-id">
          <h3 className="pc-name">{row.n}</h3>
          <div className="pc-club">{row.t}</div>
          <div className="pc-meta">
            {spread.any && <LeagueTag row={row} meta={meta} withSeason={spread.season} />}
            <span className="pc-pos">{row.dp || meta.positions[row.pos]}</span>
          </div>
          {style && <div className="pc-style">{style}</div>}
        </div>

        <div className="pc-score">
          <span className={"pc-num" + (row.sc >= 88 ? " elite" : "")}>
            {row.sc == null ? "—" : Math.round(row.sc)}
          </span>
          <span className="pc-band">{band(row.sc)}</span>
        </div>

        {/*
          Add to comparison. Stops the click reaching the card, which would
          open the profile — the two actions sit within a thumb's width of
          each other and must not be confusable.
        */}
        <button className={"pc-add" + (marked ? " on" : "")}
          aria-pressed={marked}
          aria-label={marked
            ? `Remove ${row.n} from comparison`
            : `Add ${row.n} to comparison`}
          onClick={(e) => { e.stopPropagation(); onToggle(row); }}>
          {marked ? "✓" : "＋"}
        </button>
      </div>

      {shown.length > 0 && (
        <div className="pc-abilities">
          {shown.map((ax) => {
            const v = row.th[ax.i];
            return (
              <div className="pc-ab" key={ax.i}>
                <div className="pc-ab-head">
                  <span className="pc-ab-name">{ax.short || ax.name}</span>
                  <span className={"pc-ab-v" + (v >= 88 ? " elite" : "")}>{Math.round(v)}</span>
                </div>
                <span className="pc-ab-bar">
                  <i style={{ width: `${Math.max(v, 2)}%`, background: ramp(v) }} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="pc-facts">
        <span className="pc-fact">
          <b>Age</b>{row.age ?? "—"}
        </span>
        <span className="pc-fact">
          <b>Min</b>{row.m?.toLocaleString() ?? "—"}
        </span>
        <span className="pc-fact">
          <b>Rating</b>{row.rt ? row.rt.toFixed(2) : "—"}
        </span>
        {showAdj && (
          <span className="pc-fact adj">
            <b>Adjusted</b>
            <em>{row.sc2 == null ? "—" : Math.round(row.sc2)}</em>
          </span>
        )}
        {cf && (
          <span className={"pc-fact conf " + cf.level}>
            <b>Confidence</b>
            <i aria-hidden="true" />
            {cf.level}
          </span>
        )}
      </div>

      <span className="pc-rank" aria-hidden="true">{rank}</span>
    </article>
  );
}
