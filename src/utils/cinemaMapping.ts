/**
 * Cinema branch -> city & region mapping.
 *
 * Maps full cinema branch names (as scraped from all supported chains)
 * to a city and a region. These are the source of truth for:
 *   - the location options rendered on the preferences screen,
 *   - the city/region stored on each `Cinema` derived from scraped data.
 *
 * The full branch name is always preserved for display — only the derived
 * `city` and `region` come from this mapping.
 */
export interface CinemaLocation {
  city: string;
  region: string;
}

export const CINEMA_LOCATION_MAP: Record<string, CinemaLocation> = {
  'סינמה סיטי גלילות': { city: 'רמת השרון', region: 'מרכז' },
  'סינמה סיטי ראשל"צ': { city: 'ראשון לציון', region: 'מרכז' },
  'סינמה סיטי ירושלים': { city: 'ירושלים', region: 'ירושלים והסביבה' },
  'סינמה סיטי כפר סבא': { city: 'כפר סבא', region: 'שרון' },
  'סינמה סיטי נתניה': { city: 'נתניה', region: 'שרון' },
  'סינמה סיטי באר שבע': { city: 'באר שבע', region: 'דרום' },
  'סינמה סיטי חדרה': { city: 'חדרה', region: 'צפון' },
  'סינמה סיטי אשדוד': { city: 'אשדוד', region: 'דרום' },
  'פלאנט אילון': { city: 'רמת גן', region: 'מרכז' },
  'פלאנט חיפה': { city: 'חיפה', region: 'חיפה והקריות' },
  'פלאנט ראשון לציון': { city: 'ראשון לציון', region: 'מרכז' },
  'פלאנט ירושלים': { city: 'ירושלים', region: 'ירושלים והסביבה' },
  'פלאנט באר שבע': { city: 'באר שבע', region: 'דרום' },
  'פלאנט זכרון יעקב': { city: 'זכרון יעקב', region: 'חיפה והקריות' },
  'הוט סינמה קריון': { city: 'קריית ביאליק', region: 'חיפה והקריות' },
  'הוט סינמה חיפה': { city: 'חיפה', region: 'חיפה והקריות' },
  'הוט סינמה כפר סבא': { city: 'כפר סבא', region: 'שרון' },
  'הוט סינמה אשקלון': { city: 'אשקלון', region: 'דרום' },
  'הוט סינמה רחובות': { city: 'רחובות', region: 'שפלה' },
  'הוט סינמה פתח תקווה': { city: 'פתח תקווה', region: 'מרכז' },
  'הוט סינמה מודיעין': { city: 'מודיעין', region: 'ירושלים והסביבה' },
  'הוט סינמה כרמיאל': { city: 'כרמיאל', region: 'צפון' },
  'הוט סינמה אשדוד': { city: 'אשדוד', region: 'דרום' },
  'הוט סינמה נהריה': { city: 'נהריה', region: 'צפון' },
  'הוט סינמה נתניה': { city: 'נתניה', region: 'שרון' },
  // Current Hot Cinema feed occasionally emits these aliases.
  'הוט סינמה Натания': { city: 'נתניה', region: 'שרון' },
  'הוט סינמה DREAM STAGE': { city: 'נתניה', region: 'שרון' },
};

const UNKNOWN: CinemaLocation = { city: 'אחר', region: 'אחר' };

export function getCinemaLocation(branchName: string): CinemaLocation {
  return CINEMA_LOCATION_MAP[branchName] ?? UNKNOWN;
}

export function getCityOfBranch(branchName: string): string {
  return getCinemaLocation(branchName).city;
}

export function getRegionOfBranch(branchName: string): string {
  return getCinemaLocation(branchName).region;
}

/**
 * Full branch names whose mapped city is in the given list of cities.
 */
export function getCinemaNamesByCities(cities: string[]): string[] {
  const names = new Set<string>();
  for (const [branchName, loc] of Object.entries(CINEMA_LOCATION_MAP)) {
    if (cities.includes(loc.city)) names.add(branchName);
  }
  return Array.from(names);
}

/**
 * Full branch names whose mapped region is in the given list of regions.
 */
export function getCinemaNamesByRegions(regions: string[]): string[] {
  const names = new Set<string>();
  for (const [branchName, loc] of Object.entries(CINEMA_LOCATION_MAP)) {
    if (regions.includes(loc.region)) names.add(branchName);
  }
  return Array.from(names);
}

/**
 * Full branch names matching any of the selected cities OR regions.
 * This is the combined set stored in the active filter state so downstream
 * filtering matches the full branch name exactly (preserving display names).
 */
export function getCinemaNamesForSelection(cities: string[], regions: string[]): string[] {
  const names = new Set<string>();
  for (const [branchName, loc] of Object.entries(CINEMA_LOCATION_MAP)) {
    if (cities.includes(loc.city) || regions.includes(loc.region)) names.add(branchName);
  }
  return Array.from(names);
}

/**
 * All unique cities present in the mapping.
 */
export function getAllMappedCities(): string[] {
  return Array.from(new Set(Object.values(CINEMA_LOCATION_MAP).map((loc) => loc.city)));
}

/**
 * All unique regions present in the mapping.
 */
export function getAllMappedRegions(): string[] {
  return Array.from(new Set(Object.values(CINEMA_LOCATION_MAP).map((loc) => loc.region)));
}

