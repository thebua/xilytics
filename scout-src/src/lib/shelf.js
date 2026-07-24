/*
 * Where the shelf is kept.
 *
 * Favourites, a squad in progress, what was looked at last — all of it used
 * to live in component state, which meant a reload emptied it. The sign-in
 * dialog promises "the things worth coming back to", and a list that cannot
 * survive a refresh does not keep that promise.
 *
 * This is the browser's own storage, so the shelf belongs to a device
 * rather than to an account: sign in on a phone and it is not there. Moving
 * it behind the account is the next step, and when it happens this module
 * is what gets replaced — nothing above it needs to know where the lists
 * came from.
 */

const KEY = "xilytics.shelf.v1";

export const EMPTY_SHELF = {
  favourites: [],
  squad: [],
  history: [],
  searches: [],
};

/*
 * Only what identifies a player, not the player.
 *
 * A row carries every metric, percentile and ability score it was ranked
 * on — a few kilobytes each, and forty of them is past what browser storage
 * enjoys holding. The lists exist to be recognised and clicked, so a name,
 * a club and a crest is the whole of what they need. Anything more is
 * fetched when the profile opens.
 */
export function slim(row) {
  if (!row) return row;
  return {
    id: row.id,
    sid: row.sid,
    lid: row.lid,
    n: row.n,
    t: row.t,
    img: row.img,
    pos: row.pos,
    age: row.age,
    sc: row.sc,
    th: row.th,
  };
}

export function readShelf() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_SHELF };
    const held = JSON.parse(raw);
    /*
     * Spread over the empty shape rather than trusting what was stored. A
     * list added in a later version would be missing from an older saved
     * shelf, and every `.map` over it would then throw.
     */
    return {
      ...EMPTY_SHELF,
      ...held,
      favourites: held.favourites ?? [],
      squad: held.squad ?? [],
      history: held.history ?? [],
      searches: held.searches ?? [],
    };
  } catch {
    /* Corrupt or unavailable storage is not worth an error screen. */
    return { ...EMPTY_SHELF };
  }
}

export function writeShelf(shelf) {
  try {
    localStorage.setItem(KEY, JSON.stringify(shelf));
  } catch {
    /*
     * Quota exceeded, or storage disabled in a private window. The shelf
     * still works for this session; it simply will not be there next time,
     * which is better than an interface that stops responding.
     */
  }
}

export function clearShelf() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
