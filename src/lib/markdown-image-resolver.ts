import { normalizePath } from "@/lib/path-utils"
import { isTauri } from "@/lib/platform"

const PASSTHROUGH_RE = /^(https?:|data:|blob:|file:|tauri:)/i

let _convertFileSrc: ((filePath: string) => string) | null = null

async function getConvertFileSrc() {
  if (!_convertFileSrc) {
    const mod = await import("@tauri-apps/api/core")
    _convertFileSrc = mod.convertFileSrc
  }
  return _convertFileSrc
}

export function resolveMarkdownImageSrc(
  rawSrc: string,
  projectPath: string | null,
): string {
  if (!rawSrc) return rawSrc
  if (PASSTHROUGH_RE.test(rawSrc)) return rawSrc

  if (!projectPath) return rawSrc

  if (!isTauri()) return rawSrc

  // convertFileSrc must be loaded via dynamic import; if not yet cached,
  // trigger the async load and return rawSrc as fallback. The async
  // version (resolveMarkdownImageSrcAsync) should be preferred when
  // possible.
  if (!_convertFileSrc) {
    void getConvertFileSrc()
    return rawSrc
  }

  const pp = normalizePath(projectPath)
  const isAbsolute =
    rawSrc.startsWith("/") || /^[a-zA-Z]:/.test(rawSrc) || rawSrc.startsWith("\\\\")

  if (isAbsolute) return _convertFileSrc(rawSrc)

  const cleaned = rawSrc.replace(/^\.\//, "")
  const absolute = `${pp}/wiki/${cleaned}`

  return _convertFileSrc(absolute)
}

export async function resolveMarkdownImageSrcAsync(
  rawSrc: string,
  projectPath: string | null,
): Promise<string> {
  if (!rawSrc) return rawSrc
  if (PASSTHROUGH_RE.test(rawSrc)) return rawSrc
  if (!projectPath) return rawSrc
  if (!isTauri()) return rawSrc

  const pp = normalizePath(projectPath)
  const isAbsolute =
    rawSrc.startsWith("/") || /^[a-zA-Z]:/.test(rawSrc) || rawSrc.startsWith("\\\\")

  const convertFileSrc = await getConvertFileSrc()

  if (isAbsolute) return convertFileSrc(rawSrc)

  const cleaned = rawSrc.replace(/^\.\//, "")
  const absolute = `${pp}/wiki/${cleaned}`
  return convertFileSrc(absolute)
}
