# TODO — Fix outdated-screenings cleanup in the upload pipeline

## Root cause (diagnosed)
The uploader's `.delete().lt('date_time', nowISO)` is correct, but the live
Supabase `screenings` table only has SELECT + INSERT policies — **no DELETE
policy**. Under RLS, a delete with a forbidden role silently affects 0 rows
instead of raising an error. That's why outdated screenings were never removed
(even the old "delete ALL rows" path silently failed).

## Steps
- [x] Replace "delete ALL rows" with "delete outdated rows" (`.lt('date_time', nowISO)`)
- [x] Diagnose the live DB — confirmed 2,200+ outdated rows and delete returning 0 (RLS)
- [x] Uploader now prefers `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- [x] Uploader verifies the delete actually removed rows and fails loudly if not
- [x] Add the required DELETE policy SQL to `supabase/schema.sql`
- [x] Wire `SUPABASE_SERVICE_ROLE_KEY` into the GitHub Actions workflow
- [ ] Apply the DELETE policy to the LIVE Supabase database (one-time):
      - Supabase Dashboard → SQL Editor → run:
        `drop policy if exists "Allow anon delete" on public.screenings;`
        `create policy "Allow anon delete" on public.screenings for delete using (true);`
      - OR add `SUPABASE_SERVICE_ROLE_KEY=<service_role key>` to `.env`
- [ ] Re-run `node scrapers/uploadToSupabase.js` and confirm "Outdated screenings cleaned (N row(s) removed)"

