import { convertFileSrc } from "@tauri-apps/api/core"
import { normalizePath } from "@/lib/path-utils"
import { isTauri } from "@/lib/platform"
import { webAssetUrl } from "@/lib/web-service-fs"

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

  const pp = normalizePath(projectPath)
  const isAbsolute =
    rawSrc.startsWith("/") || /^[a-zA-Z]:/.test(rawSrc) || rawSrc.startsWith("\\\\")

  if (!isTauri()) {
    if (isAbsolute) return webAssetUrl(rawSrc)
    const cleaned = rawSrc.replace(/^\.\//, "")
    return webAssetUrl(`${pp}/wiki/${cleaned}`)
  }

  if (isAbsolute) return convertFileSrc(rawSrc)

  const cleaned = rawSrc.replace(/^\.\//, "")
  const absolute = `${pp}/wiki/${cleaned}`

  return convertFileSrc(absolute)
}

export async function resolveMarkdownImageSrcAsync(
  rawSrc: string,
  projectPath: string | null,
): Promise<string> {
  if (!rawSrc) return rawSrc
  if (PASSTHROUGH_RE.test(rawSrc)) return rawSrc
  if (!projectPath) return rawSrc

  const pp = normalizePath(projectPath)
  const isAbsolute =
    rawSrc.startsWith("/") || /^[a-zA-Z]:/.test(rawSrc) || rawSrc.startsWith("\\\\")

  if (!isTauri()) {
    if (isAbsolute) return webAssetUrl(rawSrc)
    const cleaned = rawSrc.replace(/^\.\//, "")
    return webAssetUrl(`${pp}/wiki/${cleaned}`)
  }

  const convertFileSrc = await getConvertFileSrc()

  if (isAbsolute) return convertFileSrc(rawSrc)

  const cleaned = rawSrc.replace(/^\.\//, "")
  const absolute = `${pp}/wiki/${cleaned}`
  return convertFileSrc(absolute)
}
