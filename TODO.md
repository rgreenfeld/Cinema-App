# Update Screening Details Card — Real Supabase Properties

## Goal
Replace all remaining hardcoded mock data in the screening details (expanded) card with the real Supabase screening properties, and handle optional/missing fields gracefully.

## Steps

### Step 1: `src/lib/supabase.ts`
- [x] Add optional `available_seats`, `total_seats`, `total_rows` to `SupabaseScreeningRow`

### Step 2: `src/data.ts` (+ `src/data.clean.ts`)
- [x] `Screening` interface: make `subtitleLang` nullable, `totalSeats/availableSeats/totalRows` nullable, add `bookingUrl: string | null`
- [x] `transformSupabaseRows`: map real values (null when absent) instead of hardcoded `200 / 150 / 14 / 'עברית'`

### Step 3: `src/components/ResultsScreen.tsx`
- [x] Render `screen_type` (hallType) & `language` (audioLang) as badges in the **collapsed** summary row (alongside the time) AND in the expanded panel
- [x] On-demand seat availability fetch on expand using `booking_url` (`src/lib/seatAvailability.ts`)
- [x] Loading spinner inside expanded area: "טוען מפת אולם ומקומות פנויים..."
- [x] Render fetched seat counts / total capacity / row numbers once resolved; graceful fallback to DB-seat data / clean "not available" state
- [x] Wire "הזמן כרטיסים" button to `screening.bookingUrl` with `target="_blank"` + `rel="noopener noreferrer"`, clean placeholder when missing

### Step 3b: `src/lib/seatAvailability.ts` (new)
- [x] `fetchSeatAvailability(bookingUrl, fallback)` — best-effort fetch of the booking page; parses seat/row data from JSON or HTML; falls back to stored DB metrics on CORS/network failure
- [x] CORS proxy fix: fetch the booking page via `https://corsproxy.io/?<encoded-url>` (bypasses `Access-Control-Allow-Origin` restrictions during dev)
- [x] 4-second timeout with `AbortController`; on proxy failure/timeout, log cleanly, re-throw so the UI shows a clear "open booking page in new tab" button
- [x] `ResultsScreen.tsx` error state now includes a prominent "פתח את דף ההזמנה באתר הקולנוע" link (opens `booking_url` in a new tab)

### Step 4: `supabase/schema.sql`
- [x] Add optional `available_seats`, `total_seats`, `total_rows` columns

### Step 5: Verify
- [x] `npx tsc --noEmit` passes (exit code 0)
- [ ] Manual smoke test via `npm run dev` (if desired)

