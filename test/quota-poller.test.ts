import assert from "node:assert/strict"
import { it } from "node:test"
import { createQuotaPoller } from "../src/core/quota-poller.js"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

it("skips the read while the poller is disabled", async () => {
  let reads = 0
  const updates: number[] = []
  const poller = createQuotaPoller({
    enabled: () => false,
    load: async () => {
      reads += 1
      return 1
    },
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  await poller.refresh()
  await tick()

  assert.equal(reads, 0)
  assert.deepEqual(updates, [])
})

it("publishes the loaded value", async () => {
  const updates: number[] = []
  const poller = createQuotaPoller({
    enabled: () => true,
    load: async () => 42,
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  await poller.refresh()

  assert.deepEqual(updates, [42])
})

it("publishes the empty value when nothing is loaded", async () => {
  const updates: number[] = []
  const poller = createQuotaPoller<number>({
    enabled: () => true,
    load: async () => undefined,
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  await poller.refresh()

  assert.deepEqual(updates, [0])
})

it("publishes the empty value when the read fails", async () => {
  const updates: number[] = []
  const poller = createQuotaPoller<number>({
    enabled: () => true,
    load: async () => {
      throw new Error("unauthorized")
    },
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  await poller.refresh()

  assert.deepEqual(updates, [0])
})

it("does not publish a result that settles after the poller was disabled without a reset", async () => {
  const pending = deferred<number>()
  let enabled = true
  const updates: number[] = []
  const poller = createQuotaPoller({
    enabled: () => enabled,
    load: () => pending.promise,
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  const refresh = poller.refresh()
  enabled = false
  pending.resolve(5)
  await refresh
  await tick()

  assert.deepEqual(updates, [])
})

it("coalesces concurrent refresh requests into a single follow-up read", async () => {
  const pending = deferred<number>()
  let reads = 0
  const updates: number[] = []
  const poller = createQuotaPoller({
    enabled: () => true,
    load: () => {
      reads += 1
      return reads === 1 ? pending.promise : Promise.resolve(reads)
    },
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  const first = poller.refresh()
  const second = poller.refresh()
  const third = poller.refresh()
  pending.resolve(1)
  await Promise.all([first, second, third])
  await tick()

  assert.equal(reads, 2)
  assert.deepEqual(updates, [1, 2])
})

it("discards a result that resolves after the poller was reset", async () => {
  const pending = deferred<number>()
  const updates: number[] = []
  const poller = createQuotaPoller({
    enabled: () => true,
    load: () => pending.promise,
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  const refresh = poller.refresh()
  poller.reset()
  pending.resolve(7)
  await refresh
  await tick()

  assert.deepEqual(updates, [])
})

it("discards a failed read that settles after the poller was reset", async () => {
  const pending = deferred<number>()
  const updates: number[] = []
  const poller = createQuotaPoller<number>({
    enabled: () => true,
    load: () => pending.promise,
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  const refresh = poller.refresh()
  poller.reset()
  pending.reject(new Error("late failure"))
  await refresh
  await tick()

  assert.deepEqual(updates, [])
})

it("drops a coalesced follow-up when the reset happens in flight", async () => {
  const pending = deferred<number>()
  let reads = 0
  const updates: number[] = []
  const poller = createQuotaPoller({
    enabled: () => true,
    load: () => {
      reads += 1
      return pending.promise
    },
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  const first = poller.refresh()
  const second = poller.refresh()
  poller.reset()
  pending.resolve(5)
  await Promise.all([first, second])
  await tick()

  assert.equal(reads, 1)
  assert.deepEqual(updates, [])
})

it("runs exactly one follow-up when reactivated while the stale read is still in flight", async () => {
  const pending = deferred<number>()
  let reads = 0
  const updates: number[] = []
  const poller = createQuotaPoller({
    enabled: () => true,
    load: () => {
      reads += 1
      return reads === 1 ? pending.promise : Promise.resolve(reads)
    },
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  const first = poller.refresh()
  poller.reset()
  const second = poller.refresh()
  pending.resolve(99)
  await Promise.all([first, second])
  await tick()
  await tick()

  assert.equal(reads, 2)
  assert.deepEqual(updates, [2])
})

it("recovers after a reset once the stale read settles", async () => {
  const pending = deferred<number>()
  let reads = 0
  const updates: number[] = []
  const poller = createQuotaPoller({
    enabled: () => true,
    load: () => {
      reads += 1
      return reads === 1 ? pending.promise : Promise.resolve(5)
    },
    update: (value) => updates.push(value),
    empty: () => 0,
  })

  const first = poller.refresh()
  poller.reset()
  pending.resolve(99)
  await first
  await tick()

  await poller.refresh()

  assert.equal(reads, 2)
  assert.deepEqual(updates, [5])
})

it("keeps two pollers isolated when one is reset mid-flight", async () => {
  const aPending = deferred<number>()
  const bPending = deferred<number>()
  let bReads = 0
  const aUpdates: number[] = []
  const bUpdates: number[] = []
  const a = createQuotaPoller({
    enabled: () => true,
    load: () => aPending.promise,
    update: (value) => aUpdates.push(value),
    empty: () => 0,
  })
  const b = createQuotaPoller({
    enabled: () => true,
    load: () => {
      bReads += 1
      return bReads === 1 ? bPending.promise : Promise.resolve(7)
    },
    update: (value) => bUpdates.push(value),
    empty: () => 0,
  })

  const firstA = a.refresh()
  const firstB = b.refresh()
  b.reset()
  aPending.resolve(1)
  bPending.resolve(2)
  await Promise.all([firstA, firstB])
  await tick()

  assert.deepEqual(aUpdates, [1])
  assert.deepEqual(bUpdates, [])

  await b.refresh()
  assert.equal(bReads, 2)
  assert.deepEqual(bUpdates, [7])
})
