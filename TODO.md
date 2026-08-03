# UX & Validation Updates — Task Tracking

## Step 1: Location Preferences
- [x] `src/types.ts` — default `emptyPreferences.locationMode` → `'regions'`
- [x] `src/components/PreferencesScreen.tsx` — disable "Current Location" with `opacity-50` + "בקרוב" badge
- [x] `src/components/PreferencesScreen.tsx` — require ≥1 city when Regions & Cities mode is active

## Step 2: Language Selection Logic
- [x] `src/components/ResultsScreen.tsx` — add language filter; empty selection = "All Languages" (no filter)

## Step 3: Minimum Time Validation (Today)
- [x] `src/timeUtils.ts` — add `nowIsraelMinutes()` helper
- [x] `src/components/SearchScreen.tsx` — dynamic min-time floor when selected date is today (both modes)

## Step 4: Results Screen Filtering (Today)
- [x] `src/components/ResultsScreen.tsx` — filter out screenings whose start time has already passed when date is today

## Step 5: Verification
- [x] `npx tsc --noEmit` passes

## Step 6: Scraper / Supabase refresh
- [x] Scraped updated schedule from Cinema City — run #1: 1651 screenings; run #2: 1343 screenings; run #3: 1331 screenings (7 branches, Jerusalem empty)
- [x] Seat-enrichment attempted but reCAPTCHA-gated (known limitation from prior TODO) — uploaded fresh schedule with seat columns omitted for schema compatibility
- [x] Uploaded fresh schedule to Supabase `screenings` table (full clean sync — old rows removed, new rows inserted)
- [x] Re-scraped and re-uploaded per user request (old data removed via clean sync, 1331 rows now live)

