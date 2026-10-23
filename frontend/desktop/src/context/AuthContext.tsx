import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, createAuthApi, setAuthToken, setUnauthorizedHandler, type AuthUser } from "@finance/shared";

const authApi = createAuthApi("/api/v1");
const TOKEN_KEY = "krona.token";

// localStorage може бути недоступний (приватний режим, заблоковані дані сайту),
// тому кожне звернення обгорнуте — застосунок має працювати і без нього.
function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Токен лишиться тільки в памʼяті — до перезавантаження сторінки.
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  /** true, поки перевіряємо збережений токен — інтерфейс ще не вирішив, що показати. */
  checking: boolean;
  /** Збережений токен є, але сервер не відповів — невідомо, чи він ще дійсний. */
  offline: boolean;
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [offline, setOffline] = useState(false);
  // Кожне збільшення — нова спроба перевірити збережений токен.
  const [attempt, setAttempt] = useState(0);

  const logout = useCallback(() => {
    setAuthToken(null);
    writeToken(null);
    setOffline(false);
    setUser(null);
  }, []);

  // Сервер відхилив токен (термін вийшов) — виходимо, щоб показати вхід.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setChecking(false);
      return;
    }
    setAuthToken(token);
    let cancelled = false;
    authApi
      .me()
      .then((loaded) => !cancelled && setUser(loaded))
      .catch((error) => {
        if (cancelled) return;
        // Токен прибираємо лише коли сервер його відхилив. Якщо бекенд просто
        // недоступний (ще не піднявся, перезапускається), користувача не
        // можна мовчки виганяти з акаунта.
        const rejected = error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (rejected) {
          setAuthToken(null);
          writeToken(null);
        } else {
          // Раніше тут просто показувалася сторінка входу, і було незрозуміло,
          // чому застосунок «забув» акаунт.
          setOffline(true);
        }
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setOffline(false);
    setChecking(true);
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const apply = (result: { access_token: string; user: AuthUser }) => {
      setAuthToken(result.access_token);
      writeToken(result.access_token);
      setOffline(false);
      setUser(result.user);
    };
    // Після старту без сервера старий токен лишався в клієнті. Тоді помилка в
    // паролі (401) спрацьовувала як «токен відхилено» і запускала вихід,
    // тож перед входом прибираємо його самі.
    const dropStaleToken = () => {
      setAuthToken(null);
      writeToken(null);
    };
    return {
      user,
      checking,
      offline,
      retry,
      login: async (email, password) => {
        dropStaleToken();
        apply(await authApi.login(email, password));
      },
      register: async (email, password, displayName) => {
        dropStaleToken();
        apply(await authApi.register(email, password, displayName));
      },
      logout,
    };
  }, [user, checking, offline, retry, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
