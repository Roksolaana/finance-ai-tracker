import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Остання лінія захисту: без неї будь-яка помилка рендеру дає білий екран. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Помилка рендеру:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-md p-7 text-center">
          <h1 className="font-display text-lg font-semibold">Щось зламалося</h1>
          <p className="mt-2 text-sm text-muted">
            Сторінку не вдалося показати. Спробуйте перезавантажити — дані в базі не зміняться.
          </p>
          <p className="mt-4 rounded-xl bg-milk-deep px-3.5 py-2.5 text-left font-mono text-xs break-words text-ink-soft">
            {error.message}
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-6 w-full">
            Перезавантажити
          </button>
        </div>
      </div>
    );
  }
}
