/** Кольори з десктопної версії, щоб обидва клієнти виглядали одним продуктом. */
export const theme = {
  bg: "#F7F5EE",
  surface: "#FFFFFF",
  surfaceSoft: "#FBFAF5",
  ink: "#23261C",
  inkSoft: "#4A4E3E",
  muted: "#80836F",
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
} as const;

export const CATEGORY_COLORS_FALLBACK = theme.muted;
