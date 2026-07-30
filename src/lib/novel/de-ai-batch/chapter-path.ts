import { normalizePath } from "@/lib/path-utils"

const SOURCE_PATH_ERROR = "章节源文件不属于当前项目章节目录"

type PathKind = "windows" | "unc" | "posix"

interface ParsedAbsolutePath {
  kind: PathKind
  root: string
  segments: string[]
  caseInsensitive: boolean
}

function fail(): never {
  throw new Error(SOURCE_PATH_ERROR)
}

function parseAbsolutePath(value: string): ParsedAbsolutePath {
  const path = normalizePath(value.trim())
  if (!path || path.includes("\0") || path.startsWith("//?/") || path.startsWith("//./")) fail()
  const rawSegments = path.split("/")
  if (rawSegments.some((segment) => segment === "..")) fail()

  const drive = /^([A-Za-z]):\/(.*)$/.exec(path)
  if (drive) {
    return {
      kind: "windows",
      root: `${drive[1].toUpperCase()}:`,
      segments: drive[2].split("/").filter((segment) => segment && segment !== "."),
      caseInsensitive: true,
    }
  }

  const unc = /^\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(path)
  if (unc) {
    return {
      kind: "unc",
      root: `//${unc[1]}/${unc[2]}`,
      segments: (unc[3] ?? "").split("/").filter((segment) => segment && segment !== "."),
      caseInsensitive: true,
    }
  }

  if (path.startsWith("/")) {
    return {
      kind: "posix",
      root: "/",
      segments: path.slice(1).split("/").filter((segment) => segment && segment !== "."),
      caseInsensitive: false,
    }
  }

  return fail()
}

function equalPart(left: string, right: string, caseInsensitive: boolean): boolean {
  return caseInsensitive ? left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US") : left === right
}

export function assertChapterSourcePath(projectPath: string, sourcePath: string): string {
  const project = parseAbsolutePath(projectPath)
  const source = parseAbsolutePath(sourcePath)
  const rootSegments = [...project.segments, "wiki", "chapters"]
  if (
    project.kind !== source.kind
    || !equalPart(project.root, source.root, project.caseInsensitive)
    || source.segments.length <= rootSegments.length
    || rootSegments.some((segment, index) => !equalPart(segment, source.segments[index], project.caseInsensitive))
  ) fail()

  const prefix = source.root === "/" ? "/" : `${source.root}/`
  return `${prefix}${source.segments.join("/")}`
}