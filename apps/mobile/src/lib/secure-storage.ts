// Cross-platform key/value storage for auth tokens.
//
// `expo-secure-store` ships an empty stub on web (literally `export default {}`),
// so calling its methods in a browser throws "is not a function". We detect that
// case by checking whether the methods actually exist on the imported module —
// this avoids depending on `react-native`'s `Platform` (which keeps the wrapper
// importable from Node-based tests without mocking the entire RN runtime).

import * as SecureStore from "expo-secure-store";

const hasNativeStore = typeof (SecureStore as { getItemAsync?: unknown }).getItemAsync === "function";

export async function getItemAsync(key: string): Promise<string | null> {
  if (hasNativeStore) return SecureStore.getItemAsync(key);
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (hasNativeStore) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  globalThis.localStorage?.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (hasNativeStore) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  globalThis.localStorage?.removeItem(key);
}
