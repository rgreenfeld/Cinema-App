import type { ChainId, HallType, LanguageFilter } from '@/data';
import { HALL_TYPES } from '@/constants';

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
  selectedLanguages: LanguageFilter[];
}

export type SearchMode = 'movie' | 'time';

export interface SearchCriteria {
  mode: SearchMode;
  movieId: string | null;
  kidsOnly: boolean;
  date: string | null;
  minTime: string | null;
  hallTypes: string[];
  allDay: boolean;
}

export const emptyPreferences: Preferences = {
  locationMode: 'regions',
  selectedCities: [],
  selectedRegions: [],
  selectedBranches: [],
  selectedChains: [],
  selectedLanguages: ['שפת מקור'],
};

export const emptySearchCriteria: SearchCriteria = {
  mode: 'movie',
  movieId: null,
  kidsOnly: false,
  date: null,
  minTime: null,
  hallTypes: [...HALL_TYPES] as HallType[],
  allDay: false,
};
