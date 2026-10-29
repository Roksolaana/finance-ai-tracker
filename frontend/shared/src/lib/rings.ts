/**
 * «Річні кільця» Крони: кожне кільце — місяць, його товщина — скільки тоді
 * вдалося відкласти. Найновіший місяць — зовнішнє кільце, як у дерева.
 * Тут лише геометрія; малює кожен клієнт сам (SVG на десктопі, View на телефоні).
 */

export interface Ring {
  /** Радіуси в тих самих одиницях, що й `radius` на вході. */
  inner: number;
  outer: number;
  /** Останній місяць у ряду — його підсвічуємо. */
  current: boolean;
}

export interface RingLayout {
  core: number;
  rings: Ring[];
}

/**
 * @param nets чисті заощадження по місяцях, від найстарішого до вибраного
 * @param radius зовнішній радіус усієї фігури
 */
export function ringLayout(nets: number[], radius: number): RingLayout {
  // Без даних однаково малюємо кілька рівних кілець — щоб фігура не зникала.
  const values = nets.length ? nets.map((n) => Math.max(n, 0)) : [1, 1, 1, 1];
  const max = Math.max(...values, 1);
  // Навіть місяць без заощаджень має тонке кільце: він же був.
  const raw = values.map((v) => 0.25 + 0.75 * (v / max));
  const gapShare = 0.35;
  const coreShare = 1.4;
  const totalShare = coreShare + raw.reduce((s, w) => s + w + gapShare, 0);
  const unit = radius / totalShare;

  let r = coreShare * unit;
  const rings = raw.map((w, i) => {
    const inner = r + gapShare * unit;
    const outer = inner + w * unit;
    r = outer;
    return { inner, outer, current: i === raw.length - 1 };
  });
  return { core: coreShare * unit, rings };
}
