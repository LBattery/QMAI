export type ThemeMode = "light" | "dark" | "deep-blue" | "system"

export function isSystemDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function getSystemTheme(): "light" | "dark" {
  return isSystemDark() ? "dark" : "light"
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return

  const actualTheme = theme === "system" ? getSystemTheme() : theme
  const html = document.documentElement
  html.classList.remove("dark", "deep-blue")

  if (actualTheme === "dark") {
    html.classList.add("dark")
  } else if (actualTheme === "deep-blue") {
    html.classList.add("deep-blue")
  }
}

export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
  const handler = () => onChange()

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }

  mediaQuery.addListener(handler)
  return () => mediaQuery.removeListener(handler)
}
