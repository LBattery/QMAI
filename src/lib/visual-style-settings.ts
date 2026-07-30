export type VisualStyle =
  | "classic"
  | "fangzheng"
  | "tianqing"
  | "qingci"
  | "yunshan"
  | "cangzhu"
  | "yuebai"
  | "gumo"

export const DEFAULT_VISUAL_STYLE: VisualStyle = "fangzheng"
export const VISUAL_STYLE_STORAGE_KEY = "qmai-visual-style"
export const VISUAL_STYLE_STORAGE_VERSION_KEY = "qmai-visual-style-version"
export const VISUAL_STYLE_STORAGE_VERSION = "fangzheng-20260707"

const VISUAL_STYLE_CLASSES: Record<Exclude<VisualStyle, "classic">, string> = {
  fangzheng: "visual-fangzheng",
  tianqing: "visual-tianqing",
  qingci: "visual-qingci",
  yunshan: "visual-yunshan",
  cangzhu: "visual-cangzhu",
  yuebai: "visual-yuebai",
  gumo: "visual-gumo",
}

const VISUAL_STYLE_VALUES = new Set<VisualStyle>([
  "classic",
  "fangzheng",
  "tianqing",
  "qingci",
  "yunshan",
  "cangzhu",
  "yuebai",
  "gumo",
])

export function normalizeVisualStyle(value: unknown): VisualStyle {
  return typeof value === "string" && VISUAL_STYLE_VALUES.has(value as VisualStyle)
    ? value as VisualStyle
    : DEFAULT_VISUAL_STYLE
}

export function resolveStoredVisualStyle(
  value: unknown,
  storageVersion: unknown,
): VisualStyle {
  if (storageVersion !== VISUAL_STYLE_STORAGE_VERSION) {
    return DEFAULT_VISUAL_STYLE
  }
  return normalizeVisualStyle(value)
}

export function applyVisualStyle(style: VisualStyle): void {
  if (typeof document === "undefined") return
  const html = document.documentElement
  Object.values(VISUAL_STYLE_CLASSES).forEach((className) => {
    html.classList.remove(className)
  })
  if (style !== "classic") {
    html.classList.add(VISUAL_STYLE_CLASSES[style])
  }
}
