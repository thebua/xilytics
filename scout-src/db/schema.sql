-- =====================================================================
--  Xilytics Scout — database schema
-- =====================================================================
--  Run once, in the Supabase SQL editor.
--
--  Shape follows the built dataset. Reference tables for leagues,
--  seasons and players; one row per player per league-season in
--  `entries`, which is what every query actually reads.
--
--  Metric arrays stay as JSONB rather than becoming fifty-odd columns:
--  the set differs by position and grows when a new metric is added, and
--  a schema migration for every such change would be a poor trade for
--  column-level typing we never query on individually.
-- =====================================================================

-- ---------------------------------------------------------------- meta
-- One row. Holds the labels, themes, roles and other lookup tables the
-- front end needs, exactly as the build script emits them.
create table if not exists dataset_meta (
  id          smallint primary key default 1,
  built_at    date        not null,
  min_minutes integer     not null,
  payload     jsonb       not null,
  constraint  single_row check (id = 1)
);

-- ------------------------------------------------------------- leagues
create table if not exists leagues (
  id        integer primary key,          -- Sportmonks league id
  name      text    not null,
  code      text,                         -- short badge, e.g. "PL"
  hue       text,                         -- colour used across the UI
  iso       text,                         -- country code, for the flag
  tier      smallint,
  tier_rank smallint,
  coef      numeric(4,2),                 -- hand-calibrated strength
  is_open   boolean not null default false -- visible without an account
);

comment on column leagues.is_open is
  'Three leagues are readable by anyone; the rest need a signed-in user. '
  'Held here rather than in the API so the rule is enforced by the '
  'database itself.';

-- ------------------------------------------------------------- seasons
create table if not exists seasons (
  id   integer primary key,               -- Sportmonks season id
  name text not null                      -- "2024/2025"
);

-- ------------------------------------------------------------- players
-- The person, independent of any one season.
create table if not exists players (
  id          bigint primary key,         -- Sportmonks player id
  name        text not null,
  image       text,
  dob         date,
  height      smallint,
  weight      smallint,
  foot        text,
  nationality text,
  nat_code    text,
  nat_flag    text
);

create index if not exists players_name_idx
  on players using gin (to_tsvector('simple', name));

-- ------------------------------------------------------------- entries
-- A player's season in one competition. The table every query hits.
create table if not exists entries (
  id            bigserial primary key,
  player_id     bigint  not null references players(id) on delete cascade,
  league_id     integer not null references leagues(id) on delete cascade,
  season_id     integer not null references seasons(id) on delete cascade,

  team          text,
  pos           text    not null,         -- GK, CB, RB ... ST
  detailed_pos  text,
  age           smallint,

  minutes       integer,
  appearances   smallint,
  rating        numeric(4,2),
  goals         smallint,
  assists       smallint,

  score         smallint,                 -- rank in pool, 0-100
  score_adj     smallint,                 -- adjusted for league strength
  pool_size     smallint,                 -- how many stood behind the rank
  coverage      smallint,                 -- % of metrics present
  role_label    text,
  role_kind     text,

  metric_values jsonb,                    -- raw figures, by metric index
  percentiles   jsonb,                    -- same, as percentiles
  themes        jsonb,                    -- ability scores
  role_fit      jsonb,
  role_quality  jsonb,
  transfers     jsonb,
  trophies      smallint,

  unique (player_id, league_id, season_id)
);

-- The ordinary read: a position within a league-season, best first.
create index if not exists entries_pos_league_season_idx
  on entries (pos, league_id, season_id, score desc nulls last);

-- Cross-league browsing of one position.
create index if not exists entries_pos_score_idx
  on entries (pos, score desc nulls last);

-- Everything a single player has on file, for the profile.
create index if not exists entries_player_idx
  on entries (player_id);

create index if not exists entries_league_idx on entries (league_id);
create index if not exists entries_season_idx on entries (season_id);

-- Filtering on individual metrics without a column per metric.
create index if not exists entries_percentiles_idx
  on entries using gin (percentiles);

-- --------------------------------------------------------------- users
-- Supabase keeps the credentials in auth.users; this holds what the
-- product needs to know on top of that.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  tier         text not null default 'free',   -- 'free' | 'member'
  tier_since   timestamptz,
  tier_expires timestamptz,
  created_at   timestamptz not null default now()
);

-- A new sign-up gets a profile automatically.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =====================================================================
--  Row level security
-- =====================================================================
--  The open-league rule lives here rather than in application code. If
--  the API has a bug, the database still refuses to hand over a league
--  the visitor has no claim to.
-- =====================================================================

alter table leagues  enable row level security;
alter table seasons  enable row level security;
alter table players  enable row level security;
alter table entries  enable row level security;
alter table profiles enable row level security;
alter table dataset_meta enable row level security;

-- Is the caller entitled to everything?
create or replace function is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and tier = 'member'
      and (tier_expires is null or tier_expires > now())
  );
$$;

-- Leagues: open ones to everyone, the rest to members.
drop policy if exists leagues_read on leagues;
create policy leagues_read on leagues
  for select using (is_open or is_member());

-- Seasons, players and meta carry nothing league-specific.
drop policy if exists seasons_read on seasons;
create policy seasons_read on seasons for select using (true);

drop policy if exists players_read on players;
create policy players_read on players for select using (true);

drop policy if exists meta_read on dataset_meta;
create policy meta_read on dataset_meta for select using (true);

-- Entries: the one that matters. A row is readable when its league is.
--
-- The check goes through a security-definer function rather than a
-- subquery on `leagues`. A subquery would re-enter that table's own
-- policy for every row scanned — correct, but evaluated over and over on
-- a table this size. The function reads the league set once, with RLS
-- bypassed, and is marked stable so the planner calls it a single time
-- per statement.
create or replace function readable_league(lid integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leagues
    where id = lid
      and (is_open or public.is_member())
  );
$$;

drop policy if exists entries_read on entries;
create policy entries_read on entries
  for select using (readable_league(league_id));

-- A profile is the user's own business.
drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- Editing your own row is fine; promoting yourself is not. A policy cannot
-- express "this column may not change" without reading the table it guards,
-- which recurses, so the rule sits in a trigger where it belongs.
create or replace function guard_profile_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.role() <> 'service_role' then
    new.tier         := old.tier;
    new.tier_since   := old.tier_since;
    new.tier_expires := old.tier_expires;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_tier_guard on profiles;
create trigger profiles_tier_guard
  before update on profiles
  for each row execute function guard_profile_tier();

comment on function guard_profile_tier() is
  'Tier changes come from the service role after a payment. A signed-in '
  'user editing their own profile keeps whatever tier they already had.';
