# UX Cleanup — Remove Mock Data & Add Real Poster URLs

## Plan

### 1. Schema — add `movies` table
- **File:** `supabase/schema.sql`
- Add `public.movies` table with `title` (unique), `poster_url` (nullable text), and read policy.

### 2. Scraper — extract poster URL
- **File:** `scrapers/cinemaCity.js`
- Build poster URL from `Pic` field using the CDN pattern.
- Add `poster_url` to each screening record.

### 3. Uploader — persist poster to `movies` table
- **File:** `scrapers/uploadToSupabase.js`
- After inserting screenings, upsert unique movies into `movies` table.
- Apply non-destructive rule: only overwrite when existing poster is null/empty OR incoming is valid; never null-overwrite a valid URL.

### 4. Supabase client — add `fetchMovies()`
- **File:** `src/lib/supabase.ts`
- Add paginated `fetchMovies()` reading the `movies` table.

### 5. Data types — make Movie fields nullable, remove fake defaults
- **File:** `src/data.ts` + `src/data.clean.ts`
- `Movie.poster`, `rating`, `genre`, `durationMin` → nullable.
- Remove `MOVIE_POSTER` constant and pexels fallback.

### 6. App — load real movies
- **File:** `src/App.tsx`
- Fetch real movies via `fetchMovies()` and pass to SearchScreen.

### 7. SearchScreen — strict real-data-only rendering
- **File:** `src/components/SearchScreen.tsx`
- Use `titlesToMovies` (no inline fake data).
- Render rating/genre only when real values exist.
- Poster `<img>` only when valid URL, with `onError` fallback to stylized title container.

## Status
- [x] 1. Schema — `movies` table added
- [x] 2. Scraper — poster URL extraction
- [x] 3. Uploader — movies upsert with non-destructive rule
- [x] 4. Supabase client — `fetchMovies()`
- [x] 5. Data types — nullable Movie fields
- [x] 6. App — load real movies
- [x] 7. SearchScreen — strict rendering
