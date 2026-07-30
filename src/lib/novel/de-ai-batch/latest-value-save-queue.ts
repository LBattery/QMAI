interface PendingBatch<T> {
  value: T
  waiters: Array<{ resolve(): void; reject(error: unknown): void }>
}

export function createLatestValueSaveQueue<T>(save: (value: T) => Promise<void>) {
  let pending: PendingBatch<T> | null = null
  let draining = false

  async function drain(): Promise<void> {
    if (draining) return
    draining = true
    try {
      while (pending) {
        const batch = pending
        pending = null
        try {
          await save(batch.value)
          for (const waiter of batch.waiters) waiter.resolve()
        } catch (error) {
          for (const waiter of batch.waiters) waiter.reject(error)
        }
      }
    } finally {
      draining = false
      if (pending) void drain()
    }
  }

  function enqueue(value: T): Promise<void> {
    const result = new Promise<void>((resolve, reject) => {
      if (pending) {
        pending.value = value
        pending.waiters.push({ resolve, reject })
      } else {
        pending = { value, waiters: [{ resolve, reject }] }
      }
    })
    void drain()
    return result
  }

  return { enqueue }
}