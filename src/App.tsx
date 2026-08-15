import { useState, useEffect, useCallback } from 'react';
import { PreferencesScreen } from '@/components/PreferencesScreen';
import { SearchScreen } from '@/components/SearchScreen';
import { ResultsScreen } from '@/components/ResultsScreen';
import { emptyPreferences, emptySearchCriteria, type Preferences, type SearchCriteria, type Screen } from '@/types';
import { fetchScreenings, fetchMoviesByBranchesAndDate } from '@/lib/supabase';
import { transformSupabaseRows, titlesToMovies, type Screening, type Movie, type Cinema } from '@/data';
import { getCinemaNamesForSelection } from '@/utils/cinemaMapping';
import { getUserPreferences } from '@/services/storage';

function App() {
  const [screen, setScreen] = useState<Screen>('preferences');
  const [preferencesInitialized, setPreferencesInitialized] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences);
  const [criteria, setCriteria] = useState<SearchCriteria>(emptySearchCriteria);

  // Real data state
  const [realScreenings, setRealScreenings] = useState<Screening[]>([]);
  const [realMovies, setRealMovies] = useState<Movie[]>([]);
  const [realCinemas, setRealCinemas] = useState<Cinema[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Movies fetched on the preferences → search transition.
  const [submitMovies, setSubmitMovies] = useState<Movie[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  // Fetch real data on mount
  const loadData = useCallback(async () => {
    setDataLoading(true);
    const rows = await fetchScreenings();
    if (rows.length > 0) {
      const { screenings, movies, cinemas } = transformSupabaseRows(rows);
      setRealScreenings(screenings);
      setRealMovies(movies);
      setRealCinemas(cinemas);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const restorePreferences = async () => {
      try {
        const stored = await getUserPreferences();
        if (!stored) return;

        const restoredPreferences: Preferences = {
          ...emptyPreferences,
          locationMode: stored.useLocation ? 'current' : 'regions',
          selectedCities: stored.selectedCities,
          selectedBranches: getCinemaNamesForSelection(stored.selectedCities, []),
          selectedChains: stored.favoriteCinemas as Preferences['selectedChains'] ?? [],
          selectedLanguages: stored.selectedLanguages as Preferences['selectedLanguages'],
        };

        setPreferences(restoredPreferences);

        if (
          restoredPreferences.locationMode !== 'regions' ||
          restoredPreferences.selectedCities.length === 0 ||
          restoredPreferences.selectedChains.length === 0
        ) {
          return;
        }

        setSubmitLoading(true);
        const titles = await fetchMoviesByBranchesAndDate(restoredPreferences.selectedBranches);
        setSubmitMovies(titlesToMovies(titles));
        setScreen('search');
      } catch (err) {
        console.error('Failed to restore movies from saved preferences:', err);
        setSubmitError(true);
      } finally {
        setSubmitLoading(false);
        setPreferencesInitialized(true);
      }
    };

    restorePreferences();
  }, []);

  if (!preferencesInitialized) {
    return <div className="min-h-screen" />;
  }

  /**
   * Triggered by the "המשך למציאת סרטים" button on the preferences screen.
   *
   * 1. Maps the selected cities/regions back to full cinema branch names
   *    (e.g. "רמת השרון" → "סינמה סיטי גלילות").
    * 2. Queries Supabase for upcoming screenings (today and forward) in those branches.
   * 3. Deduplicates by movie title and stores the unique list into state.
   * 4. Transitions to the movie selection (search) screen.
   */
  const handleContinueFromPreferences = async () => {
    const branches = getCinemaNamesForSelection(
      preferences.selectedCities,
      preferences.selectedRegions
    );

    setSubmitLoading(true);
    setSubmitError(false);

    try {
      // Fetch all upcoming titles (today and forward) for the selected locations.
      const titles = await fetchMoviesByBranchesAndDate(branches);
      const fetchedMovies = titlesToMovies(titles);
      console.log('Fetched movies from Supabase:', fetchedMovies);

      setSubmitMovies(fetchedMovies);
      setScreen('search');
    } catch (err) {
      console.error('❌ Failed to fetch movies on submit:', err);
      setSubmitError(true);
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {screen === 'preferences' && (
        <PreferencesScreen
          preferences={preferences}
          onChange={setPreferences}
          onContinue={handleContinueFromPreferences}
        />
      )}
      {screen === 'search' && (
        <SearchScreen
          preferences={preferences}
          criteria={criteria}
          onChange={setCriteria}
          onBack={() => setScreen('preferences')}
          onSearch={() => setScreen('results')}
          movies={realMovies.length > 0 ? realMovies : undefined}
          cinemas={realCinemas.length > 0 ? realCinemas : undefined}
          screenings={realScreenings.length > 0 ? realScreenings : undefined}
          dataLoading={dataLoading}
          submitMovies={submitMovies}
          submitMoviesLoading={submitLoading}
          submitMoviesError={submitError}
        />
      )}
      {screen === 'results' && (
        <ResultsScreen
          criteria={criteria}
          preferences={preferences}
          onChange={() => setScreen('search')}
          onCriteriaChange={setCriteria}
          screenings={realScreenings.length > 0 ? realScreenings : undefined}
          movies={realMovies.length > 0 ? realMovies : undefined}
          cinemas={realCinemas.length > 0 ? realCinemas : undefined}
        />
      )}
    </div>
  );
}

export default App;
