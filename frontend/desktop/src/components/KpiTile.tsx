interface KpiTileProps {
  label: string;
  value: string;
  iconPath: string;
}

export function KpiTile({ label, value, iconPath }: KpiTileProps) {
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
      <div className="font-mono tabular-nums text-[28px] font-semibold tracking-tight text-ink">{value}</div>
    </div>
  );
}
