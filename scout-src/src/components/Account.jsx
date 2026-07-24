import { useEffect, useRef, useState } from "react";
import { supabaseReady } from "../lib/supabase";
import "./account.css";

/*
 * The account corner of the masthead.
 *
 * Two states, and they should not look alike: a visitor sees an invitation,
 * a member sees themselves. The difference is the point — someone who has
 * signed in should be able to tell at a glance, without opening anything.
 *
 * Google is the only way in. An emailed link sat beside it for a while and
 * earned its removal: it costs a trip to a mailbox and back, nearly everyone
 * arriving here already has a Google account live in the same browser, and
 * the mail service it leaned on was rate-limited in a way that made every
 * failure read as a mistyped address. One button that works beats two that
 * dilute each other.
 *
 * Signing in leaves the page and returns with a token in the fragment, so
 * nothing here waits for a user — the session arrives on its own and the
 * component above picks it up.
 */

export default function Account({ user, onSignIn, onSignOut, onOpenSaved }) {
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const wrapRef = useRef(null);

  /* a menu that will not close is worse than no menu */
  useEffect(() => {
    if (!menu) return;
    const away = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenu(false);
    };
    const esc = (e) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  useEffect(() => {
    if (!dialog) return;
    const esc = (e) => e.key === "Escape" && setDialog(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [dialog]);

  /* a stale error under a fresh dialog reads as a new failure */
  useEffect(() => {
    if (!dialog) { setProblem(null); setBusy(false); }
  }, [dialog]);

  /* ------------------------------------------------------------ signed in */

  if (user) {
    /*
     * Google carries a display name and usually a photograph. Where the name
     * is missing the local part of the address is a better greeting than the
     * whole of it, and an initial stands in for the picture.
     */
    const name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Signed in";
    const initial = name.trim()[0].toUpperCase();
    const photo = user.user_metadata?.avatar_url || null;

    return (
      <div className="acct" ref={wrapRef}>
        <button className="acct-me" onClick={() => setMenu((v) => !v)}
          aria-expanded={menu} aria-haspopup="menu">
          {photo
            ? <img className="acct-avatar acct-photo" src={photo} alt="" />
            : <span className="acct-avatar">{initial}</span>}
          <span className="acct-name">{name}</span>
          <span className="acct-chev" aria-hidden="true">▾</span>
        </button>

        {menu && (
          <div className="acct-menu" role="menu">
            <div className="acct-who">
              <b>{name}</b>
              <span>{user.email}</span>
            </div>

            <button role="menuitem" onClick={() => { setMenu(false); onOpenSaved?.("favourites"); }}>
              <span className="acct-ico">★</span> Favourites
            </button>
            <button role="menuitem" onClick={() => { setMenu(false); onOpenSaved?.("squad"); }}>
              <span className="acct-ico">▦</span> My squad
            </button>
            <button role="menuitem" onClick={() => { setMenu(false); onOpenSaved?.("history"); }}>
              <span className="acct-ico">◷</span> Recently viewed
            </button>
            <button role="menuitem" onClick={() => { setMenu(false); onOpenSaved?.("searches"); }}>
              <span className="acct-ico">⌕</span> Saved searches
            </button>

            <div className="acct-sep" />
            <button role="menuitem" className="acct-out"
              onClick={() => { setMenu(false); onSignOut?.(); }}>
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ----------------------------------------------------------- signed out */

  const withGoogle = async () => {
    if (busy) return;
    setProblem(null);
    setBusy(true);
    try {
      await onSignIn?.("google");
      /* the page is leaving; nothing after this runs */
    } catch (e) {
      setBusy(false);
      setProblem(e?.message || "Google sign-in is unavailable just now.");
    }
  };

  return (
    <div className="acct" ref={wrapRef}>
      <button className="acct-in" onClick={() => setDialog(true)}>
        Sign in
      </button>

      {dialog && (
        <div className="acct-veil" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setDialog(false);
        }}>
          <div className="acct-dialog" role="dialog" aria-modal="true"
            aria-labelledby="acct-title">
            <button className="acct-x" onClick={() => setDialog(false)}
              aria-label="Close">×</button>

            <h2 id="acct-title">Keep your work</h2>
            <p className="acct-lede">
              Every league is open either way. An account is for the things
              worth coming back to: players you starred, a squad you are
              building, searches you would rather not set up twice.
            </p>

            {!supabaseReady ? (
              <p className="acct-small">
                Sign-in is not configured on this deployment.
              </p>
            ) : (
              <>
                <button className="acct-google" onClick={withGoogle} disabled={busy}>
                  <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">
                    <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"/>
                    <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2a5.4 5.4 0 0 1-8-2.8H1.1v2.3A9 9 0 0 0 9 18z"/>
                    <path fill="#FBBC05" d="M4 10.7a5.4 5.4 0 0 1 0-3.4V5H1.1a9 9 0 0 0 0 8l2.9-2.3z"/>
                    <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A9 9 0 0 0 1.1 5L4 7.3A5.4 5.4 0 0 1 9 3.6z"/>
                  </svg>
                  {busy ? "Opening Google…" : "Continue with Google"}
                </button>

                {problem && <p className="acct-problem" role="alert">{problem}</p>}
              </>
            )}

            <p className="acct-small">
              No password. No card. Nothing is shared with anyone.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
