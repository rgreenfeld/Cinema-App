/**
 * Cinema City seat-map extraction — reusable module.
 *
 * Extracts seat metrics (total rows, total seats, available seats) from the
 * rendered seat-map SVG on an order page:
 *
 *   https://tickets.cinema-city.co.il/order/<eventId>
 *
 * ─── How it works ──────────────────────────────────────────────────────────
 * The seat map is an inline SVG. Every seat is a <g> group whose direct
 * child is a <use> element:
 *   - <use class="s a">   → available seat
 *   - <use class="s ua">  → unavailable / occupied seat
 *   - aria-description    → "שורה: 1 מושב: 1 - מושב פנוי" (row / seat number)
 *
 * The map is gated behind an invisible reCAPTCHA, so the module:
 *   1. Establishes session cookies on the home page.
 *   2. Navigates to the order page.
 *   3. Performs light human-like mouse movement to help the reCAPTCHA pass.
 *   4. Polls until the seat <g> groups render (up to a timeout).
 *   5. Parses seat classes + aria-description to produce the counts.
 *
 * The SVG is the ONLY source that exposes both total seats AND occupied
 * seats — the internal seats-statusV2 API only returns available seats.
 *
 * Usage:
 *   import { createSession, fetchSeatDataForEvent, extractEventId } from './seatMap.js';
 *
 *   const { browser, page } = await createSession();
 *   const seat = await fetchSeatDataForEvent(page, '838451');
 *   await browser.close();
 */

import puppeteer from 'puppeteer';

export const CINEMA_CITY_BASE = 'https://www.cinema-city.co.il';
export const TICKETS_BASE = 'https://tickets.cinema-city.co.il';
export const SEAT_WAIT_TIMEOUT_MS = 60000;
export const MAX_LOAD_ATTEMPTS = 4;

/**
 * Extract the presentation/event ID from a Cinema City booking URL.
 *
 * Handles:
 *   - https://www.cinema-city.co.il/order/?eventID=838451&theaterId=1170
 *   - https://tickets.cinema-city.co.il/order/838451
 *
 * @param {string|null} bookingUrl
 * @returns {string|null}
 */
export function extractEventId(bookingUrl) {
  if (!bookingUrl) return null;
  try {
    const url = new URL(bookingUrl);
    const eventId = url.searchParams.get('eventID');
    if (eventId) return eventId;
    const pathMatch = url.pathname.match(/\/order\/(\d+)/);
    if (pathMatch) return pathMatch[1];
  } catch {
    /* invalid URL */
  }
  return null;
}

/**
 * Parse seat metrics from the currently-rendered seat-map SVG.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{
 *   seatGroups: number,
 *   available: number,
 *   unavailable: number,
 *   unknown: number,
 *   totalSeats: number,
 *   totalRows: number,
 *   rows: number[],
 * }>}
 */
export async function parseSeatMapFromPage(page) {
  return page.evaluate(() => {
    let available = 0;
    let unavailable = 0;
    let unknown = 0;
    const rows = new Set();

    // A seat group is a <g> whose direct child is a <use>.
    const groups = Array.from(document.querySelectorAll('g'));
    const seatGs = [];
    for (const g of groups) {
      if (g.querySelector(':scope > use')) seatGs.push(g);
    }

    // Fallback: any <use>'s parent element.
    if (seatGs.length === 0) {
      seatGs.push(
        ...Array.from(document.querySelectorAll('use'))
          .map((u) => u.parentElement)
          .filter(Boolean)
      );
    }

    for (const g of seatGs) {
      const use = g.querySelector(':scope > use') || g.querySelector('use');
      if (!use) continue;

      const cls = use.getAttribute('class') || '';
      let status = 'unknown';
      if (/\bs\b/.test(cls)) {
        if (/\ba\b/.test(cls)) status = 'available';
        else if (/\bua\b/.test(cls) || /\bo\b/.test(cls)) status = 'unavailable';
        else status = 'unknown-class';
      } else {
        status = 'unknown-class';
      }

      // Row from aria-description: "שורה: 1 מושב: 1 - מושב פנוי"
      const aria =
        g.getAttribute('aria-description') ||
        use.getAttribute('aria-description') ||
        '';
      if (aria) {
        const m = aria.match(/שורה\s*[:：]?\s*(\d+)/);
        if (m) rows.add(m[1]);
      }

      if (status === 'available') available++;
      else if (status === 'unavailable') unavailable++;
      else unknown++;
    }

    return {
      seatGroups: seatGs.length,
      available,
      unavailable,
      unknown,
      totalSeats: available + unavailable,
      totalRows: rows.size,
      rows: Array.from(rows)
        .map(Number)
        .sort((a, b) => a - b),
    };
  });
}

/**
 * Poll the current page until the seat-map <g> groups render.
 *
 * @param {import('puppeteer').Page} page
 * @param {number} [timeoutMs]
 * @returns {Promise<number>} number of seat groups found (0 on timeout)
 */
export async function waitForSeatMap(page, timeoutMs = SEAT_WAIT_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await page.evaluate(() => {
      let n = 0;
      for (const g of document.querySelectorAll('g')) {
        if (g.querySelector(':scope > use')) n++;
      }
      return n;
    });
    if (count > 0) return count;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return 0;
}

/**
 * Launch a Puppeteer browser + page primed with a Cinema City session.
 *
 * @returns {Promise<{ browser: import('puppeteer').Browser, page: import('puppeteer').Page }>}
 */
export async function createSession() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });

  // Blend in with a normal browser (helps the invisible reCAPTCHA).
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  // Establish session cookies on the home page.
  await page.goto(CINEMA_CITY_BASE, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Dismiss GDPR banner if present.
  await page
    .evaluate(() => {
      const btn = document.querySelector('.gdpr-accept-triger');
      if (btn) btn.click();
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  return { browser, page };
}

/**
 * Fetch seat metrics for an event, reusing an existing session/page.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} eventId
 * @param {{ theaterId?: number|string, mouseMovement?: boolean, timeoutMs?: number, attempts?: number }} [options]
 * @returns {Promise<{
 *   availableSeats: number | null,
 *   totalSeats: number | null,
 *   totalRows: number | null,
 *   seatGroups: number,
 *   unavailable: number,
 *   rows: number[],
 * }>}
 */
export async function fetchSeatDataForEvent(page, eventId, options = {}) {
  // Use the www order-page URL (with eventID + theaterId) — the format the
  // site's own front-end uses. The bare tickets subdomain URL returns 403/404
  // in probes, so we favor the www page which renders the seat map.
  const theaterId = options.theaterId != null ? `&theaterId=${encodeURIComponent(options.theaterId)}` : '';
  const orderUrl = `${CINEMA_CITY_BASE}/order/?eventID=${encodeURIComponent(eventId)}${theaterId}`;
  const attempts = Math.max(1, options.attempts ?? MAX_LOAD_ATTEMPTS);
  let lastSeatGroups = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      console.log(`   ↻ Retry ${attempt}/${attempts} — reloading order page...`);
      // Reload + a short dwell period so the reCAPTCHA script can re-run.
      await page.goto(orderUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
    }

    await page.goto(orderUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // Light human-like mouse movement + scroll helps the invisible reCAPTCHA
    // pass and triggers lazy seat-map rendering.
    if (options.mouseMovement !== false) {
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(100 + Math.random() * 1000, 100 + Math.random() * 600);
        await page.mouse.wheel({ deltaY: (Math.random() - 0.5) * 400 });
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 900));
      }
    }

    lastSeatGroups = await waitForSeatMap(page, options.timeoutMs ?? SEAT_WAIT_TIMEOUT_MS);
    if (lastSeatGroups > 0) break;
  }

  if (lastSeatGroups === 0) {
    // Distinguish "sales ended" (legitimately no seat map) from other failures.
    let reason = 'no-seat-map';
    try {
      const bodyText = await page.evaluate(
        () => (document.body ? document.body.innerText : '')
      );
      if (/הסתיימה|הסתיים|ended/i.test(bodyText)) reason = 'sales-ended';
      else if (/reCAPTCHA|ניסיון אחר|אימות/i.test(bodyText)) reason = 'recaptcha-blocked';
    } catch {
      /* page not available */
    }

    return {
      availableSeats: null,
      totalSeats: null,
      totalRows: null,
      seatGroups: 0,
      unavailable: 0,
      rows: [],
      reason,
    };
  }

  const parsed = await parseSeatMapFromPage(page);

  return {
    availableSeats: parsed.available,
    totalSeats: parsed.totalSeats,
    totalRows: parsed.totalRows,
    seatGroups: parsed.seatGroups,
    unavailable: parsed.unavailable,
    rows: parsed.rows,
  };
}

