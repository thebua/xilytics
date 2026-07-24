/*
 * The Supabase client.
 *
 * One instance for the whole app. A second would mean two copies of the
 * session and a sign-out that only takes on one of them.
 *
 * The anon key is compiled into the bundle and visible to anyone who opens
 * the page. That is how it is meant to work — row level security decides
 * what a caller may read, and the key alone grants nothing an anonymous
 * visitor does not already have.
 */

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/*
 * Missing configuration is a deployment mistake rather than a runtime one,
 * so it says so loudly in the console instead of failing quietly on the
 * first sign-in attempt.
 */
if (!url || !anon) {
  console.warn(
    "Supabase is not configured. VITE_SUPABASE_URL and " +
    "VITE_SUPABASE_ANON_KEY are missing from the environment, so signing " +
    "in will not work. Everything else still does."
  );
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    /* the session survives a reload */
    persistSession: true,
    /* an access token lasts an hour; this renews it before it lapses */
    autoRefreshToken: true,
    /*
     * A magic link lands with the token in the URL fragment. This reads it,
     * stores the session and tidies the address bar — without it the link
     * appears to do nothing.
     */
    detectSessionInUrl: true,
  },
});

/* Whether signing in is possible at all, so the interface can say so. */
export const supabaseReady = Boolean(url && anon);