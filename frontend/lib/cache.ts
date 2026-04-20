import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const PREFIX = "cache:";

export async function cachedGet<T>(url: string): Promise<T> {
  const key = PREFIX + url;
  try {
    const { data } = await api.get(url);
    await AsyncStorage.setItem(key, JSON.stringify({ data, at: Date.now() }));
    return data as T;
  } catch (e) {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.data as T;
    }
    throw e;
  }
}

export async function clearCache() {
  const keys = await AsyncStorage.getAllKeys();
  const toDel = keys.filter((k) => k.startsWith(PREFIX));
  if (toDel.length) await AsyncStorage.multiRemove(toDel);
}
