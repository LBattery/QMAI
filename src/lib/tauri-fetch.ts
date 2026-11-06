/**
 * Shared HTTP helpers routed through Tauri's Rust-backed plugin so
 * third-party endpoints that don't set browser-friendly CORS headers
 * still work. Every part of the app that hits a user-configured URL
 * (LLM chat, embedding, web search, anything new) should import from
 * here rather than call `fetch` directly.
 *
 * Why it matters:
 *  - MiniMax's /anthropic endpoint: CORS allow-headers omits x-api-key
 *  - Volcengine Ark /api/coding/v3: CORS omits Authorization entirely
 *  - Any enterprise / on-prem gateway that doesn't anticipate browser
 *    origins — a common shape across domestic Chinese clouds
 *
 * In unit tests (vitest / node), the plugin's browser-only globals
 * aren't available; `getHttpFetch` lazily imports and falls back to
 * `globalThis.fetch` so helper functions in this file can be imported
 * from any environment without crashing at module load.
 */

import { asAbortError, isTauriInvalidResourceIdError } from "./tauri-resource-error"
import { toDevProxyUrl } from "./dev-proxy"

let pluginFetchPromise: Promise<typeof globalThis.fetch> | null = null

function wrapPluginHttpFetch(pluginFetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return (async (input, init) => {
    try {
      return await pluginFetch(input, init)
    } catch (error) {
      if (isTauriInvalidResourceIdError(error)) {
        throw asAbortError()
      }
      throw error
    }
  }) as typeof globalThis.fetch
}

/**
 * 浏览器开发模式：把命中 DEV_PROXY_ROUTES 的绝对地址改写成同源前缀，
 * 交给 Vite dev server 转发，从而绕开第三方接口缺失 CORS 头的问题。
 *
 * 只在 dev 生效：构建产物里没有 Vite 代理，改写后只会 404，
 * 所以生产环境保持直连（行为与改动前一致）。
 * 地址前缀统一维护在 dev-proxy.ts，Authorization 等请求头原样透传。
 */
function wrapDevProxyFetch(nativeFetch: typeof globalThis.fetch): typeof globalThis.fetch {
  if (!import.meta.env?.DEV) return nativeFetch
  return (async (input, init) => {
    const target =
      typeof input === "string"
        ? toDevProxyUrl(input)
        : input instanceof URL
          ? toDevProxyUrl(input.toString())
          : input
    // 保持调用参数形态不变，避免多传一个 undefined 影响既有断言。
    return init === undefined ? await nativeFetch(target) : await nativeFetch(target, init)
  }) as typeof globalThis.fetch
}

/**
 * True when running outside a browser / webview (vitest, SSR, any
 * Node-based tooling). The Tauri plugin is importable in Node
 * (resolution succeeds) but its internals reach for `window` at call
 * time, so we must avoid invoking it — guard BEFORE the dynamic
 * import rather than trying to .catch() an error that happens later.
 */
const isNodeEnv = typeof window === "undefined"
const isTauriEnv = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * Returns a fetch function that routes through Tauri's HTTP plugin in
 * production, falling back to the platform's native fetch in non-Tauri
 * environments (tests / SSR / storybook). Call this once per request:
 *
 *   const httpFetch = await getHttpFetch()
 *   const response = await httpFetch(url, opts)
 *
 * The promise is cached, so repeated calls don't re-import the plugin.
 */
export function getHttpFetch(): Promise<typeof globalThis.fetch> {
  if (!pluginFetchPromise) {
    if (isNodeEnv || !isTauriEnv()) {
      // Bind so `this === globalThis` — Node's fetch requires it.
      const nativeFetch = globalThis.fetch.bind(globalThis)
      pluginFetchPromise = Promise.resolve(isNodeEnv ? nativeFetch : wrapDevProxyFetch(nativeFetch))
    } else {
      pluginFetchPromise = import("@tauri-apps/plugin-http")
        .then((m) => wrapPluginHttpFetch(m.fetch as unknown as typeof globalThis.fetch))
        .catch(() => globalThis.fetch.bind(globalThis))
    }
  }
  return pluginFetchPromise
}

export function resetHttpFetchForTests(): void {
  pluginFetchPromise = null
}

/**
 * Detect fetch-level network failures across Tauri's different webview
 * backends. Each platform phrases the same failure class differently:
 *
 *   macOS / iOS (WebKit):       Error,  message === "Load failed"
 *   Windows    (Edge WebView2): TypeError, message === "Failed to fetch"
 *   Linux      (WebKitGTK):     Error,  message === "Load failed"
 *
 * They all collapse DNS / TLS / connection-refused / CORS-preflight
 * into a single opaque error with no structured detail. The only
 * reliable cross-platform signal is "not an AbortError AND one of
 * these generic network error shapes", which this helper centralizes.
 */
export function isFetchNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === "AbortError") return false
  // Chromium / Edge WebView2
  if (err.name === "TypeError") return true
  // WebKit (macOS / Linux GTK)
  if (err.message === "Load failed") return true
  // Chromium mid-stream drop
  if (err.message === "Failed to fetch") return true
  // Tauri plugin-http / Rust reqwest send-stage failure
  if (/error sending request for url/i.test(err.message)) return true
  // Tauri plugin-http / Rust reqwest response stream decode failure
  if (/error decoding response body/i.test(err.message)) return true
  if (err.message.includes("network error")) return true
  return false
}
