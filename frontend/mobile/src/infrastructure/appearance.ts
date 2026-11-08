import * as SecureStore from 'expo-secure-store'
import { Appearance } from 'react-native'
import type { AppearanceAdapter } from '../application/ports'

const storageKey = 'habits.appearance.v1'
export const appearanceAdapter: AppearanceAdapter = {
  read: () => SecureStore.getItemAsync(storageKey),
  write: (value) => SecureStore.setItemAsync(storageKey, value),
  apply: (value) =>
    Appearance.setColorScheme(value === 'system' ? 'auto' : value),
}
