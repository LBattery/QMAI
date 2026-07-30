import { describe, expect, it, vi } from "vitest"
import { createLatestValueSaveQueue } from "./latest-value-save-queue"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe("latest value save queue", () => {
  it("延迟保存期间合并变化并保证重启读取到最后值", async () => {
    const first = deferred()
    let persisted = 3
    const save = vi.fn(async (value: number) => {
      if (save.mock.calls.length === 1) await first.promise
      persisted = value
    })
    const queue = createLatestValueSaveQueue(save)

    const saving3 = queue.enqueue(3)
    const saving4 = queue.enqueue(4)
    const saving5 = queue.enqueue(5)
    expect(save).toHaveBeenCalledTimes(1)
    first.resolve()
    await Promise.all([saving3, saving4, saving5])

    expect(save.mock.calls.map(([value]) => value)).toEqual([3, 5])
    expect(persisted).toBe(5)
    const restartedConcurrency = persisted
    expect(restartedConcurrency).toBe(5)
  })

  it("一次保存失败后仍继续保存等待中的最后值", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("首次保存失败"))
      .mockResolvedValueOnce(undefined)
    const queue = createLatestValueSaveQueue<number>(save)

    const first = queue.enqueue(2)
    const latest = queue.enqueue(4)

    await expect(first).rejects.toThrow("首次保存失败")
    await expect(latest).resolves.toBeUndefined()
    expect(save.mock.calls.map(([value]) => value)).toEqual([2, 4])
  })
})