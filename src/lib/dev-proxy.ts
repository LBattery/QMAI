/**
 * 浏览器开发模式下的第三方接口代理映射。
 *
 * 背景：部分 OpenAI 兼容服务（例如 https://www.fastaitoken.com）没有返回
 * 浏览器友好的 CORS 头，直接 fetch 会被预检拦下。Tauri 桌面版走 Rust 插件
 * 不受此限，但纯浏览器（npm run dev / npm run web:dev 打开 127.0.0.1:1420）
 * 必须借助 Vite dev server 的同源转发。
 *
 * 这里只维护一份映射表：
 *  - vite.config.ts 据此生成 server.proxy（把 prefix 转发到 origin）；
 *  - 请求层（tauri-fetch.ts）据此把真实地址改写成同源前缀。
 *
 * 注意：Vite 代理只在开发服务器有效，构建产物上线后不包含转发能力，
 * 正式网页版仍需服务端提供相同路径的反向代理。
 */
export interface DevProxyRoute {
  /** 开发服务器暴露的同源前缀，例如 /api/ai */
  prefix: string
  /** 第三方服务的真实源地址，例如 https://www.fastaitoken.com */
  origin: string
}

export const DEV_PROXY_ROUTES: readonly DevProxyRoute[] = [
  { prefix: "/api/ai", origin: "https://www.fastaitoken.com" },
]

/**
 * 把命中代理映射的绝对地址改写为同源前缀地址，其余地址原样返回。
 *
 * 只改地址，不改请求头：Authorization / Origin 等仍按原样透传，
 * 由 Vite 代理转发给真实服务。
 */
export function toDevProxyUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    // 相对地址（/api/xxx）或非法地址不需要改写。
    return input
  }
  const route = DEV_PROXY_ROUTES.find((item) => url.origin === item.origin)
  if (!route) return input
  return `${route.prefix}${url.pathname}${url.search}${url.hash}`
}
