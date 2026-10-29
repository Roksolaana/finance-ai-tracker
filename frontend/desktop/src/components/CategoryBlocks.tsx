import { CATEGORY_COLORS, type CategoryBreakdownEntry, type TransactionCategory } from "@finance/shared";
import { formatMoney } from "../lib/format";

interface CategoryBlocksProps {
  data: CategoryBreakdownEntry[];
  total: number;
  onSelectCategory?: (category: TransactionCategory) => void;
}

const colorOf = (category: TransactionCategory) => CATEGORY_COLORS[category] ?? CATEGORY_COLORS["інше"];

/** Структура витрат брусками: ширина бруска — частка категорії. */
export function CategoryBlocks({ data, total, onSelectCategory }: CategoryBlocksProps) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="card-title">Куди пішли гроші</h3>
          {/* Легенда — головний шлях до відфільтрованого списку, тож прямо
              кажемо, що категорії клікабельні. */}
          <p className="mt-1 text-xs text-ink-soft">Натисніть на категорію, щоб побачити її записи</p>
        </div>
        <p className="whitespace-nowrap font-display text-[22px] font-semibold tracking-tight">{formatMoney(total)}</p>
      </div>

      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">У цьому місяці витрат немає</p>
      ) : (
        <>
          <div className="mt-5 flex h-12 gap-1.5">
            {data.map((entry) => (
              <button
                key={entry.category}
                onClick={() => onSelectCategory?.(entry.category)}
                title={`${entry.category}: ${formatMoney(entry.amount)} (${entry.percent}%)`}
                aria-label={`Показати записи «${entry.category}»`}
                // Мінімальна ширина — щоб і 1% лишався помітним і клікабельним.
                className="min-w-2.5 cursor-pointer rounded-xl transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
                style={{ flexGrow: entry.amount, flexBasis: 0, background: colorOf(entry.category) }}
              />
            ))}
          </div>

          <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1 @3xl:grid-cols-3 @6xl:grid-cols-4">
            {data.map((entry) => (
              <li key={entry.category}>
                <button
                  onClick={() => onSelectCategory?.(entry.category)}
                  title={`Показати записи «${entry.category}»`}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-olive-tint"
                >
                  <span className="size-3 shrink-0 rounded-[4px]" style={{ background: colorOf(entry.category) }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium first-letter:uppercase">{entry.category}</span>
                  <span className="whitespace-nowrap font-mono text-xs text-ink-soft">{formatMoney(entry.amount)}</span>
                  <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted">{entry.percent}%</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
