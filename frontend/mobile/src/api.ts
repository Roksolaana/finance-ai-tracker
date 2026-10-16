import Constants from "expo-constants";
import {
  createAuthApi,
  createBudgetsApi,
  createChatApi,
  createStatsApi,
  createTransactionsApi,
} from "@finance/shared";

/**
 * Адреса бекенду для телефона.
 *
 * `localhost` тут не працює: на пристрої це сам пристрій, а не комп'ютер
 * розробника. Expo Go знає адресу машини, з якої запущено дев-сервер, і
 * тримає її в `hostUri` — беремо хост звідти й підставляємо порт бекенду.
 *
 * Для збірки, яка працює без дев-сервера, адресу можна задати явно через
 * EXPO_PUBLIC_API_URL.
 */
const BACKEND_PORT = 8000;

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return `${explicit.replace(/\/$/, "")}/api/v1`;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  if (host) return `http://${host}:${BACKEND_PORT}/api/v1`;

  // Остання спроба — емулятор Android звертається до машини як 10.0.2.2.
  return `http://10.0.2.2:${BACKEND_PORT}/api/v1`;
}

export const API_BASE_URL = resolveBaseUrl();

export const authApi = createAuthApi(API_BASE_URL);
export const transactionsApi = createTransactionsApi(API_BASE_URL);
export const budgetsApi = createBudgetsApi(API_BASE_URL);
export const statsApi = createStatsApi(API_BASE_URL);
export const chatApi = createChatApi(API_BASE_URL);
