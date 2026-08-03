import { Check, MapPin, Film, Languages, ArrowLeft, Clapperboard, Globe, Locate } from 'lucide-react';
import { CHAINS, LANGUAGES } from '@/constants';
import type { Preferences } from '@/types';
import { RegionCitySelector } from '@/components/RegionCitySelector';
import { getCinemaNamesForSelection } from '@/utils/cinemaMapping';

interface Props {
  preferences: Preferences;
  onChange: (prefs: Preferences) => void;
  onContinue: () => void;
}

export function PreferencesScreen({ preferences, onChange, onContinue }: Props) {
  const toggleChain = (id: string) => {
    const selected = preferences.selectedChains.includes(id as never)
      ? preferences.selectedChains.filter((c) => c !== id)
      : [...preferences.selectedChains, id] as Preferences['selectedChains'];
    onChange({ ...preferences, selectedChains: selected });
  };

  const toggleLang = (lang: string) => {
    const selected = preferences.selectedLanguages.includes(lang as never)
      ? preferences.selectedLanguages.filter((l) => l !== lang)
      : [...preferences.selectedLanguages, lang] as Preferences['selectedLanguages'];
    onChange({ ...preferences, selectedLanguages: selected });
  };

  // "By Regions & Cities" is the only active mode — the GPS/current-location
  // option is disabled ("בקרוב"). Requiring at least one city ensures the
  // user picks a concrete area before proceeding.
  const hasLocation =
    preferences.locationMode === 'regions' && preferences.selectedCities.length > 0;
  const hasChain = preferences.selectedChains.length > 0;
  const canContinue = hasLocation && hasChain;

  return (
    <div className="screen-enter mx-auto max-w-3xl px-4 pb-32 pt-10 sm:pt-16">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600/20 to-rose-500/5 ring-1 ring-rose-500/20">
          <Clapperboard className="h-7 w-7 text-rose-400" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          הגדרת העדפות צפייה
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-400">
          בחר את המיקום, רשתות הקולנוע והשפות המועדפות עליך כדי שנוכל להתאים עבורך הקרנות רלוונטיות.
        </p>
      </div>

      {/* Location */}
      <section className="cinema-card mb-6 p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <MapPin className="h-5 w-5 text-rose-400" />
          <h2 className="text-lg font-bold text-white">העדפות מיקום</h2>
        </div>

        <div className="space-y-2">
          <label
            className={`flex cursor-not-allowed items-center gap-3 rounded-xl border px-4 py-3.5 opacity-50 transition-all ${
              preferences.locationMode === 'current'
                ? 'border-rose-500/40 bg-rose-500/[0.07]'
                : 'border-white/[0.06] bg-white/[0.02]'
            }`}
            title="זמין בקרוב"
          >
            <input
              type="radio"
              name="locationMode"
              className="sr-only"
              disabled
              checked={preferences.locationMode === 'current'}
              onChange={() => {}}
            />
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                preferences.locationMode === 'current' ? 'border-rose-500' : 'border-gray-500'
              }`}
            >
              {preferences.locationMode === 'current' && <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />}
            </span>
            <Locate className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-gray-500">לפי מיקום נוכחי</span>
            <span className="mr-auto flex items-center gap-1.5">
              <span className="text-xs text-gray-500">רדיוס 15 ק"מ</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                בקרוב
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 transition-all ${
              preferences.locationMode === 'regions'
                ? 'border-rose-500/40 bg-rose-500/[0.07]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
            }`}
          >
            <input
              type="radio"
              name="locationMode"
              className="sr-only"
              checked={preferences.locationMode === 'regions'}
              onChange={() => onChange({ ...preferences, locationMode: 'regions' })}
            />
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                preferences.locationMode === 'regions' ? 'border-rose-500' : 'border-gray-500'
              }`}
            >
              {preferences.locationMode === 'regions' && <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />}
            </span>
            <MapPin className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-gray-100">בחירת אזורים וערים</span>
          </label>
        </div>

        {preferences.locationMode === 'regions' && (
          <div className="expand-enter mt-4">
            <RegionCitySelector
              selectedCities={preferences.selectedCities}
              selectedRegions={preferences.selectedRegions}
              onChange={(cities, regions) => {
                // Derive the full cinema branch names mapped from the chosen
                // cities/regions and store them in the active filter state.
                const branches = getCinemaNamesForSelection(cities, regions);
                onChange({
                  ...preferences,
                  selectedCities: cities,
                  selectedRegions: regions,
                  selectedBranches: branches,
                });
              }}
            />
          </div>
        )}
      </section>

      {/* Chains */}
      <section className="cinema-card mb-6 p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <Film className="h-5 w-5 text-rose-400" />
          <h2 className="text-lg font-bold text-white">רשתות קולנוע מועדפות</h2>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CHAINS.map((chain) => {
            const checked = preferences.selectedChains.includes(chain.id);
            return (
              <button
                type="button"
                key={chain.id}
                onClick={() => toggleChain(chain.id)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all ${
                  checked
                    ? 'border-rose-500/40 bg-rose-500/[0.07]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
                  style={{
                    borderColor: checked ? '#f43f5e' : 'rgba(255,255,255,0.2)',
                    background: checked ? '#f43f5e' : 'transparent',
                  }}
                >
                  {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </span>
                <span className={`font-medium ${checked ? 'text-gray-100' : 'text-gray-400'}`}>
                  {chain.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Languages */}
      <section className="cinema-card mb-6 p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <Languages className="h-5 w-5 text-rose-400" />
          <h2 className="text-lg font-bold text-white">שפות מועדפות</h2>
        </div>
        <p className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
          <Globe className="h-3.5 w-3.5" />
          לא חובה - אם לא תבחר, יוצגו כל השפות
        </p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => {
            const checked = preferences.selectedLanguages.includes(lang);
            return (
              <button
                type="button"
                key={lang}
                onClick={() => toggleLang(lang)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                  checked
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                    : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/20 hover:text-gray-200'
                }`}
              >
                {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                {lang}
              </button>
            );
          })}
        </div>
      </section>

      {/* Continue */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.06] bg-[#0a0a0f]/85 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="text-sm text-gray-400">
            {!hasLocation && <span>בחר לפחות עיר אחת</span>}
            {hasLocation && !hasChain && <span>בחר לפחות רשת קולנוע אחת</span>}
            {canContinue && <span className="text-rose-300">מוכן להמשך</span>}
          </div>
          <button type="button" onClick={onContinue} disabled={!canContinue} className="btn-primary">
            המשך למציאת סרטים
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
