import http from "node:http"
import fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import os from "node:os"

const HOST = "127.0.0.1"
const DEFAULT_PORT = 3217
const KNOWLEDGE_DIR = "QM"
const LEGACY_KNOWLEDGE_DIR = "wiki"
const META_DIR = ".qmai"
const LEGACY_META_DIR = ".llm-wiki"

const args = new Set(process.argv.slice(2))
const portArg = process.argv.find((arg) => arg.startsWith("--port="))
const staticArg = process.argv.find((arg) => arg.startsWith("--static="))
const port = Number(portArg?.slice("--port=".length) || process.env.QMAI_WEB_PORT || DEFAULT_PORT)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const staticDir = staticArg
  ? path.resolve(staticArg.slice("--static=".length))
  : args.has("--static")
    ? path.join(repoRoot, "dist")
    : null

const allowedRoots = new Set()

function legacyTauriStateCandidates() {
  const candidates = []
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
  for (const base of [appData, localAppData]) {
    candidates.push(path.join(base, "com.qingmuai.writer", "app-state.json"))
    candidates.push(path.join(base, "QMaiWrite", "app-state.json"))
  }
  return candidates
}

function toPortablePath(input) {
  return input.replace(/\\/g, "/")
}

function isSubPath(candidate, root) {
  const relative = path.relative(root, candidate)
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
}

function registerRoot(rootPath) {
  allowedRoots.add(path.resolve(rootPath))
}

function replaceLastSegment(inputPath, from, to) {
  const parts = toPortablePath(inputPath).split("/")
  const index = parts.lastIndexOf(from)
  if (index < 0) return null
  parts[index] = to
  return parts.join("/")
}

async function exists(absPath) {
  try {
    await fs.access(absPath)
    return true
  } catch {
    return false
  }
}

async function resolveProjectStoragePath(rawPath) {
  const normalized = toPortablePath(String(rawPath || ""))
  const metaCandidate = replaceLastSegment(normalized, LEGACY_META_DIR, META_DIR)
  if (metaCandidate && (await exists(metaCandidate) || !(await exists(normalized)))) {
    return path.resolve(metaCandidate)
  }

  const knowledgeCandidate = replaceLastSegment(normalized, LEGACY_KNOWLEDGE_DIR, KNOWLEDGE_DIR)
  if (knowledgeCandidate && (await exists(knowledgeCandidate) || !(await exists(normalized)))) {
    return path.resolve(knowledgeCandidate)
  }

  return path.resolve(normalized)
}

function virtualizeProjectStoragePath(absPath) {
  const portable = toPortablePath(absPath)
  const segment = `/${KNOWLEDGE_DIR}/`
  if (portable.includes(segment)) {
    return portable.replace(segment, `/${LEGACY_KNOWLEDGE_DIR}/`)
  }
  if (portable.endsWith(`/${KNOWLEDGE_DIR}`)) {
    return `${portable.slice(0, -KNOWLEDGE_DIR.length)}${LEGACY_KNOWLEDGE_DIR}`
  }
  return portable
}

async function assertAllowed(rawPath) {
  const resolved = await resolveProjectStoragePath(rawPath)
  for (const root of allowedRoots) {
    if (isSubPath(resolved, root)) return resolved
  }
  throw new Error(`Path is outside opened projects: ${rawPath}`)
}

function validateProjectName(name) {
  const trimmed = String(name || "").trim()
  if (!trimmed) throw new Error("Project name is required")
  if (/[\\/]/.test(trimmed) || trimmed === "." || trimmed === "..") {
    throw new Error("Project name cannot contain path separators")
  }
  return trimmed
}

async function readJson(req) {
  let raw = ""
  for await (const chunk of req) raw += chunk
  if (!raw.trim()) return {}
  return JSON.parse(raw)
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  })
  res.end(JSON.stringify(payload))
}

function sendError(res, error) {
  sendJson(res, 400, {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  })
}

async function listDirectoryTree(absPath) {
  const entries = await fs.readdir(absPath, { withFileTypes: true })
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name, "zh-Hans-CN")
  })

  const nodes = []
  for (const entry of sorted) {
    const child = path.join(absPath, entry.name)
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: virtualizeProjectStoragePath(child),
        is_dir: true,
        children: await listDirectoryTree(child),
      })
    } else {
      nodes.push({
        name: entry.name,
        path: virtualizeProjectStoragePath(child),
        is_dir: false,
      })
    }
  }
  return nodes
}

async function copyDirectory(source, destination, copied = []) {
  await fs.mkdir(destination, { recursive: true })
  const entries = await fs.readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      await copyDirectory(from, to, copied)
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(to), { recursive: true })
      await fs.copyFile(from, to)
      copied.push(virtualizeProjectStoragePath(to))
    }
  }
  return copied
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  }
  return map[ext] || "application/octet-stream"
}

async function handleApi(req, res, route) {
  if (route === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, mode: "qmai-web-service", cwd: toPortablePath(process.cwd()) })
    return
  }

  if (route === "/api/fs/asset" && req.method === "GET") {
    const url = new URL(req.url || "/", `http://${HOST}:${port}`)
    const rawPath = url.searchParams.get("path")
    const absPath = await assertAllowed(rawPath)
    const stat = await fs.stat(absPath)
    if (!stat.isFile()) throw new Error("Asset path is not a file")
    res.writeHead(200, {
      "Content-Type": mimeTypeFor(absPath),
      "Content-Length": stat.size,
      "Access-Control-Allow-Origin": "*",
    })
    createReadStream(absPath).pipe(res)
    return
  }

  if (req.method !== "POST") {
    sendJson(res, 404, { ok: false, error: "Not found" })
    return
  }

  const body = await readJson(req)

  switch (route) {
    case "/api/legacy/tauri-state": {
      for (const candidate of legacyTauriStateCandidates()) {
        if (!(await exists(candidate))) continue
        const raw = await fs.readFile(candidate, "utf8")
        sendJson(res, 200, {
          ok: true,
          sourcePath: toPortablePath(candidate),
          appState: JSON.parse(raw),
        })
        return
      }
      sendJson(res, 200, { ok: true, sourcePath: null, appState: null })
      return
    }
    case "/api/system/paths": {
      sendJson(res, 200, {
        ok: true,
        executableDir: toPortablePath(process.cwd()),
        resourceDir: toPortablePath(process.cwd()),
      })
      return
    }
    case "/api/project/create": {
      const name = validateProjectName(body.name)
      const parent = path.resolve(String(body.path || process.cwd()))
      const root = path.join(parent, name)
      if (await exists(root)) throw new Error(`目录已存在：'${root}'`)
      await fs.mkdir(path.join(root, LEGACY_KNOWLEDGE_DIR), { recursive: true })
      await fs.mkdir(path.join(root, "raw", "sources"), { recursive: true })
      await fs.mkdir(path.join(root, "raw", "assets"), { recursive: true })
      await fs.mkdir(path.join(root, META_DIR), { recursive: true })
      registerRoot(root)
      sendJson(res, 200, { ok: true, project: { name, path: toPortablePath(root) } })
      return
    }
    case "/api/project/open": {
      const root = path.resolve(String(body.path || ""))
      const stat = await fs.stat(root)
      if (!stat.isDirectory()) throw new Error(`不是有效目录：'${root}'`)
      registerRoot(root)
      sendJson(res, 200, { ok: true, project: { name: path.basename(root), path: toPortablePath(root) } })
      return
    }
    case "/api/fs/read": {
      const absPath = await assertAllowed(body.path)
      sendJson(res, 200, { ok: true, contents: await fs.readFile(absPath, "utf8") })
      return
    }
    case "/api/fs/write": {
      const absPath = await assertAllowed(body.path)
      await fs.mkdir(path.dirname(absPath), { recursive: true })
      await fs.writeFile(absPath, String(body.contents ?? ""), "utf8")
      sendJson(res, 200, { ok: true })
      return
    }
    case "/api/fs/list": {
      const absPath = await assertAllowed(body.path)
      sendJson(res, 200, { ok: true, nodes: await listDirectoryTree(absPath) })
      return
    }
    case "/api/fs/mkdir": {
      const absPath = await assertAllowed(body.path)
      await fs.mkdir(absPath, { recursive: true })
      sendJson(res, 200, { ok: true })
      return
    }
    case "/api/fs/copy-file": {
      const source = await assertAllowed(body.source)
      const destination = await assertAllowed(body.destination)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.copyFile(source, destination)
      sendJson(res, 200, { ok: true })
      return
    }
    case "/api/fs/copy-dir": {
      const source = await assertAllowed(body.source)
      const destination = await assertAllowed(body.destination)
      sendJson(res, 200, { ok: true, copied: await copyDirectory(source, destination) })
      return
    }
    case "/api/fs/delete-file": {
      const absPath = await assertAllowed(body.path)
      const stat = await fs.stat(absPath)
      if (!stat.isFile()) throw new Error("Only single-file deletion is supported in Web mode")
      await fs.unlink(absPath)
      sendJson(res, 200, { ok: true })
      return
    }
    case "/api/fs/exists": {
      const absPath = await assertAllowed(body.path)
      sendJson(res, 200, { ok: true, exists: await exists(absPath) })
      return
    }
    case "/api/fs/stat": {
      const absPath = await assertAllowed(body.path)
      const stat = await fs.stat(absPath)
      sendJson(res, 200, { ok: true, mtimeMs: stat.mtimeMs, size: stat.size })
      return
    }
    case "/api/fs/md5": {
      const absPath = await assertAllowed(body.path)
      const data = await fs.readFile(absPath)
      sendJson(res, 200, { ok: true, md5: crypto.createHash("md5").update(data).digest("hex") })
      return
    }
    case "/api/fs/read-base64": {
      const absPath = await assertAllowed(body.path)
      const data = await fs.readFile(absPath)
      sendJson(res, 200, {
        ok: true,
        base64: data.toString("base64"),
        mimeType: mimeTypeFor(absPath),
      })
      return
    }
    default:
      sendJson(res, 404, { ok: false, error: "Not found" })
  }
}

async function serveStatic(req, res) {
  if (!staticDir) {
    sendJson(res, 404, { ok: false, error: "Not found" })
    return
  }
  const url = new URL(req.url || "/", `http://${HOST}:${port}`)
  const requested = path.resolve(staticDir, `.${decodeURIComponent(url.pathname)}`)
  const safePath = isSubPath(requested, staticDir) ? requested : path.join(staticDir, "index.html")
  let target = safePath
  try {
    const stat = await fs.stat(target)
    if (stat.isDirectory()) target = path.join(target, "index.html")
  } catch {
    target = path.join(staticDir, "index.html")
  }
  const stat = await fs.stat(target)
  res.writeHead(200, {
    "Content-Type": mimeTypeFor(target),
    "Content-Length": stat.size,
  })
  createReadStream(target).pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {})
      return
    }

    const route = new URL(req.url || "/", `http://${HOST}:${port}`).pathname
    if (route.startsWith("/api/")) {
      await handleApi(req, res, route)
      return
    }
    await serveStatic(req, res)
  } catch (error) {
    sendError(res, error)
  }
})

server.listen(port, HOST, () => {
  console.log(`[QMAI Web] API listening at http://${HOST}:${port}`)
  if (staticDir) console.log(`[QMAI Web] Serving ${staticDir}`)
})
