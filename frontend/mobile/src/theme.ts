/** Кольори з десктопної версії, щоб обидва клієнти виглядали одним продуктом. */
export const theme = {
  bg: "#F7F5EE",
  surface: "#FFFFFF",
  surfaceSoft: "#FBFAF5",
  ink: "#23261C",
  inkSoft: "#4A4E3E",
  // Не світліше: попередній #80836F давав на білому лише 3.9:1 при нормі 4.5.
  muted: "#696C58",
  line: "#E7E3D4",
  lineSoft: "#F0EDE2",
  olive: "#5A6B3A",
  oliveDeep: "#3B4726",
  oliveTint: "#ECEEDF",
  negative: "#B4442C",
  negativeTint: "#FBECE8",
  positive: "#5B8C50",
  gold: "#A07A1F",
  goldTint: "#FBF3DF",
  // Темні картки — головна сума й асистент — і кремовий акцент на них.
  forest: "#3B4727",
  night: "#1C2116",
  cream: "#EFE6CC",
  oliveSoft: "#A9B98A",
} as const;

/**
 * Шрифти завантажує App.tsx. Unbounded — для заголовків і великих сум,
 * JetBrains Mono — для дрібних підписів і чисел у рядках, як на десктопі.
 */
export const fonts = {
  display: "Unbounded_600SemiBold",
  displayBold: "Unbounded_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;

export const CATEGORY_COLORS_FALLBACK = theme.muted;
