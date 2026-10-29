import type { LucideIcon } from "lucide-react";
import { formatPercent, splitMoney } from "../lib/format";

interface KpiTileProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Колір значка: дохід — зелений, витрати — червонуватий. */
  tone: "positive" | "negative";
  change?: number | null;
  changeHint?: string;
  invertTrend?: boolean;
}

export function KpiTile({
  label,
  value,
  icon: Icon,
  tone,
  change,
  changeHint = "від попереднього місяця",
  invertTrend = false,
}: KpiTileProps) {
  const hasChange = change !== undefined && change !== null && Number.isFinite(change);
  const isGood = hasChange && (invertTrend ? change! <= 0 : change! >= 0);
  const [amount, currency] = splitMoney(value);

  return (
    <div className="card flex flex-col justify-between p-6">
      <div className="flex items-start justify-between">
        <span className="eyebrow pt-2 text-muted">{label}</span>
        <span
          className={`inline-flex size-9 items-center justify-center rounded-xl ${
            tone === "positive" ? "bg-positive-tint text-positive" : "bg-negative-tint text-negative"
          }`}
        >
          <Icon size={17} strokeWidth={2} />
        </span>
      </div>
      <p className="mt-3 whitespace-nowrap font-display text-[34px] font-semibold leading-none tracking-tight">
        {amount}
        <span className="ml-1.5">{currency}</span>
      </p>
      {hasChange && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span
            className={`chip font-mono ${isGood ? "bg-positive-tint text-positive" : "bg-negative-tint text-negative"}`}
          >
            {formatPercent(change!)}
          </span>
          {changeHint}
        </p>
      )}
    </div>
  );
}
