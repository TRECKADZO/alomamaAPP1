import { useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { api } from "./api";

// ---------------------------------------------------------------------------
// Connectivity singleton
// ---------------------------------------------------------------------------
type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let currentOnline = typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : true;

function updateOnline(next: boolean) {
  if (next !== currentOnline) {
    currentOnline = next;
    listeners.forEach((l) => l(next));
    if (next) {
      // attempt to flush queue as soon as we reconnect
      void flushQueue();
    }
  }
}

NetInfo.addEventListener((state: NetInfoState) => {
  const online = !!(state.isConnected && state.isInternetReachable !== false);
  updateOnline(online);
});

// Web fallback — navigator.onLine + online/offline events (NetInfo web is unreliable)
if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("online", () => updateOnline(true));
  window.addEventListener("offline", () => updateOnline(false));
}

export function isOnline(): boolean {
  return currentOnline;
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(currentOnline);
  useEffect(() => {
    const l = (o: boolean) => setOnline(o);
    listeners.add(l);
    // refresh once at mount
    NetInfo.fetch().then((s) => {
      const o = !!(s.isConnected && s.isInternetReachable !== false);
      currentOnline = o;
      setOnline(o);
    });
    return () => {
      listeners.delete(l);
    };
  }, []);
  return online;
}

// ---------------------------------------------------------------------------
// Read-through cache
// ---------------------------------------------------------------------------
const CACHE_PREFIX = "cache:v1:";

export async function cachedGet<T = any>(path: string): Promise<{ data: T; fromCache: boolean }> {
  const key = CACHE_PREFIX + path;
  // Try network first if online
  if (currentOnline) {
    try {
      const { data } = await api.get(path);
      await AsyncStorage.setItem(
        key,
        JSON.stringify({ data, ts: Date.now() }),
      );
      return { data, fromCache: false };
    } catch (e) {
      // fall through to cache
    }
  }
  // Fallback to cache
  const raw = await AsyncStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return { data: parsed.data as T, fromCache: true };
    } catch {
      /* ignore */
    }
  }
  // No cache either → return empty data (array or object) safely
  return { data: [] as any, fromCache: true };
}

export async function clearCache() {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
  await AsyncStorage.multiRemove(cacheKeys);
}

// ---------------------------------------------------------------------------
// Write queue (POST / PATCH / DELETE)
// ---------------------------------------------------------------------------
const QUEUE_KEY = "offline_queue:v1";

export type QueueItem = {
  id: string;
  method: "post" | "patch" | "delete";
  path: string;
  body?: any;
  ts: number;
  tries: number;
  lastError?: string | null;
};

async function readQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueueItem[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  queueListeners.forEach((l) => l(items.length));
}

const queueListeners = new Set<(count: number) => void>();

export function useQueueCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    readQueue().then((q) => setCount(q.length));
    const l = (c: number) => setCount(c);
    queueListeners.add(l);
    return () => {
      queueListeners.delete(l);
    };
  }, []);
  return count;
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function enqueue(item: Omit<QueueItem, "id" | "ts" | "tries">) {
  const q = await readQueue();
  q.push({ ...item, id: genId(), ts: Date.now(), tries: 0 });
  await writeQueue(q);
}

let flushing = false;
export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  if (flushing) return { ok: 0, failed: 0 };
  if (!currentOnline) return { ok: 0, failed: 0 };
  flushing = true;
  let ok = 0;
  let failed = 0;
  try {
    const q = await readQueue();
    const remaining: QueueItem[] = [];
    for (const item of q) {
      try {
        if (item.method === "post") await api.post(item.path, item.body);
        else if (item.method === "patch") await api.patch(item.path, item.body);
        else if (item.method === "delete") await api.delete(item.path);
        ok += 1;
      } catch (e: any) {
        const tries = (item.tries || 0) + 1;
        // drop after 10 failed attempts (invalid data?)
        if (tries < 10) {
          remaining.push({ ...item, tries, lastError: e?.message || String(e) });
        }
        failed += 1;
      }
    }
    await writeQueue(remaining);
  } finally {
    flushing = false;
  }
  return { ok, failed };
}

// Smart write: try online first, fallback to queue
export async function smartPost(path: string, body?: any): Promise<{ queued: boolean; data?: any }> {
  if (currentOnline) {
    try {
      const { data } = await api.post(path, body);
      return { queued: false, data };
    } catch (e: any) {
      // network error -> queue; but business error (4xx/5xx with response) -> throw
      if (e?.response) throw e;
    }
  }
  await enqueue({ method: "post", path, body });
  return { queued: true };
}

export async function smartPatch(path: string, body?: any): Promise<{ queued: boolean; data?: any }> {
  if (currentOnline) {
    try {
      const { data } = await api.patch(path, body);
      return { queued: false, data };
    } catch (e: any) {
      if (e?.response) throw e;
    }
  }
  await enqueue({ method: "patch", path, body });
  return { queued: true };
}

export async function smartDelete(path: string): Promise<{ queued: boolean }> {
  if (currentOnline) {
    try {
      await api.delete(path);
      return { queued: false };
    } catch (e: any) {
      if (e?.response) throw e;
    }
  }
  await enqueue({ method: "delete", path });
  return { queued: true };
}

// Hook that auto-flushes the queue every 30s when online
export function useAutoSync() {
  const online = useOnlineStatus();
  useEffect(() => {
    if (!online) return;
    // flush immediately
    void flushQueue();
    const id = setInterval(() => {
      if (currentOnline) void flushQueue();
    }, 30000);
    return () => clearInterval(id);
  }, [online]);
}

// Utility for screens: returns data + loading + refetch
export function useCachedGet<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const online = useOnlineStatus();

  const refetch = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const r = await cachedGet<T>(path);
      setData(r.data);
      setFromCache(r.fromCache);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void refetch();
  }, [refetch, online]);

  return { data, fromCache, loading, refetch };
}
