import { ChevronDown, Check } from 'lucide-react';
import { useState } from 'react';
import { REGIONS } from '@/constants';

interface Props {
  selectedCities: string[];
  selectedRegions: string[];
  onChange: (cities: string[], regions: string[]) => void;
}

function isAllCitiesSelected(regionCities: string[], selected: string[]): boolean {
  return regionCities.every((c) => selected.includes(c));
}

export function RegionCitySelector({ selectedCities, selectedRegions, onChange }: Props) {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const toggleRegionExpand = (regionName: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionName)) next.delete(regionName);
      else next.add(regionName);
      return next;
    });
  };

  const toggleCity = (city: string) => {
    const nextCities = selectedCities.includes(city)
      ? selectedCities.filter((c) => c !== city)
      : [...selectedCities, city];
    onChange(nextCities, selectedRegions);
  };

  const toggleRegion = (region: { name: string; cities: string[] }) => {
    const allSelected = isAllCitiesSelected(region.cities, selectedCities);
    const nextCities = allSelected
      ? selectedCities.filter((c) => !region.cities.includes(c))
      : Array.from(new Set([...selectedCities, ...region.cities]));
    // Selecting a region also stores the region name in selectedRegions
    const nextRegions = allSelected
      ? selectedRegions.filter((r) => r !== region.name)
      : Array.from(new Set([...selectedRegions, region.name]));
    onChange(nextCities, nextRegions);
  };

  const reset = () => onChange([], []);

  return (
    <div className="space-y-2">
      {REGIONS.map((region) => {
        const expanded = expandedRegions.has(region.name);
        const allSelected = isAllCitiesSelected(region.cities, selectedCities);
        const someSelected = region.cities.some((c) => selectedCities.includes(c));
        const indeterminate = someSelected && !allSelected;

        return (
          <div key={region.name} className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => toggleRegion(region)}
                className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors"
                style={{
                  borderColor: allSelected || indeterminate ? '#f43f5e' : 'rgba(255,255,255,0.2)',
                  background: allSelected ? '#f43f5e' : indeterminate ? 'rgba(244,63,94,0.15)' : 'transparent',
                }}
                aria-label={`בחר אזור ${region.name}`}
              >
                {allSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                {indeterminate && <span className="h-0.5 w-3 rounded-full bg-rose-400" />}
              </button>

              <button
                type="button"
                onClick={() => toggleRegionExpand(region.name)}
                className="flex flex-1 items-center justify-between text-right"
              >
                <span className="font-semibold text-gray-100">{region.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {region.cities.filter((c) => selectedCities.includes(c)).length}/{region.cities.length}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
            </div>

            {expanded && (
              <div className="expand-enter border-t border-white/[0.04] bg-black/20 px-4 py-2">
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {region.cities.map((city) => {
                    const checked = selectedCities.includes(city);
                    return (
                      <button
                        type="button"
                        key={city}
                        onClick={() => toggleCity(city)}
                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-white/[0.04]"
                      >
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                          style={{
                            borderColor: checked ? '#f43f5e' : 'rgba(255,255,255,0.2)',
                            background: checked ? '#f43f5e' : 'transparent',
                          }}
                        >
                          {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </span>
                        <span className={checked ? 'text-gray-100' : 'text-gray-400'}>{city}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {selectedCities.length > 0 && (
        <button type="button" onClick={reset} className="btn-ghost mt-2 text-sm">
          איפוס בחירה
        </button>
      )}
    </div>
  );
}

