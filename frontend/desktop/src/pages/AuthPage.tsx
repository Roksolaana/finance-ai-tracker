import { useState } from "react";
import { Sprout } from "lucide-react";
import { useAuth } from "../context/AuthContext";

type Mode = "login" | "register";

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
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-olive text-white shadow-[0_6px_16px_-8px_rgb(59_71_38/0.8)]">
            <Sprout size={24} strokeWidth={2} />
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Крона</h1>
          <p className="mt-1 text-sm text-muted">Облік особистих фінансів</p>
        </div>

        <div className="card p-7">
          <div className="segmented mb-6 w-full [&>button]:flex-1">
            <button type="button" data-active={!isRegister} aria-pressed={!isRegister} onClick={() => switchMode("login")}>
              Вхід
            </button>
            <button type="button" data-active={isRegister} aria-pressed={isRegister} onClick={() => switchMode("register")}>
              Реєстрація
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label htmlFor="auth-name" className="label">
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
                  className="input mt-1.5"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="label">
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
                className="input mt-1.5"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="label">
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
                className="input mt-1.5"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-negative-tint px-3.5 py-2.5 text-sm text-negative">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
              {busy ? "Хвилинку…" : isRegister ? "Створити акаунт" : "Увійти"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          {isRegister ? "Уже маєте акаунт?" : "Ще не маєте акаунта?"}{" "}
          <button
            onClick={() => switchMode(isRegister ? "login" : "register")}
            className="font-medium text-olive underline hover:text-olive-deep"
          >
            {isRegister ? "Увійти" : "Зареєструватися"}
          </button>
        </p>
      </div>
    </div>
  );
}
