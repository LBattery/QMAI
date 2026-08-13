import { invoke } from "@tauri-apps/api/core"
import { isTauri } from "./platform"
import { loadLegacyTauriAppState } from "@/lib/web-service-fs"

const STORE_PREFIX = "llm-wiki-store:"
const APP_STATE_STORAGE_KEY = STORE_PREFIX + "app-state.json"
const LEGACY_MIGRATION_KEY = STORE_PREFIX + "legacy-tauri-migrated"

export const APP_STATE_ATOMIC_WRITE_COMMAND = "write_app_state_atomic"
export const APP_STATE_PERSIST_DEBOUNCE_MS = 100

export interface AtomicPersistStore {
  get: <T>(key: string) => Promise<T | undefined>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<boolean>
  entries: <T>() => Promise<Array<[string, T]>>
}

export interface AtomicAppStateStore {
  get: <T>(key: string) => Promise<T | undefined>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<boolean>
  save: () => Promise<void>
}

export function wrapStoreForAtomicPersist(
  inner: AtomicPersistStore,
  persistEntries: (entries: Record<string, unknown>) => Promise<void>,
  debounceMs = APP_STATE_PERSIST_DEBOUNCE_MS,
): AtomicAppStateStore {
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let persistChain = Promise.resolve()

  const flushPersist = () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    persistChain = persistChain
      .catch(() => undefined)
      .then(async () => {
        const pairs = await inner.entries()
        await persistEntries(Object.fromEntries(pairs))
      })
    return persistChain
  }

  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      void flushPersist()
    }, debounceMs)
  }

  return {
    get: (key) => inner.get(key),
    set: async (key, value) => {
      await inner.set(key, value)
      schedulePersist()
    },
    delete: async (key) => {
      const deleted = await inner.delete(key)
      schedulePersist()
      return deleted
    },
    save: () => flushPersist(),
  }
}

class WebStore {
  private data: Map<string, unknown>

  constructor() {
    this.data = new Map()
    this.loadFromLocalStorage()
  }

  private loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(APP_STATE_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        for (const [key, value] of Object.entries(parsed)) {
          this.data.set(key, value)
        }
      }
    } catch {}
  }

  private saveToLocalStorage() {
    try {
      const obj: Record<string, unknown> = {}
      for (const [key, value] of this.data.entries()) {
        obj[key] = value
      }
      localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(obj))
    } catch {}
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
    this.saveToLocalStorage()
  }

  async delete(key: string): Promise<boolean> {
    const existed = this.data.has(key)
    this.data.delete(key)
    this.saveToLocalStorage()
    return existed
  }

  async save(): Promise<void> {
    this.saveToLocalStorage()
  }
}

let webStoreInstance: WebStore | null = null
let migrationPromise: Promise<void> | null = null
let tauriStorePromise: Promise<AtomicAppStateStore> | null = null

function shouldImportLegacyState(currentRaw: string | null): boolean {
  if (!currentRaw) return true
  try {
    const parsed = JSON.parse(currentRaw) as Record<string, unknown>
    return !parsed.lastProject && !parsed.recentProjects
  } catch {
    return true
  }
}

async function migrateLegacyTauriStateIfNeeded(): Promise<void> {
  if (typeof window === "undefined") return
  if (localStorage.getItem(LEGACY_MIGRATION_KEY) === "done") return

  const currentRaw = localStorage.getItem(APP_STATE_STORAGE_KEY)
  if (!shouldImportLegacyState(currentRaw)) {
    localStorage.setItem(LEGACY_MIGRATION_KEY, "done")
    return
  }

  try {
    const { appState, sourcePath } = await loadLegacyTauriAppState()
    if (!appState) {
      localStorage.setItem(LEGACY_MIGRATION_KEY, "done")
      return
    }
    localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(appState))
    localStorage.setItem(LEGACY_MIGRATION_KEY, "done")
    localStorage.setItem(STORE_PREFIX + "legacy-tauri-source", sourcePath ?? "")
    webStoreInstance = null
  } catch (err) {
    console.warn("[web-store] legacy Tauri state migration failed:", err)
  }
}

function getWebStore(): WebStore {
  if (!webStoreInstance) {
    webStoreInstance = new WebStore()
  }
  return webStoreInstance
}

export async function getStore(): Promise<AtomicAppStateStore> {
  if (isTauri()) {
    if (!tauriStorePromise) {
      tauriStorePromise = (async () => {
        const { load } = await import("@tauri-apps/plugin-store")
        const inner = await load("app-state.json", { autoSave: false })
        return wrapStoreForAtomicPersist(inner, async (entries) => {
          await invoke(APP_STATE_ATOMIC_WRITE_COMMAND, { entries })
        })
      })()
    }
    return tauriStorePromise
  }
  migrationPromise ??= migrateLegacyTauriStateIfNeeded()
  await migrationPromise
  return getWebStore()
}
