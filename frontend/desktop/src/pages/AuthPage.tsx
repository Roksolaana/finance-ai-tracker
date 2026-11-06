import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { KronaMark, TreeRings } from "../components/Rings";

type Mode = "login" | "register";

// Рівні кільця тут — лише образ: справжні з'являються на огляді з даними.
const DEMO_RINGS = [3, 5, 4, 7, 6, 9];

const FEATURES = [
  { title: "Облік за хвилину", text: "Сума, категорія, нотатка — і запис уже в статистиці." },
  { title: "Асистент, що не вигадує", text: "Питайте своїми словами — відповідь спирається лише на ваші записи." },
  { title: "Ліміти без сюрпризів", text: "Видно, скільки лишилось, ще до того, як ліміт перевищено." },
];

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRegister && password.length < 8) {
      setError("Пароль має містити щонайменше 8 символів");
      return;
    }

    setBusy(true);
    try {
      if (isRegister) await register(email.trim(), password, displayName.trim());
      else await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося увійти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen gap-4 p-4">
      <aside className="relative hidden w-[46%] max-w-[640px] flex-col overflow-hidden rounded-[32px] bg-forest p-10 text-white shadow-card lg:flex">
        <TreeRings nets={DEMO_RINGS} size={520} className="pointer-events-none absolute -right-36 -top-36 opacity-90" />

        <div className="relative flex items-center gap-3">
          <KronaMark size={44} />
          <span className="font-display text-xl font-semibold tracking-tight">Крона</span>
        </div>

        <div className="relative mt-auto max-w-md pb-4">
          <p className="eyebrow text-olive-soft">Облік особистих фінансів</p>
          <h2 className="mt-3 font-display text-[40px] font-semibold leading-[1.08] tracking-tight">
            Не лише скільки, а й чому
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">
            Крона рахує суми й знаходить витрати за змістом нотаток — питайте своїми словами.
          </p>

          <ul className="mt-9 space-y-4">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="flex gap-4">
                <span className="mt-0.5 font-mono text-xs text-olive-soft">0{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-sm text-white/65">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <KronaMark size={44} />
            <span className="font-display text-xl font-semibold tracking-tight">Крона</span>
          </div>

          <p className="eyebrow text-muted">{isRegister ? "Новий акаунт" : "З поверненням"}</p>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-tight tracking-tight">
            {isRegister ? "Посадімо ваше дерево" : "Увійдіть у Крону"}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {isRegister
              ? "Кілька секунд — і можна додавати перші витрати."
              : "Ваші записи, ліміти й розмова з асистентом чекають."}
          </p>

          <div className="mt-7 flex rounded-2xl bg-surface p-1 shadow-card ring-1 ring-line-soft">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
                className={`h-10 flex-1 cursor-pointer rounded-xl text-sm font-medium transition-colors ${
                  mode === m ? "bg-night text-white shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                {m === "login" ? "Вхід" : "Реєстрація"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isRegister && (
              <div>
                <label htmlFor="auth-name" className="eyebrow mb-2 block text-muted">
                  Ваше імʼя
                </label>
                <input
                  id="auth-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Роксолана"
                  className="input h-12 rounded-2xl px-4 text-[15px]"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="eyebrow mb-2 block text-muted">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="input h-12 rounded-2xl px-4 text-[15px]"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="eyebrow mb-2 block text-muted">
                Пароль
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isRegister ? 8 : undefined}
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder={isRegister ? "щонайменше 8 символів" : "••••••••"}
                className="input h-12 rounded-2xl px-4 text-[15px]"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-2xl bg-negative-tint px-4 py-3 text-sm text-negative">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary h-12 w-full rounded-2xl text-[15px] disabled:opacity-60">
              {busy ? "Хвилинку…" : isRegister ? "Створити акаунт" : "Увійти"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isRegister ? "Уже маєте акаунт?" : "Ще не маєте акаунта?"}{" "}
            <button
              onClick={() => switchMode(isRegister ? "login" : "register")}
              className="cursor-pointer font-semibold text-olive underline-offset-4 hover:underline"
            >
              {isRegister ? "Увійти" : "Зареєструватися"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
