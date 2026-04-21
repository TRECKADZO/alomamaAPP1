import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, saveAuth, clearAuth, getStoredUser, TOKEN_KEY } from "./api";
import { clearCache } from "./offline";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerExpoPushToken } from "./push";

export type Role = "maman" | "professionnel" | "admin" | "centre_sante" | "famille";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar?: string | null;
  phone?: string | null;
  specialite?: string | null;
  premium?: boolean;
  premium_until?: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    email: string;
    password: string;
    name: string;
    role: Role;
    phone?: string;
    specialite?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const stored = await getStoredUser();
        if (token && stored) {
          setUser(stored);
          try {
            const { data } = await api.get("/auth/me");
            setUser(data);
          } catch {
            await clearAuth();
            setUser(null);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (credentials: { email?: string; phone?: string; password: string }) => {
    const { data } = await api.post("/auth/login", credentials);
    await saveAuth(data.token, data.user);
    setUser(data.user);
    registerExpoPushToken().catch(() => {});
    return data.user;
  };

  const register = async (payload: any) => {
    const { data } = await api.post("/auth/register", payload);
    await saveAuth(data.token, data.user);
    setUser(data.user);
    registerExpoPushToken().catch(() => {});
    return data.user;
  };

  const logout = async () => {
    await clearAuth();
    await clearCache();
    setUser(null);
  };

  const refresh = async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
    await AsyncStorage.setItem("auth_user", JSON.stringify(data));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
