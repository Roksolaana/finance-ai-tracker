interface KpiTileProps {
  label: string;
  value: string;
  changeLabel: string;
  trend: "up" | "down";
  iconPath: string;
}

export function KpiTile({ label, value, changeLabel, trend, iconPath }: KpiTileProps) {
  const chipClass = trend === "up" ? "chip-pos" : "chip-neg";
  const arrowPath = trend === "up" ? "M7 17l5-5 5 5M12 12V5" : "M7 7l5 5 5-5M12 12v7";

  return (
    <div className="tile p-5">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium text-muted">{label}</span>
        <div className="tile-icon w-8 h-8 rounded-lg flex items-center justify-center">
          <svg className="icon w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path d={iconPath} />
          </svg>
        </div>
      </div>
      <div className="font-mono tabular-nums text-[28px] font-semibold tracking-tight text-ink mb-2">{value}</div>
      <div className="flex items-center gap-2">
        <span className={`${chipClass} inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium`}>
          <svg className="icon w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d={arrowPath} />
          </svg>
          {changeLabel}
        </span>
        <span className="text-xs text-muted">проти минулого місяця</span>
      </div>
    </div>
  );
}
