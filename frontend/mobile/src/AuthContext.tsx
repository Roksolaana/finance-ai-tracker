import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { ApiError, setAuthToken, setUnauthorizedHandler, type AuthUser } from "@finance/shared";
import { authApi } from "./api";

// На телефоні токен лежить у захищеному сховищі ОС, а не в localStorage.
const TOKEN_KEY = "krona_token";

async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function writeToken(token: string | null): Promise<void> {
  try {
    if (token === null) await SecureStore.deleteItemAsync(TOKEN_KEY);
    else await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Сховище недоступне — токен лишиться тільки в памʼяті до перезапуску.
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  const logout = useCallback(() => {
    setAuthToken(null);
    void writeToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await readToken();
      if (!token) {
        if (!cancelled) setChecking(false);
        return;
      }
      setAuthToken(token);
      try {
        const loaded = await authApi.me();
        if (!cancelled) setUser(loaded);
      } catch (error) {
        // Токен прибираємо лише коли сервер його відхилив: якщо бекенд просто
        // недоступний (телефон поза мережею), виганяти з акаунта не можна.
        const rejected = error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (rejected && !cancelled) {
          setAuthToken(null);
          await writeToken(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const apply = async (result: { access_token: string; user: AuthUser }) => {
      setAuthToken(result.access_token);
      await writeToken(result.access_token);
      setUser(result.user);
    };
    return {
      user,
      checking,
      login: async (email, password) => apply(await authApi.login(email, password)),
      register: async (email, password, displayName) =>
        apply(await authApi.register(email, password, displayName)),
      logout,
    };
  }, [user, checking, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
