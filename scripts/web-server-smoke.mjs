import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"

const root = path.resolve(import.meta.dirname, "..")
await fs.mkdir(path.join(root, "cache-temp"), { recursive: true })
const fixture = await fs.mkdtemp(path.join(root, "cache-temp", "web-sync-smoke-"))
let port
const server = spawn(process.execPath, ["scripts/web-server.mjs", "--port=0"], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
async function api(route, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  return response.json()
}
try {
  const [ready] = await Promise.race([once(server.stdout, "data"), once(server, "error").then(([error]) => { throw error }), once(server, "exit").then(() => { throw new Error("Web 服务启动失败") })])
  port = Number(String(ready).match(/:(\d+)/)?.[1])
  assert.ok(port)
  const created = await api("project/create", { name: "同步验证", path: fixture })
  assert.equal(created.ok, true)
  const book = created.project.path
  assert.equal((await api("fs/write", { path: `${book}/wiki/smoke.md`, contents: "# 中文读写验证" })).ok, true)
  assert.equal((await api("fs/read", { path: `${book}/wiki/smoke.md` })).contents, "# 中文读写验证")
  const renamed = await api("project/rename", { path: book, name: "同步验证改名" })
  assert.equal(renamed.ok, true)
  const next = renamed.project.path
  assert.equal((await api("fs/read", { path: `${next}/wiki/smoke.md` })).contents, "# 中文读写验证")
  assert.equal((await api("fs/read", { path: `${book}/wiki/smoke.md` })).ok, false)
  assert.equal((await api("project/rename", { path: next, name: "../越界" })).ok, false)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=", "base64")
  const source = path.join(next, "source.png")
  await fs.writeFile(source, png)
  const cover = await api("project/cover", { path: next, source })
  assert.equal(cover.ok, true)
  assert.deepEqual(await fs.readFile(cover.savedPath), png)
  assert.equal((await api("project/cover", { path: next, source: path.join(fixture, "outside.png") })).ok, false)
  assert.equal((await api("fs/delete-file", { path: next })).ok, false)
  console.log("Web API 验证通过：创建、中文读写、重命名、封面保存及目录边界保护。")
} finally {
  if (server.exitCode === null) {
    const stopped = once(server, "exit")
    server.kill()
    await stopped
  }
}
