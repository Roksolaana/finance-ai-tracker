import type { LucideIcon } from "lucide-react";
import { formatPercent } from "../lib/format";

interface KpiTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  change?: number | null;
  changeHint?: string;
  invertTrend?: boolean;
}

export function KpiTile({
  label,
  value,
  icon: Icon,
  change,
  changeHint = "від попереднього місяця",
  invertTrend = false,
}: KpiTileProps) {
  const hasChange = change !== undefined && change !== null && Number.isFinite(change);
  const isGood = hasChange && (invertTrend ? change! <= 0 : change! >= 0);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-olive-tint text-olive">
          <Icon size={17} strokeWidth={1.9} />
        </span>
      </div>
      <p className="text-[26px] font-semibold leading-none tracking-tight">{value}</p>
      {hasChange && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span
            className={`chip ${isGood ? "bg-positive-tint text-positive" : "bg-negative-tint text-negative"}`}
          >
            {formatPercent(change!)}
          </span>
          {changeHint}
        </p>
      )}
    </div>
  );
}
