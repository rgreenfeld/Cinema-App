import type { ChainId, Language } from '@/data';

export type Screen = 'preferences' | 'search' | 'results';

export interface Preferences {
  locationMode: 'current' | 'regions';
  selectedCities: string[];
  selectedRegions: string[];
  /** Full cinema branch names mapped from the selected cities/regions.
   *  e.g. selecting city 'רמת השרון' → 'סינמה סיטי גלילות'.
   *  Preserves the full display names for filtering and rendering. */
  selectedBranches: string[];
  selectedChains: ChainId[];
  selectedLanguages: Language[];
}

export type SearchMode = 'movie' | 'time';

export interface SearchCriteria {
  mode: SearchMode;
  movieId: string | null;
  date: string | null;
  minTime: string | null;
  maxTime: string | null;
  hallTypes: string[];
  allDay: boolean;
}

export const emptyPreferences: Preferences = {
  locationMode: 'regions',
  selectedCities: [],
  selectedRegions: [],
  selectedBranches: [],
  selectedChains: [],
  selectedLanguages: [],
};

export const emptySearchCriteria: SearchCriteria = {
  mode: 'movie',
  movieId: null,
  date: null,
  minTime: null,
  maxTime: null,
  hallTypes: [],
  allDay: false,
};
