import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Plain values in AsyncStorage (localStorage on web); tokens in the phone's secure store where there is one.
export const kv = {
  get: (key: string) => AsyncStorage.getItem(key),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value),
  remove: (key: string) => AsyncStorage.removeItem(key),
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJson: (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)),
  async removePrefix(prefix: string) {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  },
};

const secureAvailable = Platform.OS !== 'web';

export const secure = {
  get: (key: string) => (secureAvailable ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(`secure:${key}`)),
  set: (key: string, value: string) => (secureAvailable ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(`secure:${key}`, value)),
  remove: (key: string) => (secureAvailable ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(`secure:${key}`)),
};
