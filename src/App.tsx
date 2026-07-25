import { useState } from 'react';
import { PreferencesScreen } from '@/components/PreferencesScreen';
import { SearchScreen } from '@/components/SearchScreen';
import { ResultsScreen } from '@/components/ResultsScreen';
import { emptyPreferences, emptySearchCriteria, type Preferences, type SearchCriteria, type Screen } from '@/types';

function App() {
  const [screen, setScreen] = useState<Screen>('preferences');
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences);
  const [criteria, setCriteria] = useState<SearchCriteria>(emptySearchCriteria);

  return (
    <div className="min-h-screen">
      {screen === 'preferences' && (
        <PreferencesScreen
          preferences={preferences}
          onChange={setPreferences}
          onContinue={() => setScreen('search')}
        />
      )}
      {screen === 'search' && (
        <SearchScreen
          preferences={preferences}
          criteria={criteria}
          onChange={setCriteria}
          onBack={() => setScreen('preferences')}
          onSearch={() => setScreen('results')}
        />
      )}
      {screen === 'results' && (
        <ResultsScreen
          criteria={criteria}
          preferences={preferences}
          onChange={() => setScreen('search')}
        />
      )}
    </div>
  );
}

export default App;
