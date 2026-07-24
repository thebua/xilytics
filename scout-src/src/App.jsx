import { useEffect, useMemo, useRef, useState } from "react";
import Explore from "./components/Explore";
import Compare from "./components/Compare";
import Account from "./components/Account";
import Saved from "./components/Saved";
import Profile from "./components/Profile";
import Strength from "./components/Strength";
import Avatar from "./components/Avatar";
import LeagueTag from "./components/LeagueTag";
import { MAX_PICK, hydrate, keyOf } from "./lib/util";
import { loadMeta, loadPosition, derivePairs, clearPositionCache } from "./lib/api";
import { toHash, fromHash, DEFAULTS } from "./lib/urlState";
import { supabase } from "./lib/supabase";
import { readShelf, writeShelf, EMPTY_SHELF, slim } from "./lib/shelf";
import "./styles/global.css";
import "./App.css";

const VIEWS = ["explore", "compare", "profile", "leagues"];

export default function App() {
  const [data, setData] = useState(null);
  const [baseMeta, setBaseMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(null);

  /*
   * Who is signed in, and the token that proves it.
   *
   * The session is Supabase's; the token inside it is what the API reads to
   * decide which leagues this caller may see. Both are held here rather than
   * fetched where they are needed, so there is one answer to "is anyone
   * signed in" and every part of the app agrees with it.
   */
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const user = session?.user ?? null;
  const token = session?.access_token ?? null;

  useEffect(() => {
    let cancelled = false;

    /*
     * getSession reads what is already stored — a reload should not send
     * anyone back to the sign-in dialog. authReady guards the first data
     * load: firing it before the stored session is read would fetch the
     * open set and then immediately fetch it again with a token.
     */
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setAuthReady(true);
    });

    /*
     * Fires on sign-in, sign-out, and every silent token refresh. The
     * cached rows are keyed by whether a token was present, so they are
     * dropped whenever that changes — otherwise signing in would leave a
     * member looking at the anonymous slice of the data.
     */
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (cancelled) return;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") clearPositionCache();
      setSession(next ?? null);
      setAuthReady(true);
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  /*
   * The shelf.
   *
   * Kept in the browser rather than on the server for now, which means it
   * belongs to this device rather than to the account. That is a smaller
   * promise than the sign-in dialog makes, and the next step is to move it
   * behind the account — but a shelf that survives a reload is already the
   * difference between a feature and a demonstration.
   *
   * Only an identifying sketch of each row is stored. Keeping whole rows
   * meant every percentile and metric array went to disk, which is a few
   * hundred kilobytes for forty players and more than the quota enjoys.
   */
  const [shelf, setShelf] = useState(() => readShelf());
  const [savedTab, setSavedTab] = useState("favourites");

  useEffect(() => { writeShelf(shelf); }, [shelf]);

  const inShelf = (list, row) =>
    !!row && (shelf[list] || []).some((x) => keyOf(x) === keyOf(row));

  /*
   * Add or remove in one gesture — the same button that saved a player
   * un-saves them, which is what pressing a lit star is expected to do.
   */
  const toggleShelf = (list, row) => setShelf((s) => {
    const held = (s[list] || []).some((x) => keyOf(x) === keyOf(row));
    return {
      ...s,
      [list]: held
        ? s[list].filter((x) => keyOf(x) !== keyOf(row))
        : [slim(row), ...(s[list] || [])],
    };
  });

  /* the address bar is the source of truth on first paint */
  const boot = fromHash(window.location.hash);

  const [view, setView] = useState(boot?.view || "explore");
  const [filters, setFilters] = useState(boot?.filters || { ...DEFAULTS });
  const [rules, setRules] = useState(boot?.rules || { abilities: {}, metrics: {} });

  /* panel and scroll live here so a trip to another view brings them back */
  const [panelOpen, setPanelOpen] = useState(
    Object.keys(boot?.rules?.abilities || {}).length > 0 ||
    Object.keys(boot?.rules?.metrics || {}).length > 0
  );
  const scrollMemory = useRef({});

  const [marked, setMarked] = useState([]);   // ticked in Explore
  const [picked, setPicked] = useState([]);   // on the compare radar
  const [profile, setProfile] = useState(null);
  const [search, setSearch] = useState("");

  /* the banner above the table asks the masthead to open its dialog */
  const [askSignIn, setAskSignIn] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        const m = await loadMeta({ token, signal: ac.signal });
        if (cancelled) return;
        setBaseMeta(m);
        setError(null);
      } catch (e) {
        if (!cancelled && e.name !== "AbortError") setError(e.message);
      }
    })();

    return () => { cancelled = true; ac.abort(); };
  }, [authReady, token]);

  /*
   * Rows arrive a position at a time. The whole dataset is several
   * megabytes and nobody reads two positions at once, so the request
   * follows the position the visitor is looking at — and is thrown away
   * if they move on before it lands.
   *
   * The token is a dependency: a member sees more than a visitor, so
   * signing in has to ask again rather than keep what it already had.
   */
  useEffect(() => {
    if (!baseMeta || !authReady) return;
    let cancelled = false;
    const ac = new AbortController();

    setLoading(true);
    (async () => {
      try {
        const { rows, locked } = await loadPosition(filters.position, {
          token,
          signal: ac.signal,
          onProgress: (got, total) => {
            if (!cancelled) setProgress({ got, total });
          },
        });
        if (cancelled) return;
        const withPools = derivePairs({ ...baseMeta }, rows);
        setData(hydrate({ meta: withPools, rows }));
        setLocked(locked);
        setError(null);
      } catch (e) {
        if (!cancelled && e.name !== "AbortError") setError(e.message);
      } finally {
        if (!cancelled) { setLoading(false); setProgress(null); }
      }
    })();

    return () => { cancelled = true; ac.abort(); };
  }, [baseMeta, filters.position, token, authReady]);

  /*
   * Mirror the state into the URL so a view can be shared or reloaded.
   * replaceState rather than push, or every slider nudge would become a
   * back-button step.
   */
  useEffect(() => {
    if (!data) return;
    const key = view === "profile" && profile ? keyOf(profile) : null;
    const next = toHash(filters, rules, view, key);
    if (next !== window.location.hash) {
      window.history.replaceState(null, "", next || window.location.pathname);
    }
  }, [data, filters, rules, view, profile]);

  /* a shared link that names a player should open on that player */
  useEffect(() => {
    if (!data || !boot?.playerKey || profile) return;
    const found = data.rows.find((r) => keyOf(r) === boot.playerKey);
    if (found) setProfile(found);
  }, [data]);

  const hits = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return data.rows
      .filter((r) => r.n.toLowerCase().includes(q) || r.t.toLowerCase().includes(q))
      .sort((a, b) => (b.sc ?? -1) - (a.sc ?? -1))
      .slice(0, 10);
  }, [data, search]);

  /* going somewhere else should not lose your place in the list */
  const goTo = (next, { top = false } = {}) => {
    scrollMemory.current[view] = window.scrollY;
    setView(next);
    const y = top ? 0 : (scrollMemory.current[next] ?? 0);
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  };

  const openProfile = (row) => {
    setProfile(row);
    setSearch("");
    goTo("profile", { top: true });

    /*
     * Recently viewed keeps itself. Capped at forty because the list is
     * for retracing a step or two, not for keeping a record — past that
     * it stops being findable and starts being noise.
     */
    if (user && row) {
      setShelf((s) => ({
        ...s,
        history: [slim(row), ...(s.history || []).filter((x) => keyOf(x) !== keyOf(row))].slice(0, 40),
      }));
    }
  };

  const sendToCompare = (row) => {
    if (!picked.some((p) => keyOf(p) === keyOf(row))) {
      setPicked(picked.length >= MAX_PICK ? [...picked.slice(1), row] : [...picked, row]);
    }
    setFilters((f) => ({ ...f, position: row.pos }));
    goTo("compare", { top: true });
  };

  const compareMarked = () => {
    if (!marked.length) return;
    setPicked(marked.slice(0, MAX_PICK));
    goTo("compare", { top: true });
  };

  /* ------------------------------------------------------------- account */

  /*
   * Sign-in is a redirect: the browser leaves for Google and comes back
   * here with a token in the fragment. Nothing to do on this side but ask —
   * onAuthStateChange picks it up on return.
   *
   * The return address is written out rather than read from the current
   * location. window.location.pathname gives "/scout" when the page was
   * reached without the trailing slash, Supabase compares it against a
   * list holding "/scout/", finds no match, and falls back to the site
   * root — so the visitor signs in successfully and lands on the home
   * page wondering what happened. A literal path cannot drift.
   */
  const signIn = async (how) => {
    if (how !== "google") return;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/scout/` },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    /*
     * The shelf stays. It belongs to the browser rather than the account
     * at present, and clearing it on sign-out would throw away work the
     * person never asked to lose.
     */
    if (view === "saved") goTo("explore");
  };

  if (error) {
    return (
      <div className="boot">
        <b>Can't load the data</b>
        <p>{error}</p>
        <p className="boot-hint">
          If this keeps happening the service may be down — try again shortly.
        </p>
      </div>
    );
  }

  if (!data) {
    /*
     * Rows arrive in pages, so the wait has a number attached to it rather
     * than a spinner that says nothing about how long is left.
     */
    return (
      <div className="boot">
        <b>Loading</b>
        {progress?.total ? (
          <p className="boot-hint">
            {progress.got.toLocaleString()} of {progress.total.toLocaleString()} players
          </p>
        ) : null}
      </div>
    );
  }

  /* The rows carry the meta they were derived with, pools and all. */
  const meta = data.meta;

  return (
    <>
      <header className="masthead">
        <div className="wrap">
          {/*
            The logo goes home rather than to Explore. A visitor who lands
            in the scout from a search result has no other way back to the
            rest of the site, which is how three pages end up feeling like
            three separate products.
          */}
          <a className="logo" href="/">
            <span className="mark">XI</span>
            Xilytics
            <span className="logo-sub">Scout</span>
          </a>

          <nav>
            {VIEWS.map((v) => (
              <button key={v} onClick={() => goTo(v)}
                aria-current={view === v ? "page" : undefined}>
                {v}
              </button>
            ))}
          </nav>

          <div className="spacer" />

          {/* the rest of the site, so the scout is not a dead end */}
          <nav className="sitenav">
            <a href="/app.html">Lineups</a>
            <a href="/formations.html">Formations</a>
          </nav>

          <div className="gsearch">
            <span className="gicon" aria-hidden="true">⌕</span>
            <input type="text" autoComplete="off" placeholder="Search any player"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {hits.length > 0 && (
              <div className="hits">
                {hits.map((r) => (
                  <button key={keyOf(r)} onClick={() => openProfile(r)}>
                    <Avatar row={r} base={meta.imgbase} size={23} />
                    <span className="hit-n">{r.n}</span>
                    <span className="hit-t">
                      {r.t}<br />
                      <LeagueTag row={r} meta={meta} withSeason />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Account
            user={user}
            onSignIn={signIn}
            onSignOut={signOut}
            onOpenSaved={(tab) => { setSavedTab(tab); goTo("saved"); }}
            askToSignIn={askSignIn}
            onAsked={() => setAskSignIn(false)}
          />
        </div>
      </header>

      <main className="wrap">
        {view === "explore" && (
          <header className="page-head">
            <h1>Player rankings</h1>
            <p>
              Every player judged on what their own position is for, then
              ranked against the others doing the same job in the same league.
            </p>
            <div className="stat-line">
              <b>{data.rows.length.toLocaleString()}</b> player-seasons ·{" "}
              <b>{Object.keys(meta.leagues).length}</b> leagues ·{" "}
              minimum <b>{meta.minMinutes}</b> minutes
            </div>

            {/*
              What is being withheld, said plainly.
              A visitor sees three leagues and no reason to think there are
              more — the shorter list looks like the whole product rather
              than a sample of it, and nobody opens an account for something
              they have not been told exists. The count comes from the API,
              which knows what this particular caller cannot read, so it is
              right for a signed-out visitor and absent for a member.
            */}
            {meta.lockedLeagues > 0 && (
              <div className="locked-note">
                <span className="locked-ico" aria-hidden="true">🔒</span>
                <span className="locked-text">
                  <b>{meta.lockedLeagues} more leagues</b> — the Championship,
                  the Süper Lig, the Eredivisie and the rest — open with a
                  free account.
                </span>
                <button className="locked-go" onClick={() => setAskSignIn(true)}>
                  Sign in
                </button>
              </div>
            )}
          </header>
        )}
        {view === "compare" && (
          <header className="page-head">
            <h1>{meta.positions[filters.position]} compared</h1>
            <p>
              Six abilities, and the metrics underneath them, side by side.
              Add up to {MAX_PICK} players from any league on the plan.
            </p>
          </header>
        )}
        {view === "profile" && profile && (
          <header className="page-head sr-only-head">
            <h1>{profile.n}</h1>
          </header>
        )}

        {view === "explore" && (
          <Explore data={data} filters={filters} setFilters={setFilters}
            rules={rules} setRules={setRules}
            panelOpen={panelOpen} setPanelOpen={setPanelOpen}
            marked={marked} setMarked={setMarked} onOpen={openProfile} />
        )}
        {view === "compare" && (
          <Compare data={data} picked={picked} setPicked={setPicked}
            position={filters.position} onOpen={openProfile} />
        )}
        {view === "saved" && (
          <Saved
            tab={savedTab}
            data={data}
            meta={meta}
            saved={shelf}
            onTab={setSavedTab}
            onOpen={openProfile}
            onRemove={(row) => setShelf((s) => ({
              ...s,
              [savedTab]: s[savedTab].filter((x) => keyOf(x) !== keyOf(row)),
            }))}
          />
        )}
        {view === "leagues" && (
          <>
            <header className="page-head">
              <h1>League levels</h1>
              <p>
                What a step between competitions actually costs a player,
                worked out from the ones who made it.
              </p>
            </header>
            <Strength meta={meta} />
          </>
        )}
        {view === "profile" && (
          profile
            ? <Profile row={profile} data={data} onOpen={openProfile}
                onCompare={sendToCompare}
                isFavourite={inShelf("favourites", profile)}
                inSquad={inShelf("squad", profile)}
                onFavourite={user ? (r) => toggleShelf("favourites", r) : null}
                onSquad={user ? (r) => toggleShelf("squad", r) : null} />
            : <div className="card"><div className="blank">
                <b>Pick a player</b>
                Use the search above, or click any row in Explore.
              </div></div>
        )}
      </main>

      {view === "explore" && marked.length > 0 && (
        <div className="tray" role="region" aria-label="Selected players">
          <span className="tray-hint">Selected</span>
          <div className="tray-list">
            {marked.map((r) => (
              <span key={keyOf(r)} className="chip">
                <Avatar row={r} base={meta.imgbase} size={20} />
                <b>{r.n}</b>
                <LeagueTag row={r} meta={meta} withSeason />
                <button aria-label={`Remove ${r.n}`}
                  onClick={() => setMarked(marked.filter((m) => keyOf(m) !== keyOf(r)))}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <button className="pill-btn danger" onClick={() => setMarked([])}>Clear</button>
          <button className="tray-go" onClick={compareMarked}>
            Compare {marked.length} →
          </button>
        </div>
      )}

      <footer className="foot">
        <div className="wrap">
          <span>Percentiles compare like for like: same position, league and season</span>
          <span className="swatch-key">
            <i className="swatch" /> 0 → 100 percentile
          </span>
          <span>Updated {meta.built}</span>
        </div>
      </footer>
    </>
  );
}
