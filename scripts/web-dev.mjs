import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const nodeCmd = process.execPath
const apiUrl = process.env.VITE_QMAI_WEB_API || "http://127.0.0.1:3217"

const children = []

let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

function spawnChild(command, args, options) {
  const child = spawn(command, args, options)
  children.push(child)
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) shutdown(code ?? 1)
  })
  child.on("error", (error) => {
    console.error(`[web:dev] failed to start ${command}:`, error)
    shutdown(1)
  })
  return child
}

function spawnNpm(args, options) {
  if (process.platform === "win32") {
    return spawnChild("cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args], options)
  }
  return spawnChild("npm", args, options)
}

try {
  spawnChild(nodeCmd, ["scripts/web-server.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, QMAI_WEB_PORT: "3217" },
  })

  spawnNpm(["run", "dev"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, VITE_QMAI_WEB_API: apiUrl },
  })
} catch (error) {
  console.error("[web:dev] startup failed:", error)
  shutdown(1)
}
