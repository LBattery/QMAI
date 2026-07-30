export const DEFAULT_UI_FONT_FAMILY = "system" as const

export const UI_FONT_OPTIONS = [
  {
    value: "system",
    label: "本机默认",
    cssFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
  },
  {
    value: "microsoft-yahei",
    label: "微软雅黑",
    cssFamily: '"Microsoft YaHei", "Microsoft JhengHei", "PingFang SC", system-ui, sans-serif',
  },
  {
    value: "simsun",
    label: "宋体",
    cssFamily: 'SimSun, "Songti SC", serif',
  },
  {
    value: "kaiti",
    label: "楷体",
    cssFamily: 'KaiTi, "Kaiti SC", serif',
  },
  {
    value: "fangsong",
    label: "仿宋",
    cssFamily: 'FangSong, "Fangsong SC", serif',
  },
  {
    value: "dengxian",
    label: "等线",
    cssFamily: 'DengXian, "Microsoft YaHei", system-ui, sans-serif',
  },
  {
    value: "arial",
    label: "Arial",
    cssFamily: 'Arial, "Microsoft YaHei", system-ui, sans-serif',
  },
] as const

export type UiFontFamily = (typeof UI_FONT_OPTIONS)[number]["value"]

const UI_FONT_FAMILY_VALUES = new Set<string>(UI_FONT_OPTIONS.map((option) => option.value))

export function normalizeUiFontFamily(value: unknown): UiFontFamily {
  return typeof value === "string" && UI_FONT_FAMILY_VALUES.has(value)
    ? (value as UiFontFamily)
    : DEFAULT_UI_FONT_FAMILY
}

export function getUiFontFamilyCss(value: unknown): string {
  const normalized = normalizeUiFontFamily(value)
  return UI_FONT_OPTIONS.find((option) => option.value === normalized)?.cssFamily
    ?? UI_FONT_OPTIONS[0].cssFamily
}

export function applyUiFontFamily(value: unknown, root?: HTMLElement): void {
  if (typeof document === "undefined" && !root) return
  const target = root ?? document.documentElement
  target.style.setProperty("--qmai-ui-font-family", getUiFontFamilyCss(value))
}
