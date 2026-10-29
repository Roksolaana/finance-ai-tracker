import { useState } from "react";
import { dayKey, type CashflowPoint } from "@finance/shared";
import { formatDayLabel, formatMoney } from "../lib/format";

const PLOT_HEIGHT = 140;

function isWeekend(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return weekday === 0 || weekday === 6;
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

/**
 * Витрати по днях «льодяниками»: стебло — сума, кружок підсвічує дні понад
 * середнє. Майбутні дні — порожні кружечки, щоб було видно, скільки місяця лишилось.
 */
export function DailyExpensesChart({ data, average }: { data: CashflowPoint[]; average: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const today = dayKey(new Date());
  const todayIndex = data.findIndex((p) => p.date === today);
  const passed = todayIndex === -1 ? (data[0]?.date > today ? 0 : data.length) : todayIndex + 1;
  // Запас зверху, щоб найвищий кружок і підпис над ним не впиралися в край.
  const max = Math.max(average * 1.3, ...data.map((p) => p.expense), 1) * 1.12;
  const averagePct = (average / max) * 100;
  const labelIndex = hovered ?? (todayIndex >= 0 ? todayIndex : null);

  return (
    <div className="card px-7 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="card-title">Щоденні витрати</h3>
          <p className="mt-1 font-mono text-xs text-muted">
            сер. {formatMoney(average)} / день · {passed < data.length ? `${passed} з ${data.length}` : data.length} днів
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-ink-soft">
          <Legend className="bg-olive" label="у межах середнього" />
          <Legend className="bg-gold" label="вище середнього" />
          {passed < data.length && <Legend className="border border-dashed border-muted" label="попереду" />}
        </div>
      </div>

      <div className="relative" onMouseLeave={() => setHovered(null)}>
        <div className="relative flex" style={{ height: PLOT_HEIGHT }}>
          <div className="absolute inset-x-0 bottom-0 border-t border-line" />
          {average > 0 && (
            <div className="pointer-events-none absolute inset-x-0" style={{ bottom: `${averagePct}%` }}>
              <div className="border-t border-dotted border-gold/70" />
              <span className="absolute -top-2.5 right-0 rounded-md bg-gold-tint px-1.5 font-mono text-[10px] leading-5 text-gold">
                середнє
              </span>
            </div>
          )}

          {data.map((point, i) => {
            const future = i >= passed;
            const pct = (point.expense / max) * 100;
            const above = point.expense > average;
            const isToday = i === todayIndex;
            return (
              <div
                key={point.date}
                onMouseEnter={() => !future && setHovered(i)}
                className="relative flex-1"
                aria-label={future ? undefined : `${formatDayLabel(point.date)}: ${formatMoney(point.expense)}`}
                role={future ? undefined : "img"}
              >
                {future ? (
                  <span className="absolute bottom-0 left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full border border-dashed border-muted/70 bg-surface" />
                ) : (
                  <>
                    <span
                      className={`absolute bottom-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full ${
                        isToday ? "bg-ink" : above ? "bg-[#e2cf9b]" : "bg-olive-soft"
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                    <span
                      className={`absolute left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full transition-transform ${
                        isToday ? "size-2.5 bg-ink ring-2 ring-white" : `size-3.5 ${above ? "bg-gold" : "bg-olive"}`
                      } ${hovered === i ? "scale-125" : ""}`}
                      style={{ bottom: `${pct}%` }}
                    />
                  </>
                )}
                {labelIndex === i && (
                  <span
                    className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-night px-2 py-1 font-mono text-[11px] text-white shadow-pop"
                    style={{ bottom: `calc(${pct}% + 14px)` }}
                  >
                    {isToday ? "сьогодні" : formatDayLabel(point.date)} · {formatMoney(point.expense)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex">
          {data.map((point, i) => (
            <span
              key={point.date}
              className={`flex-1 text-center font-mono text-[11px] ${
                i === todayIndex ? "font-semibold text-ink" : isWeekend(point.date) ? "text-gold" : "text-muted"
              }`}
            >
              {Number(point.date.slice(8))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
