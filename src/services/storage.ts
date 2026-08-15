import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserPreferences {
  selectedCities: string[];
  selectedLanguages: string[];
  useLocation: boolean;
  /** IDs of the cinema chains selected by the user. */
  favoriteCinemas?: string[];
}

const USER_PREFERENCES_KEY = 'user-preferences';

export async function saveUserPreferences(preferences: UserPreferences): Promise<void> {
  await AsyncStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(preferences));
}

export async function getUserPreferences(): Promise<UserPreferences | null> {
  const stored = await AsyncStorage.getItem(USER_PREFERENCES_KEY);
  if (!stored) return null;

  try {
    const preferences: unknown = JSON.parse(stored);
    if (
      typeof preferences !== 'object' ||
      preferences === null ||
      !Array.isArray((preferences as UserPreferences).selectedCities) ||
      !Array.isArray((preferences as UserPreferences).selectedLanguages) ||
      typeof (preferences as UserPreferences).useLocation !== 'boolean'
    ) {
      return null;
    }

    return preferences as UserPreferences;
  } catch {
    return null;
  }
}

export async function clearUserPreferences(): Promise<void> {
  await AsyncStorage.removeItem(USER_PREFERENCES_KEY);
}