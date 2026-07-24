# Xilytics

Football scouting and analytics. Deployed on Vercel.

## Layout

```
index.html          landing page
app.html            lineup builder
formations.html     formation guide
api/                serverless functions (Node, Postgres)
scout-src/          scout app source (React + Vite)
scout/              build output — generated, do not edit
scripts/            build helpers
```

`scout/` is produced by the build. Editing it by hand is how the deployed
site and the source drift apart, which is what this layout exists to stop.

## Build

```bash
npm run build
```

Installs the scout dependencies, runs the Vite build, and copies the
output into `scout/`. Vercel runs the same command, so what deploys is
what a local build produces.

To work on the scout app:

```bash
npm run dev:scout      # http://localhost:5173
```

## Environment

Set in Vercel under Project Settings → Environment Variables:

| Variable | Used by |
|---|---|
| `DATABASE_URL` | `api/*` — Postgres connection |
| `SUPABASE_URL` | `api/_db.js` — token verification |
| `SUPABASE_ANON_KEY` | `api/_db.js` — token verification |

The scout app needs its own copy in `scout-src/.env`:

| Variable | Used by |
|---|---|
| `VITE_SUPABASE_URL` | browser — sign-in |
| `VITE_SUPABASE_ANON_KEY` | browser — sign-in |
| `DATABASE_URL` | `scout-src/scripts/load-db.mjs` only |

`VITE_` variables are compiled into the bundle and are visible to anyone
who opens the page. That is by design: row level security is what protects
the data, not the anon key. Anything that must stay secret — the database
URL, a service role key — must never carry that prefix.

`.env` files are ignored by git. They are not in the repository and should
not be.

## Database

The schema lives in `scout-src/db/`. Run `schema.sql` once in the Supabase
SQL editor; `002-rename-columns.sql` is a migration for databases created
before those columns were renamed and is safe to run twice.

Access rules are enforced by row level security rather than by the API, so
a bug in a query cannot hand over a league the caller has no claim to.

## Data

`scout_data/` holds the harvest output and is not in the repository — it is
several hundred megabytes and is regenerated rather than versioned. See
`scout-src/README.md` for how the dataset is built and loaded.

## Deploying

Push to `main` and Vercel builds it. Any other branch gets a preview
deployment, which is the place to check that `/scout/` loads, that
`/api/health` reports every variable present, and that the static pages are
untouched.
