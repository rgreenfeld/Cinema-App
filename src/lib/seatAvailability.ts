/**
 * Seat availability lookup for a screening.
 *
 * ─── Why this no longer calls the live Cinema City API ─────────────────────
 * Earlier versions attempted to fetch live seat status directly from
 * Cinema City's internal JSON API:
 *
 *   GET https://tickets.cinema-city.co.il/api/seats/seats-statusV2?presentationId=<id>&venueTypeId=1&isReserved=1
 *
 * through a CORS proxy (`https://corsproxy.io/?<encoded-url>`). That approach
 * is fundamentally broken and was removed:
 *
 *   1. The endpoint returns **HTTP 403 even from a plain server-side Node
 *      fetch** (tested with cookies, Referer, session cookies — all 403).
 *   2. The endpoint is **reCAPTCHA-gated** — it only responds inside a real
 *      browser session after the invisible reCAPTCHA is solved. A public CORS
 *      proxy can never provide that, and even a Puppeteer session hit
 *      404/blocked.
 *   3. The only reliable source is the server-side Puppeteer scraper
 *      (`scrapers/seatMap.js`), which navigates the order page in a real
 *      browser, passes the reCAPTCHA, and parses the rendered seat-map SVG.
 *
 * The scraper stores seat metrics on each screening record in Supabase
 * (`available_seats` / `total_seats` / `total_rows`). The app reads those
 * directly — this module simply resolves them, with a clean "no data" state
 * when the record has nulls.
 *
 * ─── Result semantics ──────────────────────────────────────────────────────
 *   - `availableSeats` / `totalSeats` / `totalRows` are taken from the DB.
 *   - When the screening has no stored seat data, all three are null and the
 *     UI renders a clean "not available" state (no 403 / network error UI).
 */

export interface SeatAvailability {
  availableSeats: number | null;
  totalSeats: number | null;
  totalRows: number | null;
}

const EMPTY: SeatAvailability = { availableSeats: null, totalSeats: null, totalRows: null };

/**
 * Resolve seat availability for a screening from the values already stored on
 * the record (scraped server-side into Supabase).
 *
 * @param storedSeats Seat metrics from the screening record (may be null).
 * @returns The stored counts, or an all-null result when nothing is known.
 */
export function resolveStoredSeatAvailability(storedSeats?: SeatAvailability): SeatAvailability {
  if (!storedSeats) return EMPTY;
  const hasAny =
    storedSeats.availableSeats != null ||
    storedSeats.totalSeats != null ||
    storedSeats.totalRows != null;
  return hasAny ? storedSeats : EMPTY;
}

/**
 * Build a `SeatAvailability` from raw (nullable) screening record fields.
 *
 * @param availableSeats from the DB (`available_seats`).
 * @param totalSeats     from the DB (`total_seats`).
 * @param totalRows      from the DB (`total_rows`).
 */
export function seatAvailabilityFromRecord(
  availableSeats: number | null | undefined,
  totalSeats: number | null | undefined,
  totalRows: number | null | undefined
): SeatAvailability {
  return resolveStoredSeatAvailability({
    availableSeats: availableSeats ?? null,
    totalSeats: totalSeats ?? null,
    totalRows: totalRows ?? null,
  });
}

