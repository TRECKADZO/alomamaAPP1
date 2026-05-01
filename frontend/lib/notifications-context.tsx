/**
 * Contexte global de gestion des notifications À lo Maman.
 *
 * Responsabilités :
 *  - Polling auto du compteur de notifications non-lues toutes les 30s
 *  - Synchronisation du badge sur l'icône de l'app (iOS + Android)
 *  - Émission d'événements pour la bannière in-app (toast)
 *  - API publique pour les composants : useNotifications()
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "./api";
import { useAuth } from "./auth";

// Type d'une notification "in-app" (issue de la BDD MongoDB)
export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
}

// Toast à afficher temporairement en haut de l'écran
export interface ToastNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  timestamp: number;
}

interface NotifContextValue {
  unreadCount: number;
  notifications: AppNotification[];
  loading: boolean;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  // toast in-app
  toast: ToastNotification | null;
  showToast: (title: string, body: string, type?: string) => void;
  dismissToast: () => void;
}

const NotificationsContext = createContext<NotifContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 30000; // 30s

async function setBadgeCountSafe(n: number) {
  try {
    if (Platform.OS === "web") return;
    await Notifications.setBadgeCountAsync(Math.max(0, n));
  } catch {
    // pas grave si la plateforme ne supporte pas
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const pollRef = useRef<any>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      await setBadgeCountSafe(0);
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.get("/notifications");
      const list: AppNotification[] = Array.isArray(data) ? data : [];
      setNotifications(list);
      const unread = list.filter((n) => !n.read).length;
      await setBadgeCountSafe(unread);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  }, [user]);

  const markAllRead = useCallback(async () => {
    try {
      await api.post("/notifications/read-all");
    } catch {}
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await setBadgeCountSafe(0);
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {}
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      const unread = next.filter((n) => !n.read).length;
      setBadgeCountSafe(unread);
      return next;
    });
  }, []);

  // Toast helpers
  const showToast = useCallback((title: string, body: string, type: string = "info") => {
    setToast({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      body,
      type,
      timestamp: Date.now(),
    });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Démarrer le polling quand l'utilisateur est connecté
  useEffect(() => {
    if (!user) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setNotifications([]);
      setBadgeCountSafe(0);
      return;
    }
    refresh();
    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, refresh]);

  // Re-fetch quand l'app revient au premier plan
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === "active" && user) refresh();
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [user, refresh]);

  const value: NotifContextValue = {
    unreadCount,
    notifications,
    loading,
    refresh,
    markAllRead,
    markRead,
    toast,
    showToast,
    dismissToast,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotifContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    // Hook hors provider — fallback sécurisé pour ne pas crasher l'app
    return {
      unreadCount: 0,
      notifications: [],
      loading: false,
      refresh: async () => {},
      markAllRead: async () => {},
      markRead: async () => {},
      toast: null,
      showToast: () => {},
      dismissToast: () => {},
    };
  }
  return ctx;
}
