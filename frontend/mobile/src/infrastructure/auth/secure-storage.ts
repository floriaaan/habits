import * as SecureStore from 'expo-secure-store'
import type { CredentialStorage } from './vault'
const key = 'habits.credentials.v1'
export const secureStorage: CredentialStorage = {
  read: () => SecureStore.getItemAsync(key),
  write: (value) =>
    value === null
      ? SecureStore.deleteItemAsync(key)
      : SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
}
