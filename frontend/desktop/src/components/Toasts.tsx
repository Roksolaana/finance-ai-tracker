import { CircleCheck, X } from "lucide-react";
import { useUi } from "../context/UiContext";

export function Toasts() {
  const { toasts, dismissToast } = useUi();

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink py-2.5 pl-4 pr-2 text-sm text-white shadow-pop animate-[toast-in_.2s_ease-out]"
        >
          <CircleCheck size={17} className="text-olive-soft" />
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
