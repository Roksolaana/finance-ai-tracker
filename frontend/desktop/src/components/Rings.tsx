import { ringLayout } from "@finance/shared";

/** Знак Крони — зріз стовбура з кільцями. */
export function KronaMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[30%] bg-forest shadow-[0_6px_16px_-8px_rgb(59_71_38/0.8)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="#efe6cc">
        <circle cx="12" cy="12" r="10" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="6.2" strokeWidth="1.6" opacity="0.75" />
        <circle cx="12" cy="12" r="2.4" fill="#efe6cc" stroke="none" />
      </svg>
    </span>
  );
}

// Від внутрішніх (старих) кілець до зовнішніх світлішає, як деревина.
const RING_SHADES = ["#556536", "#647643", "#738650", "#83965f", "#94a770", "#a6b884"];

/**
 * Кільця за місяцями: товщина — скільки відкладено, зовнішнє кремове —
 * вибраний місяць. Порожній масив дає рівні декоративні кільця.
 */
export function TreeRings({ nets, size = 280, className = "" }: { nets: number[]; size?: number; className?: string }) {
  const half = size / 2;
  const { core, rings } = ringLayout(nets, half * 0.86);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className={className} aria-hidden>
      <circle cx={half} cy={half} r={half - 2} fill="none" stroke="#a9b98a" strokeOpacity="0.35" strokeDasharray="1.5 5" />
      <circle cx={half} cy={half} r={core} fill="#4d5c31" />
      {rings.map((ring, i) => (
        <circle
          key={i}
          cx={half}
          cy={half}
          r={(ring.inner + ring.outer) / 2}
          fill="none"
          strokeWidth={ring.outer - ring.inner}
          stroke={ring.current ? "#efe6cc" : RING_SHADES[Math.min(i, RING_SHADES.length - 1)]}
        />
      ))}
    </svg>
  );
}
