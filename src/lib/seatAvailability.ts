/**
 * On-demand live seat availability lookup for a screening.
 *
 * The screening's `booking_url` points to the cinema's official
 * seat-selection page (e.g.
 * https://www.cinema-city.co.il/order/?eventID=...&theaterId=...).
 * We attempt to fetch that page and best-effort parse seat / row data from it.
 *
 * Browsers block direct cross-origin reads (CORS), so the request goes through
 * a CORS proxy wrapper (`https://corsproxy.io/?<encoded-url>`) to bypass the
 * `Access-Control-Allow-Origin` restriction during development.
 *
 * If the proxy fails or times out (4s), the error is thrown so the UI can
 * clearly prompt the user to open the booking_url directly in a new tab, and
 * we gracefully fall back to the seat data already stored on the screening
 * record (`available_seats` / `total_seats` / `total_rows` from Supabase).
 * When neither source yields data, nulls are returned and the UI renders a
 * clean "not available" state.
 */

export interface SeatAvailability {
  availableSeats: number | null;
  totalSeats: number | null;
  totalRows: number | null;
}

const EMPTY: SeatAvailability = { availableSeats: null, totalSeats: null, totalRows: null };

/** CORS proxy wrapper used to bypass browser cross-origin restrictions. */
export const CORS_PROXY_BASE = 'https://corsproxy.io/?';

/** Max time (ms) to wait for the proxied booking page before treating it as failed. */
export const FETCH_TIMEOUT_MS = 4000;

/**
 * Build the CORS-proxied URL for a cinema booking page.
 * e.g. https://corsproxy.io/?https%3A%2F%2Fwww.cinema-city.co.il%2Forder%2F...
 */
export function toProxyUrl(bookingUrl: string): string {
  return `${CORS_PROXY_BASE}${encodeURIComponent(bookingUrl)}`;
}

/** Best-effort numeric extraction from the booking page (JSON or HTML text). */
function parseSeatData(raw: string): SeatAvailability | null {
  if (!raw) return null;

  // Try JSON first — some cinema APIs return seat availability as JSON.
  try {
    const json = JSON.parse(raw);
    const src = json?.result ?? json?.data ?? json ?? {};
    const find = (keys: string[]) => {
      for (const k of keys) {
        if (src[k] != null && Number.isFinite(Number(src[k]))) return Number(src[k]);
      }
      return null;
    };
    const availableSeats = find([
      'availableSeats',
      'available_seats',
      'freeSeats',
      'free_seats',
      'vacantSeats',
      'vacant',
    ]);
    const totalSeats = find(['totalSeats', 'total_seats', 'capacity', 'hallSeats', 'seats']);
    const totalRows = find(['totalRows', 'total_rows', 'rowCount', 'rows']);
    if (availableSeats == null && totalSeats == null && totalRows == null) return null;
    return { availableSeats, totalSeats, totalRows };
  } catch {
    // Not JSON — fall through to HTML text heuristics below.
  }

  // Light HTML / embedded-JSON heuristics.
  const availMatch = raw.match(
    /(?:availableSeats|available_seats|freeSeats|free_seats|vacantSeats)[":\s=]+(\d+)/i
  );
  const totalMatch = raw.match(/(?:totalSeats|total_seats|capacity|hallSeats)[":\s=]+(\d+)/i);
  const rowsMatch = raw.match(/(?:totalRows|total_rows|rowCount)[":\s=]+(\d+)/i);

  const availableSeats = availMatch ? Number(availMatch[1]) : null;
  const totalSeats = totalMatch ? Number(totalMatch[1]) : null;
  const totalRows = rowsMatch ? Number(rowsMatch[1]) : null;

  if (availableSeats == null && totalSeats == null && totalRows == null) return null;
  return { availableSeats, totalSeats, totalRows };
}

/**
 * Fetch live seat availability for a screening.
 *
 * @param bookingUrl The screening's official booking_url (may be null).
 * @param fallback   Seat data already stored on the screening record — used
 *                   when the live fetch is unavailable (CORS / offline / no URL).
 * @returns Resolved seat counts; nulls when nothing is known.
 */
export async function fetchSeatAvailability(
  bookingUrl: string | null,
  fallback?: SeatAvailability
): Promise<SeatAvailability> {
  if (!bookingUrl) {
    console.warn('⚠ Live seat fetch skipped — no booking_url on this screening.');
    return fallback ?? EMPTY;
  }

  console.info('🎟 Live seat fetch: targeting booking_url', bookingUrl);

  // Bypass the browser CORS restriction by routing the request through the
  // CORS proxy wrapper (encoded target URL appended).
  const targetUrl = toProxyUrl(bookingUrl);
  console.info('🔄 Live seat fetch: via CORS proxy →', targetUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS); // 4s

  try {
    const res = await fetch(targetUrl, { signal: controller.signal });

    if (!res.ok) {
      // Proxy or backend endpoint returned an error status.
      console.warn(
        `⚠ Live seat fetch: proxy/backend returned HTTP ${res.status} for URL:`,
        bookingUrl
      );
      throw new Error(`Seat fetch returned HTTP ${res.status} for ${bookingUrl}`);
    }

    const text = await res.text();
    const parsed = parseSeatData(text);
    if (parsed) {
      console.info('✅ Live seat fetch parsed seat data for URL:', bookingUrl, parsed);
      // Return structured data: available seats, total capacity, rows.
      return { availableSeats: parsed.availableSeats, totalSeats: parsed.totalSeats, totalRows: parsed.totalRows };
    }

    console.warn(
      '⚠ Live seat fetch: booking page loaded but no parseable seat data found for URL:',
      bookingUrl
    );
    throw new Error(`No seat data found in booking page for ${bookingUrl}`);
  } catch (error) {
    // Log the EXACT error object for debugging (CORS, timeout, network, etc.).
    console.error('Live seat fetch failed for URL:', bookingUrl, error);

    // Browsers throw a TypeError when a cross-origin read is blocked (CORS),
    // or on network-level failures (offline / DNS / connection refused).
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn(`⏱ Live seat fetch timed out (aborted after ${FETCH_TIMEOUT_MS}ms) for URL:`, bookingUrl);
    } else if (error instanceof TypeError) {
      console.warn(
        '⚠ Live seat fetch blocked — CORS proxy unavailable or network error for URL:',
        bookingUrl
      );
    } else {
      console.warn('⚠ Live seat fetch failed for an unexpected reason for URL:', bookingUrl, error);
    }

    // Re-throw so the UI can surface a clean "open booking page directly in a
    // new tab" action. The caller (ResultCard) keeps the stored Supabase data
    // as a fallback for display and always renders the booking_url button.
    throw error instanceof Error
      ? error
      : new Error(`Live seat fetch failed for ${bookingUrl}`);
  } finally {
    clearTimeout(timer);
  }
}

