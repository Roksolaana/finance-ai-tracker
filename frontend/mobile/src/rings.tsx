import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ringLayout } from "@finance/shared";
import { theme } from "@/theme";

// Від внутрішніх (старих) кілець до зовнішніх світлішає, як деревина.
const SHADES = ["#556536", "#647643", "#738650", "#83965f", "#94a770", "#a6b884"];

function Disc({ r, color, size }: { r: number; color: string; size: number }) {
  return (
    <View
      style={{
        position: "absolute",
        left: size / 2 - r,
        top: size / 2 - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        backgroundColor: color,
      }}
    />
  );
}

/**
 * Кільця за місяцями, як на десктопі. Без SVG: кожне кільце — круг свого
 * кольору, поверх нього круг кольору тла менший на товщину кільця.
 */
export function TreeRings({
  nets,
  size,
  background = theme.forest,
  highlight,
  style,
}: {
  nets: number[];
  size: number;
  background?: string;
  /** Яке кільце підсвітити; за замовчуванням — останнє, тобто поточний місяць. */
  highlight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { core, rings } = ringLayout(nets, size / 2);
  const discs: { r: number; color: string }[] = [];
  const lit = highlight ?? rings.length - 1;
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    discs.push({ r: ring.outer, color: i === lit ? theme.cream : SHADES[Math.min(i, SHADES.length - 1)] });
    discs.push({ r: ring.inner, color: background });
  }
  discs.push({ r: core, color: "#4d5c31" });

  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      {discs.map((d, i) => (
        <Disc key={i} r={d.r} color={d.color} size={size} />
      ))}
    </View>
  );
}

/** Знак Крони — зріз стовбура. */
export function KronaMark({ size = 44 }: { size?: number }) {
  const ring = (r: number, opacity = 1) => ({
    position: "absolute" as const,
    left: size / 2 - r,
    top: size / 2 - r,
    width: r * 2,
    height: r * 2,
    borderRadius: r,
    borderWidth: size * 0.045,
    borderColor: theme.cream,
    opacity,
  });
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <View style={ring(size * 0.31)} />
      <View style={ring(size * 0.19, 0.75)} />
      <View
        style={{
          position: "absolute",
          left: size / 2 - size * 0.075,
          top: size / 2 - size * 0.075,
          width: size * 0.15,
          height: size * 0.15,
          borderRadius: size,
          backgroundColor: theme.cream,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { backgroundColor: theme.forest },
});
