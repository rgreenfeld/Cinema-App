-- =============================================================
-- Cinema Finder — Supabase schema
-- Run this in the Supabase Table Editor → SQL Editor
-- =============================================================

-- Create the screenings table for scraped cinema schedules
create table if not exists public.screenings (
  id             uuid primary key default gen_random_uuid(),
  movie_title    text not null,
  cinema_chain   text not null default 'Cinema City',
  branch         text not null,
  date_time      timestamptz not null,
  booking_url    text,
  language       text not null default 'מקור',
  screen_type    text not null default 'רגיל',
  available_seats integer,  -- optional: available seats for this screening (null when not scraped)
  total_seats    integer,   -- optional: total seats in the hall (null when not scraped)
  total_rows     integer,   -- optional: number of rows in the hall (null when not scraped)
  created_at     timestamptz not null default now()
);

-- Useful index for querying by screening time
create index if not exists screenings_date_time_idx
  on public.screenings (date_time);

-- Useful index for filtering by branch
create index if not exists screenings_branch_idx
  on public.screenings (branch);

-- Useful index for filtering by movie
create index if not exists screenings_movie_title_idx
  on public.screenings (movie_title);

-- Useful index for filtering by language
create index if not exists screenings_language_idx
  on public.screenings (language);

-- Useful index for filtering by screen type
create index if not exists screenings_screen_type_idx
  on public.screenings (screen_type);

-- Enable Row Level Security (recommended: block anonymous writes)
alter table public.screenings enable row level security;

-- Policy: allow public/anonymous reads (needed for the app to display data)
drop policy if exists "Allow public read access" on public.screenings;
create policy "Allow public read access"
  on public.screenings
  for select
  using (true);

-- Policy: allow server-side writes via the anon key only from trusted context.
-- If you use a service_role key in the uploader, you can skip this policy
-- (service_role bypasses RLS). Otherwise uncomment to allow inserts/upserts:
-- drop policy if exists "Allow anon insert" on public.screenings;
-- create policy "Allow anon insert"
--   on public.screenings
--   for insert
--   with check (true);


