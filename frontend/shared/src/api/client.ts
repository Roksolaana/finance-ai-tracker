export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Викликається, коли сервер відхилив наш токен — щоб застосунок вийшов з акаунта. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** Витягує читабельний текст з відповіді FastAPI (HTTPException або 422-валідація). */
async function describeError(res: Response): Promise<string> {
  try {
    const detail = (await res.json())?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      // Pydantic додає до власних помилок префікс "Value error, " — він тут зайвий.
      const message = detail
        .map((item) => String(item?.msg ?? "").replace(/^Value error, /, ""))
        .filter(Boolean)
        .join("; ");
      if (message) return message;
    }
  } catch {
    // тіло не JSON — лишаємо загальне повідомлення
  }
  return `Помилка сервера (${res.status})`;
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  const sentToken = authToken;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new ApiError("Немає зʼєднання із сервером", 0);
  }
  if (!res.ok) {
    // Токен був, але сервер його відхилив — термін вийшов або акаунт видалено.
    // Для невдалого входу (токена не було) вихід ініціювати не треба.
    if (res.status === 401 && sentToken) onUnauthorized?.();
    throw new ApiError(await describeError(res), res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
