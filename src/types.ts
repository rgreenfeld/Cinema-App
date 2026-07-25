import type { ChainId, Language } from '@/data';

export type Screen = 'preferences' | 'search' | 'results';

export interface Preferences {
  locationMode: 'current' | 'regions';
  selectedCities: string[];
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
}

export const emptyPreferences: Preferences = {
  locationMode: 'current',
  selectedCities: [],
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
};
