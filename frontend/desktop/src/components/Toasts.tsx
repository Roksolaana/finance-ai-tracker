import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useUi } from "../context/UiContext";

export function Toasts() {
  const { toasts, dismissToast } = useUi();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : undefined}
          className={`pointer-events-auto flex items-center gap-3 rounded-2xl py-2.5 pl-4 pr-2 text-sm text-white shadow-pop animate-[toast-in_.2s_ease-out] ${
            toast.tone === "error" ? "bg-negative" : "bg-ink"
          }`}
        >
          {toast.tone === "error" ? (
            <CircleAlert size={17} className="text-white" />
          ) : (
            <CircleCheck size={17} className="text-olive-soft" />
          )}
          <span>{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick();
                dismissToast(toast.id);
              }}
              className="rounded-lg px-2.5 py-1 font-medium text-olive-soft hover:bg-white/10"
            >
              {toast.action.label}
            </button>
          )}
          <button onClick={() => dismissToast(toast.id)} className="rounded-lg p-1 text-white/60 hover:bg-white/10" aria-label="Закрити">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
