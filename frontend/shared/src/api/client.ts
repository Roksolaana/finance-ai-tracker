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

const CYRILLIC = /[а-яіїєґ]/i;

/**
 * Витягує читабельний текст з відповіді FastAPI (HTTPException або 422-валідація).
 *
 * Людині показуємо не код і не id запису, а що сталося й що робити:
 * «Помилка сервера (500)» чи «Транзакцію з id=3f2c… не знайдено» їй нічого
 * не кажуть.
 */
async function describeError(res: Response): Promise<string> {
  let detail: unknown;
  try {
    detail = (await res.json())?.detail;
  } catch {
    // тіло не JSON — лишаються загальні повідомлення нижче
  }

  if (res.status === 404) {
    // Сервер пише «…не знайдено» лише про відсутній запис. Інший 404 — це
    // хибна адреса чи старий бекенд без потрібного маршруту.
    return typeof detail === "string" && detail.includes("не знайдено")
      ? "Запис не знайдено — можливо, його вже видалили"
      : "Сервер не підтримує цю дію. Можливо, його треба оновити";
  }
  // 502 — це провайдер LLM: перевищений ліміт, збій чи таймаут.
  if (res.status === 502) {
    return typeof detail === "string" && detail.includes("ліміт")
      ? "Забагато запитів до асистента. Спробуйте за хвилину"
      : "Асистент зараз не відповідає. Спробуйте трохи згодом";
  }
  if (res.status >= 500 && res.status !== 503) return "Щось пішло не так на сервері. Спробуйте ще раз";

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // Pydantic додає до власних помилок префікс "Value error, " — він тут зайвий.
    // Вбудовані повідомлення англійські; наші власні — українські.
    const message = detail
      .map((item) => String(item?.msg ?? "").replace(/^Value error, /, ""))
      .filter((text) => CYRILLIC.test(text))
      .join("; ");
    return message || "Перевірте введені дані";
  }
  return "Не вдалося виконати дію. Спробуйте ще раз";
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
