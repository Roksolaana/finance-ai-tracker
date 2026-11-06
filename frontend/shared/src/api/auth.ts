import { API_URL } from "../constants";
import { request } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface AuthResult {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export function createAuthApi(baseUrl: string = API_URL) {
  const root = `${baseUrl}/auth`;

  return {
    async register(email: string, password: string, displayName: string): Promise<AuthResult> {
      return request<AuthResult>(`${root}/register`, {
        method: "POST",
        body: JSON.stringify({ email, password, display_name: displayName }),
      });
    },
    async login(email: string, password: string): Promise<AuthResult> {
      return request<AuthResult>(`${root}/login`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },
    /** Перевіряє, що збережений токен ще дійсний. */
    async me(): Promise<AuthUser> {
      return request<AuthUser>(`${root}/me`);
    },
    /**
     * Міняє пароль. Сервер відкликає всі старі токени й повертає новий —
     * його треба зберегти, інакше наступний запит отримає 401.
     */
    async changePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
      return request<AuthResult>(`${root}/change-password`, {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
    },
    /** Відкликає всі токени акаунта, включно з поточним. */
    async logoutAll(): Promise<void> {
      return request<void>(`${root}/logout-all`, { method: "POST" });
    },
    /** Видаляє акаунт і всі його дані. Скасувати не можна. */
    async deleteAccount(password: string): Promise<void> {
      return request<void>(`${root}/me`, { method: "DELETE", body: JSON.stringify({ password }) });
    },
  };
}
