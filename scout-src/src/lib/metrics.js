/**
 * Every metric the app knows about, and how each position is judged.
 * This file is the single source of truth — the data script reads it too.
 */

export const POSITIONS = {
  GK: "Goalkeepers",
  CB: "Centre-backs",
  RB: "Right-backs",
  LB: "Left-backs",
  DM: "Defensive midfielders",
  CM: "Central midfielders",
  AM: "Attacking midfielders",
  RW: "Right wingers",
  LW: "Left wingers",
  ST: "Strikers",
};

export const ORDER = ["GK", "CB", "RB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"];

/*
 * Hand-calibrated league strength, Premier League = 1.00. Only the leagues
 * listed here get a level-adjusted score; anything absent is left on its own
 * in-pool score (sc2 == sc). These are a starting calibration — refine them
 * against your own post-transfer data over time.
 */
export const LEAGUE_COEF = {
  8: 1.00, 564: 0.94, 384: 0.90, 82: 0.89, 301: 0.84, 307: 0.84,
  648: 0.72, 72: 0.70, 462: 0.68, 636: 0.66, 208: 0.64, 600: 0.62,
  9: 0.60, 944: 0.60, 743: 0.58, 181: 0.55, 591: 0.55, 85: 0.55,
  567: 0.55, 968: 0.55, 486: 0.54, 271: 0.53, 387: 0.52, 453: 0.50,
  304: 0.50, 573: 0.48, 444: 0.48, 501: 0.47, 244: 0.42, 12: 0.42,

  /*
   * The second harvest. Unlike the figures above — which were calibrated
   * against transfer outcomes — these are judged from continental standing
   * and the level of club that buys from each competition. They are honest
   * starting points, not measurements, and the adjusted score built on them
   * should be read as a rough bearing until enough moves accumulate to fit
   * them properly.
   */
  779: 0.56,   // MLS
  325: 0.52,   // Greece
  1034: 0.50,  // K League 1
  262: 0.50,   // Czechia
  609: 0.48,   // Ukraine
  531: 0.46,   // Serbia
  474: 0.45,   // Romania
  959: 0.45,   // UAE
  938: 0.44,   // Qatar
  672: 0.44,   // Colombia
  902: 0.42,   // Iran
  651: 0.42,   // Brazil second tier
  465: 0.42,   // Portugal second tier
  74:  0.40,   // Netherlands second tier
  211: 0.40,   // Belgium second tier
  603: 0.40,   // Turkey second tier
  770: 0.40,   // Uruguay
  663: 0.40,   // Chile
  274: 0.38,   // Denmark first division
  184: 0.36,   // Austria second tier
  579: 0.36,   // Sweden second tier
  292: 0.36,   // Finland
  1356: 0.36,  // A-League Men
  229: 0.34,   // Bulgaria
  830: 0.34,   // Egypt
  806: 0.32,   // South Africa
  755: 0.30,   // Paraguay
};

/*
 * A-League Women (1583) is deliberately absent. A coefficient here means
 * "how a score translates to the Premier League", and women's football is a
 * separate competition rather than a weaker version of the men's game, so
 * any number placed on that scale would assert something the data cannot
 * support. Without an entry the adjusted score simply equals the in-pool
 * score, which is the honest answer: ranked among her peers, not converted
 * to somebody else's league.
 */

/*
 * A single coefficient can't hit every metric the same way. Attacking output
 * inflates in a weak league (pull it down when converting up); defensive
 * volume rises in a weak league (treat inverted); ratio metrics barely move.
 * Each metric carries [beta, invert]: beta is how league-sensitive it is
 * (1 full, 0 untouched), keyed by the feed stat name (a metric's `key`).
 * Adjusted = raw * (coef_source / coef_target) ** beta, inverted for volume.
 */
export const METRIC_BETA = {
  "Goals": [1.00, false],
  "Expected Goals (xG)": [0.90, false],
  "Assists": [0.90, false],
  "Shots Total": [0.70, false],
  "Shots On Target": [0.75, false],
  "Big Chances Created": [0.85, false],
  "Key Passes": [0.70, false],
  "Successful Dribbles": [0.65, false],
  "Through Balls": [0.60, false],
  "Accurate Crosses": [0.55, false],
  "Tackles": [0.55, true],
  "Interceptions": [0.55, true],
  "Clearances": [0.45, true],
  "Blocked Shots": [0.45, true],
  "Duels Won": [0.50, true],
  "Aerials Won": [0.45, true],
  "Accurate Passes Percentage": [0.30, false],
  "Rating": [0.00, false],
  "_default": [0.60, false],
};

/** First rule that matches the API's detailed position name wins. */
export const NAME_RULES = [
  ["GK", ["goalkeeper", "keeper"]],
  ["CB", ["centre back", "center back", "centre-back", "center-back",
          "central defender", "centre half", "center half"]],
  ["RB", ["right back", "right-back", "right wing back", "right wing-back"]],
  ["LB", ["left back", "left-back", "left wing back", "left wing-back"]],
  ["DM", ["defensive midfield", "defensive-midfield", "holding midfield", "anchor"]],
  ["AM", ["attacking midfield", "attacking-midfield", "second striker",
          "secondary striker", "playmaker"]],
  ["RW", ["right wing", "right-wing", "right winger", "right midfield"]],
  ["LW", ["left wing", "left-wing", "left winger", "left midfield"]],
  ["CM", ["central midfield", "centre midfield", "center midfield", "midfield"]],
  ["ST", ["centre forward", "center forward", "striker", "forward", "attacker"]],
  ["RB", ["right"]],
  ["LB", ["left"]],
  ["CB", ["defender", "defence", "defense", "back"]],
];

/**
 * Metric groups shown on a profile.
 * kind: p90 | pct | raw | tot | xgd
 * invert: true when a lower raw number is the better outcome
 * floorBy / floorMinPct: for invert metrics that can be gamed by inactivity —
 *   if the player's volume in `floorBy` sits below `floorMinPct`, the reward
 *   is capped at the midpoint, so "barely competed" cannot read as "clean".
 */
export const GROUPS = [
  ["Attacking", [
    { label: "Non-penalty goals",   kind: "p90", key: "__npg" },
    { label: "Expected goals",      kind: "p90", key: "__xg" },
    { label: "Finishing edge",      kind: "xgd" },
    { label: "Assists",             kind: "p90", key: "Assists" },
    { label: "Shots",               kind: "p90", key: "Shots Total" },
    { label: "Shots on target",     kind: "p90", key: "Shots On Target" },
    { label: "Shot accuracy",       kind: "pct", key: "Shots On Target", of: "Shots Total" },
    { label: "Big chances missed",  kind: "p90", key: "Big Chances Missed", invert: true },
    { label: "Offsides",            kind: "p90", key: "Offsides", invert: true },
    { label: "Woodwork",            kind: "tot", key: "Hit Woodwork" },
  ]],
  ["Passing", [
    { label: "Passes",              kind: "p90", key: "Passes" },
    { label: "Pass accuracy",       kind: "raw", key: "Accurate Passes Percentage" },
    { label: "Key passes",          kind: "p90", key: "Key Passes" },
    { label: "Big chances created", kind: "p90", key: "Big Chances Created" },
    { label: "Through balls",       kind: "p90", key: "Through Balls" },
    { label: "Through balls won",   kind: "p90", key: "Through Balls Won" },
    { label: "Crosses",             kind: "p90", key: "Total Crosses" },
    { label: "Accurate crosses",    kind: "p90", key: "Accurate Crosses" },
    { label: "Cross accuracy",      kind: "pct", key: "Accurate Crosses", of: "Total Crosses" },
    { label: "Long balls",          kind: "p90", key: "Long Balls" },
    { label: "Long ball success",   kind: "pct", key: "Long Balls Won", of: "Long Balls" },
  ]],
  ["On the ball", [
    { label: "Dribbles attempted",  kind: "p90", key: "Dribble Attempts" },
    { label: "Dribbles completed",  kind: "p90", key: "Successful Dribbles" },
    { label: "Dribble success",     kind: "pct", key: "Successful Dribbles", of: "Dribble Attempts" },
    { label: "Dispossessed",        kind: "p90", key: "Dispossessed", invert: true,
      floorBy: "Total Duels", floorMinPct: 20 },
    { label: "Duels",               kind: "p90", key: "Total Duels" },
    { label: "Duels won",           kind: "pct", key: "Duels Won", of: "Total Duels" },
    { label: "Aerials won",         kind: "p90", key: "Aerials Won" },
    { label: "Fouls drawn",         kind: "p90", key: "Fouls Drawn" },
  ]],
  ["Defending", [
    { label: "Tackles",             kind: "p90", key: "Tackles" },
    { label: "Interceptions",       kind: "p90", key: "Interceptions" },
    { label: "Clearances",          kind: "p90", key: "Clearances" },
    { label: "Blocked shots",       kind: "p90", key: "Blocked Shots" },
    { label: "Crosses blocked",     kind: "p90", key: "Crosses Blocked" },
    { label: "Dribbled past",       kind: "p90", key: "Dribbled Past", invert: true,
      floorBy: "Total Duels", floorMinPct: 20 },
    { label: "Fouls committed",     kind: "p90", key: "Fouls", invert: true,
      floorBy: "Total Duels", floorMinPct: 20 },
    { label: "Errors to goal",      kind: "p90", key: "Error Lead To Goal", invert: true },
  ]],
  ["Goalkeeping", [
    { label: "Save percentage",     kind: "save%" },
    { label: "Saves",               kind: "p90", key: "Saves" },
    { label: "Saves in the box",    kind: "p90", key: "Saves Insidebox" },
    { label: "In-box save share",   kind: "pct", key: "Saves Insidebox", of: "Saves" },
    { label: "Goals conceded",      kind: "p90", key: "Goals Conceded", invert: true },
    { label: "Clean sheet rate",    kind: "pct", key: "Cleansheets", of: "Appearances" },
    { label: "Penalties saved",     kind: "tot", key: "__pensaved" },
  ]],
  ["Team context", [
    { label: "Team goals conceded", kind: "p90", key: "Goals Conceded", invert: true },
    { label: "Team clean sheets",   kind: "pct", key: "Cleansheets", of: "Appearances" },
    { label: "Team wins",           kind: "tot", key: "Team Wins" },
  ]],
  ["Discipline", [
    { label: "Yellow cards",        kind: "p90", key: "Yellowcards", invert: true },
    { label: "Red cards",           kind: "tot", key: "Redcards", invert: true },
    { label: "Second yellows",      kind: "tot", key: "Yellowred Cards", invert: true },
    { label: "Own goals",           kind: "tot", key: "Own Goals", invert: true },
  ]],
];

/** Groups only relevant to certain positions. */
export const GROUP_SCOPE = {
  Goalkeeping: ["GK"],
  "Team context": ["GK"],
};

/**
 * Each position is read through six themes. A theme groups the metrics
 * that answer one question about a player — "can he win it in the air",
 * "does he move the ball forward" — so the radar stays readable while the
 * score underneath it rests on far more evidence than six numbers.
 *
 * weight defaults to 1. It drops below 1 where a metric says more about
 * the team than the player.
 */
export const THEMES = {
  GK: [
    { name: "Shot stopping", weight: 1.6,
      metrics: ["Save percentage"],
      note: "Share of shots faced that were kept out. It does not know how "
          + "hard those shots were, so a keeper behind a leaky defence and "
          + "one behind a good defence are not on level terms." },
    { name: "Distribution", weight: 1.2,
      metrics: ["Pass accuracy", "Long ball success"] },
    { name: "Errors", weight: 0.8,
      metrics: ["Errors to goal"],
      note: "Mistakes that led straight to a goal. These are rare enough "
          + "that one of them moves the figure a long way, which is why it "
          + "counts for less than shot stopping." },
    { name: "Area activity", weight: 1,
      metrics: ["Clearances", "Aerials won", "Duels won"],
      note: "Work outside the six-yard box. The feed has no sweeper metrics, "
          + "so this is activity rather than range." },
    { name: "Team record", weight: 0.5,
      metrics: ["Goals conceded", "Clean sheet rate"],
      note: "Follows the defence in front of the keeper as much as the keeper. "
          + "The two move together, so they count once between them." },
    { name: "Shot profile", weight: 0.4,
      metrics: ["Saves", "In-box save share", "Passes", "Long balls"],
      note: "How busy the keeper is and how close the shots come from. "
          + "A high in-box share means he faces more from close range, not "
          + "that he is better — this is context, not quality." },
  ],

  CB: [
    { name: "Aerial", weight: 1.3, metrics: ["Aerials won", "Duels won"] },
    { name: "Tackling", weight: 0.9, metrics: ["Tackles", "Interceptions"],
      note: "Counts challenges won, not danger avoided. A defender at a side "
          + "that keeps the ball spends less time defending and registers "
          + "fewer of these, which is why the best-known names often sit in "
          + "the middle of this column rather than the top." },
    { name: "Blocking", weight: 0.7, metrics: ["Clearances", "Blocked shots"],
      note: "Also a count. A team defending a deep block produces far more "
          + "of both than one pressing high up the pitch." },
    { name: "Passing", weight: 1.3, metrics: ["Pass accuracy", "Long ball success"] },
    { name: "Progression", weight: 1.2,
      metrics: ["Long balls", "Dribbles completed", "Key passes"] },
    { name: "Discipline", weight: 0.8,
      metrics: ["Dribbled past", "Fouls committed", "Yellow cards"],
      note: "Raw counts, not rates — a defender who competes more will "
          + "naturally register more of all three." },
  ],

  RB: [
    { name: "Crossing", weight: 1.2, metrics: ["Accurate crosses", "Cross accuracy"] },
    { name: "Creation", weight: 1.2,
      metrics: ["Key passes", "Assists", "Big chances created"] },
    { name: "Carrying", weight: 1, metrics: ["Dribbles completed", "Dribble success"] },
    { name: "Defending", weight: 1,
      metrics: ["Tackles", "Interceptions", "Clearances", "Blocked shots"],
      note: "This counts defensive actions rather than judging them. A team "
          + "that defends deep gives its full-backs more of all four, which "
          + "is why it carries less weight than the attacking side of the "
          + "job." },
    { name: "Duels", weight: 1, metrics: ["Duels won", "Aerials won"] },
    { name: "Security", weight: 0.8,
      metrics: ["Dribbled past", "Dispossessed", "Fouls committed"],
      note: "Raw counts. A full-back who carries the ball more will lose it "
          + "more, so read this next to Carrying." },
  ],

  LB: [
    { name: "Crossing", weight: 1.2, metrics: ["Accurate crosses", "Cross accuracy"] },
    { name: "Creation", weight: 1.2,
      metrics: ["Key passes", "Assists", "Big chances created"] },
    { name: "Carrying", weight: 1, metrics: ["Dribbles completed", "Dribble success"] },
    { name: "Defending", weight: 1,
      metrics: ["Tackles", "Interceptions", "Clearances", "Blocked shots"],
      note: "This counts defensive actions rather than judging them. A team "
          + "that defends deep gives its full-backs more of all four, which "
          + "is why it carries less weight than the attacking side of the "
          + "job." },
    { name: "Duels", weight: 1, metrics: ["Duels won", "Aerials won"] },
    { name: "Security", weight: 0.8,
      metrics: ["Dribbled past", "Dispossessed", "Fouls committed"],
      note: "Raw counts. A full-back who carries the ball more will lose it "
          + "more, so read this next to Carrying." },
  ],

  DM: [
    { name: "Ball winning", weight: 1.2, metrics: ["Tackles", "Interceptions"],
      note: "How often he wins it back, which rises when his team has the "
          + "ball less. It says nothing about where on the pitch, or whether "
          + "the ball needed winning at all." },
    { name: "Passing", weight: 1.3, metrics: ["Pass accuracy", "Long ball success"] },
    { name: "Ball carrying", weight: 0.9,
      metrics: ["Dribbles completed", "Fouls drawn"],
      note: "Take-ons completed, plus fouls won as a rough stand-in for "
          + "surviving pressure. The second is indirect — a player can win "
          + "fouls without ever carrying the ball." },
    { name: "Screening", weight: 1.1, metrics: ["Clearances", "Blocked shots"] },
    { name: "Aerial", weight: 1, metrics: ["Aerials won", "Duels won"] },
    { name: "Security", weight: 0.8,
      metrics: ["Dispossessed", "Fouls committed", "Dribbled past"],
      note: "Raw counts, not rates — a midfielder who takes the ball more "
          + "often will lose it more often." },
    { name: "Involvement", weight: 0.6,
      metrics: ["Passes", "Long balls", "Key passes"],
      note: "Volume follows how much the ball comes through this player's zone." },
  ],

  CM: [
    { name: "Creation", weight: 1.3,
      metrics: ["Key passes", "Big chances created", "Assists"],
      metricWeights: { "Assists": 0.6 } },
    { name: "Passing", weight: 1.2, metrics: ["Pass accuracy", "Long ball success"] },
    { name: "Defending", weight: 1.2,
      metrics: ["Tackles", "Interceptions", "Aerials won", "Blocked shots"] },
    { name: "Carrying", weight: 1.1,
      metrics: ["Dribbles completed", "Dribble success"] },
    { name: "Security", weight: 0.8,
      metrics: ["Dispossessed", "Dribbled past", "Fouls committed"],
      note: "Raw counts, not rates — the more a midfielder touches the ball, "
          + "the more of these he will register." },
    { name: "Involvement", weight: 0.6,
      metrics: ["Passes", "Long balls", "Crosses"],
      note: "Volume follows the team's shape more than the player's quality." },
  ],

  AM: [
    { name: "Creation", weight: 1.5,
      metrics: ["Key passes", "Big chances created", "Assists"],
      /* an assist needs someone else to finish, so it counts for less */
      metricWeights: { "Assists": 0.6 } },
    { name: "Scoring", weight: 1.3, metrics: ["Non-penalty goals", "Expected goals"] },
    { name: "Carrying", weight: 1.2,
      metrics: ["Dribbles completed", "Dribble success"] },
    { name: "Delivery", weight: 0.8,
      metrics: ["Accurate crosses", "Cross accuracy"],
      /* a central number ten does not cross; judging him on it compares
         two different jobs, so the axis is skipped when the volume says
         crossing is not part of his game */
      onlyIf: { metric: "Crosses", minPercentile: 33 },
      note: "Skipped for players who rarely attempt a cross — a central "
          + "playmaker is not doing the job badly, he is doing a different "
          + "job." },
    { name: "Physical involvement", weight: 0.9,
      metrics: ["Fouls drawn", "Duels won", "Aerials won"],
      note: "How often this player is fouled, wins his contests and competes "
          + "in the air — a rough read on holding the ball under contact." },
    { name: "Defensive work", weight: 0.6,
      metrics: ["Interceptions", "Tackles"],
      note: "Tackles and interceptions only. The feed carries no pressing "
          + "data, so this is not a measure of how hard a player works." },
    { name: "Efficiency", weight: 0.8,
      metrics: ["Dispossessed", "Big chances missed", "Offsides"],
      note: "Three ways of wasting a moment: losing the ball, missing a "
          + "clear chance, straying offside. Raw counts, so a player given "
          + "the ball in tight spaces will register more of the first." },
  ],

  RW: [
    { name: "Scoring", weight: 1.4,
      metrics: ["Non-penalty goals", "Expected goals"] },
    { name: "Creation", weight: 1.4,
      metrics: ["Key passes", "Big chances created", "Assists"],
      metricWeights: { "Assists": 0.6 } },
    { name: "Dribbling", weight: 1.2,
      metrics: ["Dribbles completed", "Dribble success"] },
    { name: "Delivery", weight: 1, metrics: ["Accurate crosses", "Cross accuracy"] },
    { name: "Physical", weight: 0.6,
      metrics: ["Aerials won", "Fouls drawn"],
      note: "Winning headers and drawing fouls — the part of wide play that "
          + "is not about beating a man." },
    { name: "Defensive work", weight: 0.7,
      metrics: ["Tackles", "Interceptions"],
      note: "Tackles and interceptions only. The feed carries no pressing "
          + "data, so this is not a measure of pressing." },
    { name: "Efficiency", weight: 0.8,
      metrics: ["Dispossessed", "Big chances missed", "Offsides"],
      note: "Three ways of wasting a moment: losing the ball, missing a "
          + "clear chance, straying offside. Raw counts, so a winger who "
          + "takes players on will register more of the first." },
  ],

  LW: [
    { name: "Scoring", weight: 1.4,
      metrics: ["Non-penalty goals", "Expected goals"] },
    { name: "Creation", weight: 1.4,
      metrics: ["Key passes", "Big chances created", "Assists"],
      metricWeights: { "Assists": 0.6 } },
    { name: "Dribbling", weight: 1.2,
      metrics: ["Dribbles completed", "Dribble success"] },
    { name: "Delivery", weight: 1, metrics: ["Accurate crosses", "Cross accuracy"] },
    { name: "Physical", weight: 0.6,
      metrics: ["Aerials won", "Fouls drawn"],
      note: "Winning headers and drawing fouls — the part of wide play that "
          + "is not about beating a man." },
    { name: "Defensive work", weight: 0.7,
      metrics: ["Tackles", "Interceptions"],
      note: "Tackles and interceptions only. The feed carries no pressing "
          + "data, so this is not a measure of pressing." },
    { name: "Efficiency", weight: 0.8,
      metrics: ["Dispossessed", "Big chances missed", "Offsides"],
      note: "Three ways of wasting a moment: losing the ball, missing a "
          + "clear chance, straying offside. Raw counts, so a winger who "
          + "takes players on will register more of the first." },
  ],

  ST: [
    { name: "Scoring", weight: 2,
      metrics: ["Non-penalty goals", "Expected goals"],
      note: "Goals scored and the quality of the chances taken. Shots on "
          + "target sits under Chance volume so the same story is not "
          + "counted twice." },
    { name: "Finishing", weight: 1.4,
      metrics: ["Finishing edge", "Shot accuracy"] },
    { name: "Chance volume", weight: 1.1,
      metrics: ["Shots", "Big chances missed"],
      note: "How often he gets a sight of goal, set against how many clear "
          + "ones he wastes. A high figure means plenty of shots without "
          + "squandering the good ones." },
    { name: "Aerial", weight: 1, metrics: ["Aerials won", "Duels won"] },
    { name: "Link play", weight: 1,
      metrics: ["Key passes", "Assists", "Big chances created"] },
    { name: "Carrying", weight: 0.9,
      metrics: ["Dribbles completed", "Dribble success", "Dispossessed"],
      note: "Running at defenders is a real part of some strikers' games and "
          + "no part of others'. It counts, but less than putting the ball "
          + "in the net." },
    { name: "Physical involvement", weight: 0.5,
      metrics: ["Fouls drawn", "Tackles"],
      note: "Fouls won and tackles made. Neither measures pressing, which "
          + "the feed does not carry." },
    { name: "Work rate", weight: 0,
      metrics: ["Tackles", "Interceptions"],
      note: "Defensive graft: tackles and interceptions, the same pair the "
          + "wide roles are read on. Carried at zero weight so it shows as "
          + "a reading without moving the score — a striker is not judged on "
          + "this, but it is worth seeing." },
  ],
};

/**
 * Table columns, one per radar theme so the six-column view mirrors the
 * wheel rather than repeating it. Two kinds of entry:
 *
 *   "Metric name"      a single raw metric — shown as its own figure and
 *                      percentile, the way the table always worked.
 *   { theme: "Name" }  the whole ability — shown as the theme score, with
 *                      its sub-metrics opening in a strip under the row.
 *
 * A theme is used where one metric misreads the ability: an all-round
 * scorer whose "Aerials won" is 1 but whose Aerial theme is mid-table
 * because he wins his ground duels. A single raw metric stays where it
 * already tells the whole story (Save %, Dispossessed, Shots).
 */
export const COLUMNS = {
  GK: ["Save percentage", { theme: "Distribution" }, { theme: "Area activity" },
       { theme: "Team record" }, "Errors to goal", "Pass accuracy"],
  CB: [{ theme: "Aerial" }, { theme: "Tackling" }, { theme: "Passing" },
       { theme: "Progression" }, "Clearances", "Dribbled past"],
  RB: [{ theme: "Crossing" }, { theme: "Creation" }, { theme: "Defending" },
       "Dribbles completed", "Duels won", "Dispossessed"],
  LB: [{ theme: "Crossing" }, { theme: "Creation" }, { theme: "Defending" },
       "Dribbles completed", "Duels won", "Dispossessed"],
  DM: [{ theme: "Ball winning" }, { theme: "Passing" }, { theme: "Aerial" },
       "Clearances", "Dispossessed", { theme: "Ball carrying" }],
  CM: [{ theme: "Creation" }, "Pass accuracy", { theme: "Defending" },
       "Dribbles completed", "Dispossessed", { theme: "Involvement" }],
  AM: [{ theme: "Creation" }, { theme: "Scoring" }, "Dribbles completed",
       "Accurate crosses", { theme: "Physical involvement" }, "Dispossessed"],
  RW: [{ theme: "Scoring" }, { theme: "Creation" }, "Dribbles completed",
       "Accurate crosses", { theme: "Defensive work" }, "Dispossessed"],
  LW: [{ theme: "Scoring" }, { theme: "Creation" }, "Dribbles completed",
       "Accurate crosses", { theme: "Defensive work" }, "Dispossessed"],
  /*
   * Shots is not a column here. It still feeds the score — Chance volume
   * is built on it — but as a column it repeated what Scoring already
   * says, and the striker table was the widest of the ten. Cutting it
   * costs nothing a reader was using and buys the room the adjusted
   * score needs.
   */
  ST: [{ theme: "Scoring" }, "Finishing edge",
       { theme: "Aerial" }, { theme: "Link play" },
       { theme: "Physical involvement" }, { theme: "Work rate" }],
};

/** Every metric a position uses, flattened out of its themes. */
export function metricsFor(position) {
  const seen = new Set();
  for (const theme of THEMES[position] || []) {
    for (const m of theme.metrics) seen.add(m);
  }
  return [...seen];
}

/** Column abbreviations, kept distinct so no two metrics collide. */
/**
 * Column headings. Short enough to fit, long enough to read — the unit
 * sits underneath so nobody has to guess whether a number is a rate or
 * a share.
 */
export const SHORT = {
  "Non-penalty goals": "Goals",
  "Expected goals": "xG",
  "Finishing edge": "Finishing",
  "Shot accuracy": "On target",
  "Shots": "Shots",
  "Shots on target": "On target",
  "Aerials won": "Aerials",
  "Duels won": "Duels",
  "Duels": "Duels",
  "Big chances created": "Big chances",
  "Big chances missed": "Missed",
  "Clearances": "Clearances",
  "Blocked shots": "Blocks",
  "Shots blocked": "Blocks",
  "Tackles": "Tackles",
  "Pass accuracy": "Passing",
  "Passes": "Passes",
  "Dribbled past": "Beaten",
  "Accurate crosses": "Crosses",
  "Cross accuracy": "Cross acc.",
  "Crosses": "Cross att.",
  "Dribbles completed": "Dribbles",
  "Dribble success": "Dribble %",
  "Key passes": "Key passes",
  "Interceptions": "Intercept.",
  "Through balls": "Through",
  "Dispossessed": "Lost ball",
  "Save percentage": "Save %",
  "Saves": "Saves",
  "Saves in the box": "Box saves",
  "In-box save share": "Box share",
  "Goals conceded": "Conceded",
  "Clean sheet rate": "Clean sheets",
  "Long ball success": "Long balls",
  "Long balls": "Long att.",
  "Errors to goal": "Errors",
  "Assists": "Assists",
  "Fouls drawn": "Fouls won",
  "Fouls committed": "Fouls",
  "Yellow cards": "Yellows",
  "Offsides": "Offside",
};

/**
 * What each figure is measured in, shown under the column heading so a
 * reader never has to work out whether 0.82 is a rate or a percentage.
 */
export const UNITS = {
  p90: "per 90",
  pct: "%",
  raw: "%",
  tot: "season",
  xgd: "per 90",
  "save%": "%",
};

/** Plain-language help for column headers. */
export const HELP = {
  "Non-penalty goals": "Goals from open play and set pieces, penalties excluded.",
  "Expected goals": "The quality of chances taken, in goals.",
  "Finishing edge": "Goals scored minus expected goals. Positive means over-performing.",
  "Shot accuracy": "Share of shots that hit the target.",
  "Shots": "Attempts at goal.",
  "Aerials won": "Headers won against an opponent.",
  "Duels won": "Share of one-on-one contests won, on the ground and in the air.",
  "Big chances created": "Passes that set up a clear scoring opportunity.",
  "Clearances": "Balls hacked away from danger.",
  "Blocked shots": "Opposition shots blocked.",
  "Tackles": "Successful challenges that win the ball.",
  "Pass accuracy": "Share of passes that find a team-mate.",
  "Dribbled past": "Times an opponent beat this player one-on-one. Lower is better.",
  "Accurate crosses": "Crosses that reach a team-mate.",
  "Cross accuracy": "Share of crosses that find a team-mate.",
  "Dribbles completed": "Take-ons that beat an opponent.",
  "Key passes": "Passes that lead directly to a shot.",
  "Interceptions": "Opposition passes cut out.",
  "Through balls": "Passes played behind the defensive line.",
  "Dispossessed": "Times the ball was taken off this player. Lower is better.",
  "Dribble success": "Share of take-ons that come off.",
  "Save percentage": "Share of shots on target that were kept out.",
  "Saves": "Shots kept out. Volume follows how exposed the defence is.",
  "In-box save share": "Share of saves made from inside the penalty area.",
  "Goals conceded": "Goals let in. Lower is better.",
  "Clean sheet rate": "Share of appearances without conceding.",
  "Long ball success": "Share of long passes that find a team-mate.",
  "Errors to goal": "Mistakes that led directly to a goal. Lower is better.",
  "Assists": "Passes that led to a goal.",
};

/** Sportmonks league ids, with a short code and a colour for each. */
/**
 * Leagues, with a short code, a colour and a standing.
 *
 * `tier` orders the lists a reader sees, because alphabetical order puts
 * the Championship above the Premier League and that is nobody's mental
 * model. `rank` sorts within a tier. Both are a reading of where these
 * competitions sit, not a coefficient applied to anyone's score — the
 * model never adjusts for league strength.
 *
 *   1  the five that set the standard
 *   2  strong national leagues below them
 *   3  competitive leagues with a smaller top end
 *   4  second tiers
 */
export const LEAGUES = {
  8:   { code: "PL",   hue: "#B14EFF", tier: 1, rank: 1, iso: "en", name: "Premier League" },
  564: { code: "LAL",  hue: "#FF9E2C", tier: 1, rank: 2, iso: "es", name: "LaLiga" },
  384: { code: "SA",   hue: "#3D8BFF", tier: 1, rank: 3, iso: "it", name: "Serie A" },
  82:  { code: "BUN",  hue: "#FF4B4B", tier: 1, rank: 4, iso: "de", name: "Bundesliga" },
  301: { code: "L1",   hue: "#4DD8FF", tier: 1, rank: 5, iso: "fr", name: "Ligue 1" },

  462: { code: "POR",  hue: "#5FD36A", tier: 2, rank: 1, iso: "pt", name: "Liga Portugal" },
  72:  { code: "ERE",  hue: "#FF7A29", tier: 2, rank: 2, iso: "nl", name: "Eredivisie" },
  208: { code: "BEL",  hue: "#E8543F", tier: 2, rank: 3, iso: "be", name: "Belgian Pro League" },
  600: { code: "SL",   hue: "#00D4C8", tier: 2, rank: 4, iso: "tr", name: "Süper Lig" },
  648: { code: "BRA",  hue: "#FFD93D", tier: 2, rank: 5, iso: "br", name: "Brasileirão" },
  636: { code: "ARG",  hue: "#7DD3E0", tier: 2, rank: 6, iso: "ar", name: "Liga Profesional" },
  944: { code: "SAU",  hue: "#4FBF7B", tier: 2, rank: 7, iso: "sa", name: "Saudi Pro League" },
  743: { code: "MX",   hue: "#3FA34D", tier: 2, rank: 8, iso: "mx", name: "Liga MX" },
  968: { code: "J1",   hue: "#E45C6E", tier: 2, rank: 9, iso: "jp", name: "J1 League" },

  271: { code: "DEN",  hue: "#E86A7C", tier: 3, rank: 1, iso: "dk", name: "Danish Superliga" },
  181: { code: "AUT",  hue: "#F08A6C", tier: 3, rank: 2, iso: "at", name: "Austrian Bundesliga" },
  501: { code: "SCO",  hue: "#5C7CFA", tier: 3, rank: 3, iso: "sco", name: "Scottish Premiership" },
  573: { code: "SWE",  hue: "#63C7D6", tier: 3, rank: 4, iso: "se", name: "Allsvenskan" },
  486: { code: "RUS",  hue: "#9C6ADE", tier: 3, rank: 5, iso: "ru", name: "Russian Premier League" },
  307: { code: "CDF",  hue: "#6C8AE4", tier: 3, rank: 6, iso: "fr", name: "Coupe de France" },

  9:   { code: "CHA",  hue: "#8E7CC3", tier: 4, rank: 1, iso: "en", name: "Championship" },
  387: { code: "SB",   hue: "#7BA9E8", tier: 4, rank: 2, iso: "it", name: "Serie B" },
  567: { code: "LL2",  hue: "#FFC078", tier: 4, rank: 3, iso: "es", name: "LaLiga 2" },
  85:  { code: "BU2",  hue: "#FF8A8A", tier: 4, rank: 4, iso: "de", name: "2. Bundesliga" },
  12:  { code: "L1E",  hue: "#B0A0D0", tier: 4, rank: 5, iso: "en", name: "League One" },
  304: { code: "L2",   hue: "#6FB7E0", tier: 4, rank: 6, iso: "fr", name: "Ligue 2" },

  591: { code: "SUI",  hue: "#E8607A", tier: 3, rank: 7, iso: "ch", name: "Swiss Super League" },
  244: { code: "HNL",  hue: "#E85C5C", tier: 3, rank: 8, iso: "hr", name: "1. HNL" },
  453: { code: "EKS",  hue: "#E0A85C", tier: 3, rank: 9, iso: "pl", name: "Ekstraklasa" },
  444: { code: "ELI",  hue: "#5CB8E0", tier: 3, rank: 10, iso: "no", name: "Eliteserien" },

  /*
   * Added with the second harvest. Tier and coefficient here are judged
   * rather than solved: there are too few transfers between these and the
   * leagues already held to fit a level the way solveLeagueLevels does for
   * the rest. They are placed by continental standing and the level of side
   * that recruits from them, and should be revisited once enough moves have
   * accumulated to measure.
   */
  779:  { code: "MLS",  hue: "#4A9BD4", tier: 2, rank: 10, iso: "us", name: "Major League Soccer" },
  1034: { code: "KL1",  hue: "#D45C7A", tier: 3, rank: 11, iso: "kr", name: "K League 1" },
  325:  { code: "GRE",  hue: "#5B9BD5", tier: 3, rank: 12, iso: "gr", name: "Super League (GRE)" },
  609:  { code: "UKR",  hue: "#E8C55C", tier: 3, rank: 13, iso: "ua", name: "Premier League (UKR)" },
  531:  { code: "SRB",  hue: "#C05C7A", tier: 3, rank: 14, iso: "rs", name: "Super Liga (SRB)" },
  474:  { code: "ROU",  hue: "#D4A05C", tier: 3, rank: 15, iso: "ro", name: "Superliga (ROU)" },
  262:  { code: "CZE",  hue: "#7AC05C", tier: 3, rank: 16, iso: "cz", name: "Chance Liga" },
  938:  { code: "QAT",  hue: "#A05CC0", tier: 3, rank: 17, iso: "qa", name: "Stars League" },
  959:  { code: "UAE",  hue: "#5CC0A0", tier: 3, rank: 18, iso: "ae", name: "UAE Pro League" },
  672:  { code: "COL",  hue: "#E8B45C", tier: 3, rank: 19, iso: "co", name: "Liga BetPlay" },
  902:  { code: "IRN",  hue: "#5CA0C0", tier: 3, rank: 20, iso: "ir", name: "Persian Gulf Pro League" },

  211:  { code: "BE2",  hue: "#C08A5C", tier: 4, rank: 7, iso: "be", name: "Challenger Pro League" },
  465:  { code: "PO2",  hue: "#7AD48A", tier: 4, rank: 8, iso: "pt", name: "Liga Portugal 2" },
  74:   { code: "NL2",  hue: "#E89A5C", tier: 4, rank: 9, iso: "nl", name: "Eerste Divisie" },
  603:  { code: "TR2",  hue: "#5CD4C8", tier: 4, rank: 10, iso: "tr", name: "1. Lig (TUR)" },
  184:  { code: "AT2",  hue: "#E8A08A", tier: 4, rank: 11, iso: "at", name: "2. Liga (AUT)" },
  579:  { code: "SE2",  hue: "#8AC7D4", tier: 4, rank: 12, iso: "se", name: "Superettan" },
  651:  { code: "BR2",  hue: "#D4C55C", tier: 4, rank: 13, iso: "br", name: "Serie B (BRA)" },

  770:  { code: "URU",  hue: "#7A9BD4", tier: 5, rank: 1, iso: "uy", name: "Primera Division (URU)" },
  663:  { code: "CHI",  hue: "#D47A7A", tier: 5, rank: 2, iso: "cl", name: "Primera Division (CHI)" },
  274:  { code: "DE1",  hue: "#E87A8A", tier: 5, rank: 3, iso: "dk", name: "First Division (DEN)" },
  292:  { code: "FIN",  hue: "#5C9BC0", tier: 5, rank: 4, iso: "fi", name: "Veikkausliiga" },
  229:  { code: "BUL",  hue: "#8AC08A", tier: 5, rank: 5, iso: "bg", name: "First League (BUL)" },
  1356: { code: "AUS",  hue: "#D4A07A", tier: 5, rank: 6, iso: "au", name: "A-League Men" },
  830:  { code: "EGY",  hue: "#C0A05C", tier: 5, rank: 7, iso: "eg", name: "Premier League (EGY)" },
  806:  { code: "RSA",  hue: "#7AC0A0", tier: 5, rank: 8, iso: "za", name: "Premier League (RSA)" },
  755:  { code: "PAR",  hue: "#C07A9B", tier: 5, rank: 9, iso: "py", name: "Division 1 (PAR)" },
  1583: { code: "AUW",  hue: "#D48AC0", tier: 5, rank: 10, iso: "au", name: "A-League Women" },
};

/** What each tier is called where a list needs a heading. */
export const TIER_NAMES = {
  1: "Europe's top five",
  2: "Strong national leagues",
  3: "Competitive leagues",
  4: "Second tiers",
  5: "Developing and outside Europe",
};

/** League ids in the order a reader expects to meet them. */
export function leagueOrder(ids) {
  return [...ids].sort((a, b) => {
    const A = LEAGUES[a] || { tier: 9, rank: 9 };
    const B = LEAGUES[b] || { tier: 9, rank: 9 };
    return A.tier - B.tier || A.rank - B.rank;
  });
}

/** Minutes thresholds that set how much to trust a player's numbers. */
export const CONFIDENCE = [
  { min: 2200, label: "High",   note: "a full season of evidence" },
  { min: 1400, label: "Medium", note: "most of a season" },
  { min: 0,    label: "Low",    note: "a partial season — read with care" },
];

export function confidenceOf(minutes) {
  return CONFIDENCE.find((c) => minutes >= c.min) || CONFIDENCE[CONFIDENCE.length - 1];
}

export function bucketFor(player) {
  const detailed = (player.detailed_position || "").toLowerCase().trim();
  if (detailed) {
    for (const [bucket, keys] of NAME_RULES) {
      if (keys.some((k) => detailed.includes(k))) return bucket;
    }
  }
  const broad = (player.position || "").toLowerCase().trim();
  if (broad.includes("goal")) return "GK";
  if (broad.includes("defend")) return "CB";
  if (broad.includes("midfield")) return "CM";
  if (broad.includes("attack") || broad.includes("forward")) return "ST";
  return null;
}

export function groupApplies(name, position) {
  const scope = GROUP_SCOPE[name];
  return !scope || scope.includes(position);
}

/**
 * Roles read the same ability scores through a different lens. Nothing new
 * is measured — the weights simply say what a given job asks for most.
 *
 * Two numbers come out of each role, and they answer different questions:
 *
 *   fit      how closely the shape of a player's profile matches the role
 *   quality  how good he actually is in the areas the role leans on
 *
 * A defender who passes at the 98th percentile and heads at the 15th is a
 * near-perfect stylistic match for a ball-playing centre-back and a poor
 * one in practice. Showing one number would hide that.
 *
 * Weights sit between 0.75 and 3. Anything lower stops being a weight and
 * starts being an exclusion.
 */
export const ROLES = {
  GK: [
    { name: "Shot stopper",
      blurb: "Lives on the line and keeps out what comes at him.",
      w: { "Shot stopping": 3, "Errors": 2, "Area activity": 1,
           "Distribution": 0.75, "Team record": 0.75, "Shot profile": 0.75 } },
    { name: "Ball-playing keeper",
      blurb: "Starts attacks with his feet.",
      w: { "Distribution": 3, "Shot stopping": 1.5, "Errors": 1.5,
           "Area activity": 1, "Shot profile": 0.75, "Team record": 0.75 } },
    { name: "Area-active keeper",
      blurb: "Busy off his line, in the air and clearing danger.",
      note: "Built from clearances and aerials — the feed carries no data "
          + "on crosses claimed or distance from goal, so this is activity "
          + "rather than command of the box.",
      w: { "Area activity": 3, "Errors": 2, "Shot stopping": 1.5,
           "Distribution": 1, "Shot profile": 0.75, "Team record": 0.75 } },
  ],

  CB: [
    { name: "Ball-playing",
      blurb: "Brings the ball out and picks passes through lines.",
      w: { "Passing": 3, "Progression": 2.5, "Discipline": 1,
           "Aerial": 1, "Tackling": 1, "Blocking": 1 } },
    { name: "Stopper",
      blurb: "Steps out, engages early, wins the ball high.",
      w: { "Tackling": 3, "Aerial": 1.75, "Blocking": 1.5,
           "Discipline": 1, "Passing": 0.75, "Progression": 0.75 } },
    { name: "Aerial dominator",
      blurb: "Owns the box in the air.",
      w: { "Aerial": 3, "Blocking": 2, "Tackling": 1,
           "Discipline": 1, "Passing": 0.75, "Progression": 0.75 } },
    { name: "Low-risk defender",
      blurb: "Rarely beaten, rarely caught out, keeps it simple.",
      note: "Discipline here means seldom dribbled past, seldom fouling. "
          + "It is not a read on recovery pace or positioning, which the "
          + "feed does not carry.",
      w: { "Discipline": 3, "Tackling": 1.75, "Passing": 1.25,
           "Blocking": 1, "Aerial": 0.75, "Progression": 0.75 } },
  ],

  RB: [
    { name: "Attacking full-back",
      blurb: "Gets to the byline and delivers.",
      w: { "Crossing": 3, "Creation": 2.5, "Carrying": 2,
           "Security": 1, "Defending": 0.75, "Duels": 0.75 } },
    { name: "Defensive full-back",
      blurb: "Defends the flank first and asks questions later.",
      w: { "Defending": 3, "Duels": 2.5, "Security": 2,
           "Crossing": 0.75, "Creation": 0.75, "Carrying": 0.75 } },
    { name: "Possession full-back",
      blurb: "Keeps the ball, carries it, rarely gives it away.",
      note: "A statistical stand-in for the full-back who steps infield. "
          + "Without positional tracking we can see the ball retention and "
          + "carrying, not where on the pitch it happened.",
      w: { "Carrying": 2.5, "Security": 2.5, "Creation": 2,
           "Defending": 1.25, "Crossing": 0.75, "Duels": 0.75 } },
    { name: "Complete full-back",
      allRound: true,
      blurb: "Strong on both sides of the ball with no weak link.",
      note: "Scored on the lowest of the six abilities rather than the "
          + "average, because a complete player is defined by not having "
          + "a hole in his game.",
      w: { "Crossing": 1.5, "Creation": 1.5, "Carrying": 1.5,
           "Defending": 1.5, "Duels": 1.5, "Security": 1.5 } },
  ],

  DM: [
    { name: "Ball winner",
      blurb: "Hunts the ball and gets it back.",
      w: { "Ball winning": 3, "Aerial": 1.5, "Screening": 1.5,
           "Security": 1.25, "Passing": 0.75, "Ball carrying": 0.75,
           "Involvement": 0.75 } },
    { name: "Deep playmaker",
      blurb: "Takes the ball off the defence and moves the game.",
      w: { "Passing": 3, "Security": 2.5, "Involvement": 2, "Ball carrying": 1.5,
           "Ball winning": 0.75, "Screening": 0.75, "Aerial": 0.75 } },
    { name: "Anchor",
      blurb: "Sits in front of the back line and closes the space.",
      note: "Screening leans on clearances and blocks, which a deep-lying "
          + "team produces more of whoever is playing there — so it is "
          + "balanced against aerials and ball-winning rather than leading.",
      w: { "Screening": 2, "Aerial": 2, "Ball winning": 2, "Security": 2,
           "Passing": 1, "Ball carrying": 0.75, "Involvement": 0.75 } },
  ],

  CM: [
    { name: "Creator",
      blurb: "Finds the pass that opens a defence.",
      w: { "Creation": 3, "Passing": 1.5, "Carrying": 1.5,
           "Involvement": 1, "Security": 1, "Defending": 0.75 } },
    { name: "Box to box",
      blurb: "Covers ground at both ends.",
      w: { "Defending": 2.5, "Carrying": 2.5, "Creation": 1.5,
           "Passing": 1, "Involvement": 1, "Security": 1 } },
    { name: "Controller",
      blurb: "Sets the tempo and keeps the ball moving.",
      w: { "Passing": 3, "Security": 2.5, "Involvement": 2,
           "Creation": 1, "Carrying": 1, "Defending": 1 } },
    { name: "Ball winner",
      blurb: "Breaks up play in midfield.",
      w: { "Defending": 3, "Security": 1.5, "Passing": 1,
           "Involvement": 1, "Carrying": 0.75, "Creation": 0.75 } },
  ],

  AM: [
    { name: "Playmaker",
      blurb: "The last pass runs through him.",
      w: { "Creation": 3, "Security": 2, "Carrying": 1.5, "Delivery": 1.5,
           "Scoring": 1, "Physical involvement": 0.75, "Defensive work": 0.75 } },
    { name: "Second striker",
      blurb: "Arrives in the box and finishes.",
      w: { "Scoring": 3, "Physical involvement": 1.5, "Carrying": 1.5,
           "Creation": 1, "Security": 1, "Delivery": 0.75,
           "Defensive work": 0.75 } },
    { name: "Dribbler",
      blurb: "Beats his man and draws the foul.",
      w: { "Carrying": 3, "Physical involvement": 2, "Creation": 1.5,
           "Scoring": 1.5, "Security": 0.75, "Delivery": 0.75,
           "Defensive work": 0.75 } },
  ],

  RW: [
    { name: "Inside forward",
      blurb: "Cuts in and shoots.",
      w: { "Scoring": 3, "Dribbling": 2, "Creation": 1.5, "Security": 1,
           "Delivery": 0.75, "Physical": 0.75, "Defensive work": 0.75 } },
    { name: "Touchline winger",
      blurb: "Holds the width and puts balls into the box.",
      w: { "Delivery": 3, "Dribbling": 2.5, "Creation": 2, "Scoring": 1,
           "Physical": 0.75, "Security": 0.75, "Defensive work": 0.75 } },
    { name: "Wide creator",
      blurb: "Makes chances from the flank.",
      w: { "Creation": 3, "Delivery": 2, "Dribbling": 2, "Security": 1.5,
           "Scoring": 0.75, "Physical": 0.75, "Defensive work": 0.75 } },
    { name: "Two-way winger",
      blurb: "Contributes at both ends of the pitch.",
      note: "Defensive work counts tackles and interceptions only. The feed "
          + "has no pressing or distance data, so this is not a measure of "
          + "how hard a player runs.",
      w: { "Defensive work": 3, "Security": 2, "Physical": 1.75,
           "Scoring": 1.5, "Dribbling": 1, "Creation": 1, "Delivery": 1 } },
  ],

  LW: [
    { name: "Inside forward",
      blurb: "Cuts in and shoots.",
      w: { "Scoring": 3, "Dribbling": 2, "Creation": 1.5, "Security": 1,
           "Delivery": 0.75, "Physical": 0.75, "Defensive work": 0.75 } },
    { name: "Touchline winger",
      blurb: "Holds the width and puts balls into the box.",
      w: { "Delivery": 3, "Dribbling": 2.5, "Creation": 2, "Scoring": 1,
           "Physical": 0.75, "Security": 0.75, "Defensive work": 0.75 } },
    { name: "Wide creator",
      blurb: "Makes chances from the flank.",
      w: { "Creation": 3, "Delivery": 2, "Dribbling": 2, "Security": 1.5,
           "Scoring": 0.75, "Physical": 0.75, "Defensive work": 0.75 } },
    { name: "Two-way winger",
      blurb: "Contributes at both ends of the pitch.",
      note: "Defensive work counts tackles and interceptions only. The feed "
          + "has no pressing or distance data, so this is not a measure of "
          + "how hard a player runs.",
      w: { "Defensive work": 3, "Security": 2, "Physical": 1.75,
           "Scoring": 1.5, "Dribbling": 1, "Creation": 1, "Delivery": 1 } },
  ],

  ST: [
    { name: "Poacher",
      blurb: "Lives in the box and puts them away.",
      w: { "Scoring": 3, "Finishing": 2.5, "Chance volume": 1.5,
           "Aerial": 0.75, "Link play": 0.75, "Carrying": 0.75,
           "Physical involvement": 0.75 } },
    { name: "Target man",
      blurb: "Holds the ball up and wins it in the air.",
      note: "Aerials, fouls won and link passes stand in for hold-up play. "
          + "The feed carries no lay-offs or receptions under pressure.",
      w: { "Aerial": 3, "Link play": 2, "Physical involvement": 2,
           "Scoring": 1, "Finishing": 1, "Chance volume": 1,
           "Carrying": 0.75 } },
    { name: "Complete forward",
      allRound: true,
      blurb: "Scores and builds the attack, with nothing missing.",
      note: "Scored on the weakest of the six abilities rather than the "
          + "average, because a complete forward is defined by not having "
          + "a hole in his game.",
      w: { "Scoring": 2, "Link play": 2, "Finishing": 1.5, "Carrying": 1.5,
           "Chance volume": 1.5, "Aerial": 1.5, "Physical involvement": 1 } },
    { name: "Physical forward",
      blurb: "Wins contact, occupies defenders, gets fouled.",
      note: "Physical involvement counts fouls won and tackles made. It is "
          + "a rough proxy — the feed has no duel-by-duel physical data.",
      w: { "Physical involvement": 2.5, "Aerial": 2, "Scoring": 1.5,
           "Link play": 1.5, "Finishing": 1, "Chance volume": 1,
           "Carrying": 0.75 } },
  ],
};


/**
 * Ability names shortened for the radar, where a long label collides with
 * its neighbours. The full name still shows in the list beside the wheel
 * and in the score breakdown.
 */
export const THEME_SHORT = {
  "Shot profile": "Profile",
  "Ball carrying": "Carrying",
  "Efficiency": "Efficiency",
  "Physical involvement": "Physical",
  "Chance volume": "Volume",
  "Defensive work": "Defending",
  "Shot stopping": "Shot stop",
  "Area activity": "Sweeping",
  "Team record": "Team",
  "Ball winning": "Winning",
  "Drawing pressure": "Pressure",
};

/**
 * The abilities a position cannot be judged without. If one of these has
 * too little data behind it, no overall score is produced — better a gap
 * than a number built on the wrong half of the evidence.
 */
export const CORE = {
  GK: ["Shot stopping"],
  CB: ["Aerial", "Tackling"],
  RB: ["Defending", "Crossing"],   // the attacking flank is the most telling
  LB: ["Defending", "Crossing"],   // part of a modern full-back, so it gates too
  DM: ["Ball winning", "Passing"],
  CM: ["Creation", "Passing"],
  AM: ["Creation"],
  RW: ["Scoring", "Creation"],
  LW: ["Scoring", "Creation"],
  ST: ["Scoring"],   // stays soft: a target man can score little and still
                     // deserve a score — role-gating handles the profile
};

/** Thresholds that decide whether a player gets a role label at all. */
export const ROLE_RULES = {
  minFit: 65,      // below this, no role is a good enough match to name
  minQuality: 45,  // shape can fit while the level does not — below this the
                   // player gets his profile named, not a "clear match"
  clearGap: 8,     // how far clear the top role must be to stand alone
  versatile: 4,    // roles within this of the top are named alongside it
};
