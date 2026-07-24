# Xilytics Scout

Position-adjusted percentile analytics for footballers, built from
Sportmonks season data.

## Getting started

```bash
npm install          # once
npm run data         # turn scout_data/*.json into public/data/players.json
npm run dev          # http://localhost:5173
```

`npm run build` writes a static site to `dist/` that can be hosted
anywhere. `npm run bundle` folds that build and the data into a single
`scout.html` you can open with a double click — handy for sharing a
snapshot with someone who has no Node installed.

## Where the data comes from

`harvest.py` (kept outside this repo) pulls squads and season statistics
from the Sportmonks API and drops one JSON file per league-season into
`scout_data/`. Nothing here calls the API — `npm run data` only reads
those files, so it is safe to run as often as you like.

To change the minutes threshold:

```bash
MIN_MINUTES=600 npm run data
```

## Project layout

```
scripts/build-data.mjs    reads scout_data/, writes public/data/players.json
src/lib/metrics.js        every metric, position rule and axis set
src/lib/util.js           formatting, ranking, similarity
src/components/           Explore, Compare, Profile and their pieces
src/styles/global.css     design tokens
```

`src/lib/metrics.js` is the single source of truth. The build script
imports it, so adding a metric there is enough — no duplication.

## The three views

**Explore** ranks a whole position pool. Filter, sort any column, tick up
to six players and send them to Compare.

**Compare** stacks players on one radar and ranks them row by row. The
radar draws the first three because four shapes stop being readable; the
table shows every pick.

**Profile** opens with strengths, concerns and a data-confidence note, so
the headline reads in a few seconds. The position score expands to show
exactly which metrics produced it.

## How a score is built

Three steps, each visible in the app.

**1. Percentiles.** Every metric is ranked against players in the same
position, league and season. Metrics where a lower number is better
(dispossessed, errors, cards) are inverted first and marked with a
downward arrow.

**2. Abilities.** Each position is read through six themes — for a
centre-back: aerial, tackling, blocking, passing, progression,
discipline. A theme is the average of the percentiles inside it, so it
rests on two to four metrics rather than one. That is what the radar
draws.

**3. The score.** The abilities are combined using the weights shown next
to each one, and that figure is then ranked inside the same pool. The
ranking step matters: averaging percentiles into an ability and averaging
again into a score squeezes everyone toward the middle, so the best
centre-back in the sample came out at 72 while his own metrics ran to 99.
Ranking puts the score back on the same 0–100 footing as everything it
sits beside.

Weights above 1 mark what the position is really for; weights below 1
mark things that follow the team more than the player — a keeper's clean
sheet rate, a striker's pressing.

An ability needs two thirds of its metrics to produce a figure, and some
abilities are the position: a striker with no scoring data gets no score
at all rather than one quietly built from the other six. Around 2% of the
sample sits in that gap, shown as "no data" rather than a low number.

Open the score on any profile to see all of it: every ability, every
metric inside it, and what share of the total it carries.

A player uses 13 to 17 metrics depending on position. The score itself is
never adjusted for league strength: a 90 in one competition is not a 90 in
another, and quietly bending the headline figure would hide that.

Where leagues are mixed on screen, a separate **Adjusted** column appears
beside the score. It applies a hand-calibrated league coefficient so figures
from different competitions can be read side by side, and it is a different
model from the in-pool score — which is why it sits in its own column with
its own sort rather than being folded into the headline number. Ties on the
score are broken by the ability average, never by the adjusted figure: the
table is sorted by what the column says it is sorted by.

### How firm a score is

A percentile is only as fine as the pool behind it. Rank fifty players and
one place moves the figure two points; rank twenty and one place moves it
five, at which point neighbouring scores say nothing about each other. Pools
here run from about eleven players to a hundred, so the same number can mean
quite different things.

Every score therefore carries a confidence, taken as the lower of two things:

- **The pool.** Fifty or more is firm, twenty-eight to fifty moderate, below
  that coarse — and where it is coarse the profile shows the range the figure
  could reasonably sit in instead of pretending to a single point.
- **The position.** Some positions score more repeatably than others. Taking
  every player who stayed in the same league and position across two seasons
  and correlating the two scores gives: CM .55, DM .55, CB .53, RW .48, AM .44,
  LW .44, LB .40, RB .36, ST .27, GK .21. Strikers and keepers sit far enough
  below the rest that neither reaches the top band whatever the pool — scoring
  is lumpy, and save percentage depends on what the defence lets through.

Scores that are firm on both counts show no marker. Anything less is labelled
where it appears, and the profile says why.

Worth noting because the assumption usually runs the other way: centre-back
scores are among the steadiest here, and stay steady when the player changes
club (.52), so the measurement is following the defender rather than the side
around him. It correlates poorly with transfer fees, but that is a different
question — the market prices goals, and a centre-back's job is not to score
them.

## Filtering

The league picker takes any combination — one league, three, or all of
them — so two competitions can be put side by side without losing the
rest of the filters.

Beyond league, season, club, age and minutes, the table takes threshold
requirements. Set a floor on any of a position's six abilities — aerial
75+, scoring 70+ — and only players clearing every one of them stay in
the list. Open *go deeper* to do the same on individual metrics.

Everything is set as a percentile, so one slider means the same thing
whatever it points at, and the bar shows how many players each
combination costs: "7 of 181 match".

Requirements reset when the position changes, because an ability index
belongs to a position.

## Playing styles

The same ability scores, read through a different lens. A striker's
profile is measured against four jobs — poacher, target man, complete
forward, physical forward — and each returns two numbers:

**Fit** is how closely the shape of a player's profile matches what the
role asks for. **Level** is how good he is in the areas that role leans
on.

They are not the same question. Across the strikers in the sample, 43 of
181 sit at 80+ fit with a level under 55: exactly the right shape for a
job they are not yet good enough to do. One number would hide that.

A player is only labelled with a style when the top role clears 65 and
sits at least eight clear of the second. Otherwise he reads as fitting
two styles, or none.

All-round roles — complete forward, complete full-back — are scored on a
player's weakest ability rather than his average, because being complete
means having no hole rather than looking balanced on paper.

The weights behind each role are a reading of what the job asks for, not
something the data proved.

### League ordering

Leagues appear in standing order rather than alphabetically — the top
five first, second tiers last — because an A-to-Z list puts the
Championship above the Premier League and that is nobody's mental model.
The tiers are set in `src/lib/metrics.js` and are a reading of where these
competitions sit. Nothing in the model uses them: no score is adjusted for
league strength.

### Where he ranks

Below the metric list, every figure a player has is placed: 3rd of 40 on
non-penalty goals, 21st of 24 on saves. A percentile tells you the shape
of a distribution; a place tells you how many people are actually ahead.

The comparison set is a dropdown — his own league and season, his league
across every season we hold, the same season across every league, or one
named league. Ranking a Serie A striker against Premier League strikers
is a fair question to ask and the app will answer it, with the standing
caveat that nothing adjusts for the standard of the opposition.

Metrics where a lower figure is better are ranked accordingly, so fewest
goals conceded reads as 1st rather than last.

### Thin pools

A percentile is only as steady as the pool behind it. Sixteen attacking
midfielders in one league-season means a single place is worth six points
and one assist can move a player a long way. Where a pool holds fewer than
thirty, the other seasons of the same league are ranked alongside it — the
player still belongs to his own season, he is simply measured against a
wider set of peers doing the same job. The profile says when this has
happened.

## League levels

Nothing in the score adjusts for how hard a league is — a player is ranked
against the people he actually played against, and that is deliberate. But
the question of what a step between competitions costs is answerable, and
the answer is in the data: 727 players in this sample appear on both sides
of a transfer.

Fitting a level per league to those moves gives a scale, anchored at the
Premier League:

| League | Level | Moves behind it |
|---|---|---|
| Premier League | 0 | 148 |
| Ligue 1 | −7 | 65 |
| Bundesliga | −9 | 115 |
| LaLiga | −10 | 128 |
| Serie A | −19 | 131 |
| Süper Lig | −19 | 84 |
| Championship | −25 | 128 |
| Eredivisie | −30 | 55 |
| Serie B | −40 | 67 |
| Allsvenskan | −54 | 29 |

A profile can then ask what a season would have looked like elsewhere:
Victor Osimhen tops the Süper Lig strikers and would sit around 8th of 33
in the Premier League once the step is allowed for.

Two claims sit at different strengths, and it matters to keep them apart.
As a **ranking of leagues** the scale holds: measuring the gap between two
leagues directly, or adding it up through a third, agrees to within a few
points across sixteen checkable triangles. As a **prediction for one
player** it is weak — cross-validated on moves it had not seen, it explains
about 18% of what happens, the rest being form, age, minutes and a new
system.

So the order and the rough size of the gaps are trustworthy; any single
"he'd rank Nth over there" is a bearing, not a number. Nothing here adjusts
a score — the model still ranks each player inside his own league, and this
sits beside it as context. The *Leagues* view carries the full table and
the caveat.

### Where the model is weakest

Checked against 213 Transfermarkt valuations for wingers and strikers, the
in-pool score barely tracks the market at all, and the league-adjusted figure
tracks it noticeably better:

| | vs market value |
|---|---|
| Score (rank in pool) | +0.08 |
| Adjusted (league-weighted) | +0.21 |

That gap holds inside every age band (under-21 .05 → .20, 22-25 .13 → .29,
26-29 .05 → .16), which is the clearest evidence here that the league
coefficient carries real signal rather than noise.

An earlier version of this table reported figures per position — right wing
+0.80, centre-back −0.38 — from samples of four to seven players. Those
numbers were too small to mean anything and have been dropped. A single
player's place moves a rank correlation that size by a third.

Market value is in any case a poor yardstick for a model like this. It prices
age, contract length, and goals, and a centre-back is not paid to score. A
better internal test is whether a score repeats: take every player who stayed
in the same league and position across two seasons and correlate the two.

| Position | Year-to-year rho | n |
|---|---|---|
| Centre midfield | .55 | 485 |
| Holding midfield | .55 | 369 |
| Centre-back | .53 | 913 |
| Right wing | .48 | 236 |
| Attacking midfield | .44 | 307 |
| Left wing | .44 | 225 |
| Left back | .40 | 316 |
| Right back | .36 | 365 |
| Striker | .27 | 404 |
| Goalkeeper | .21 | 329 |

This reverses the usual worry. Centre-back scores are among the steadiest in
the tool, and hold up when the player changes club (.52), so the measurement
is following the defender rather than the team around him. The volatile ones
are strikers and keepers, and those are the two the app now marks down.

None of which means the defensive metrics are good. Defending is measured by
counting actions, and a defender at a side that dominates the ball defends
less often: Rúben Dias plays 91 passes a game and makes 4.3 defensive actions,
where a defender at a struggling side makes thirteen. Across centre-backs,
passes per 90 correlates at −0.36 with defensive actions. Dividing by
possession was tried and did not fix it — the best defending is the defending
that never has to happen, and no metric in the feed sees that. So the
defensive abilities carry less weight than they used to, and the ones least
distorted by team style carry more.

The obvious worry is that this leaves the score rewarding defenders whose
sides are overrun. Measured against how much a team keeps the ball, it does
not:

| Centre-backs, against team pass accuracy | rho |
|---|---|
| Raw defensive volume (tackles + interceptions + clearances) | −0.36 |
| Final score | +0.20 |

The distortion is real in the raw counts and gone by the time it reaches the
score, because volume sits alongside ratios — duel and aerial success, pass
accuracy, progression — that do not inflate when a side is pinned back. At
the extremes the ordering is the right way round too: 23.5% of centre-backs
at the strongest fifth of teams score 85 or above, against 8.0% at the
weakest fifth. Whatever else is wrong with measuring defenders this way, the
score is not simply counting how much work a bad team creates.

### What the score does not do

The weights are a reading of what each position is for, not something the
data proved. Where a metric says more about the team than the player — a
keeper's clean sheets, a winger's tackles — it carries a caveat you can
open in the app.

Raw counts like *dispossessed* and *fouls* are not normalised by how
often a player has the ball, because the feed carries no touch count. A
player trusted with the ball in tight spaces will look worse on these
than one who plays it safe, so those abilities are weighted down rather
than dropped.

An ability with fewer than two thirds of its metrics present is left blank
rather than guessed at, and every profile shows how much of its metric set
is covered.

Metrics that told the same story were pulled apart: shots on target no
longer sits beside expected goals, and a keeper's clean sheets and goals
conceded now count once between them.

## Sharing a view

Filters live in the address bar. Narrow the table down to under-23
centre-backs who pass at the 70th percentile and the URL says so:

```
#pos=CB&ageHi=23&ab=3:70
```

Send that link and it opens on the same view. A profile carries its own
link too. Only what differs from the defaults is written, so the URL
stays short, and it uses `replaceState` rather than `pushState` — a
slider nudge should not become a back-button step.

### Where the definitions live

`src/lib/metrics.js` holds the themes, the weights and the metric
library. Change a weight there, run `npm run data`, and the whole app
follows.

## Known gaps

The Sportmonks feed carries no market value, contract dates, preferred
foot or team possession share, so anything built on those is out of reach
for now. Transfer fees and rumours are available and not yet wired in.

## Running it

The repository ships without data, because the harvest is yours to run. Three
ways to get a working app, in order of effort:

**Open the snapshot.** `demo/scout.html` is the whole app and a full dataset
folded into one file. Double-click it — no install, no server. Fonts and
player images come from the web, so offline it falls back to system type and
blank crests; everything else works.

**Serve the build.** `dist/` is a production build. Any static server will do:

```bash
npx serve dist
```

**Run from source.** Needs Node 18+:

```bash
npm install
npm run data     # reads scout_data/, writes public/data/players.json
npm run dev
```

`npm run data` expects the harvest output in `scout_data/`. Without it the app
loads but finds nothing to show. To rebuild the single file after new data:

```bash
npm run data && npm run build && npm run bundle
```
