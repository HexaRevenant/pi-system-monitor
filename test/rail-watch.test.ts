import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { installRailCard, SIDEBAR_STATE, watchRail, type RailScheduler, type SidebarRail } from "../src/pi/rail.js"

/** A scheduler that queues work so a test decides when each retry runs. */
function fakeScheduler() {
  const queue: Array<{ ms: number; run: () => void; cancelled: boolean }> = []
  const delays: number[] = []
  return {
    scheduler: {
      after(ms: number, run: () => void): () => void {
        const entry = { ms, run, cancelled: false }
        queue.push(entry)
        delays.push(ms)
        return () => {
          entry.cancelled = true
        }
      },
    } satisfies RailScheduler,
    delays,
    /** Runs the oldest pending retry and reports whether one was waiting. */
    tick(): boolean {
      const entry = queue.shift()
      if (entry === undefined || entry.cancelled) return entry !== undefined
      entry.run()
      return true
    },
    pending(): number {
      return queue.filter((entry) => !entry.cancelled).length
    },
  }
}

function fakeTui(parts: Map<string, SidebarRail>) {
  return { terminal: { [SIDEBAR_STATE]: { parts } } as Record<symbol, unknown> }
}

const agents = (lines: string[]): SidebarRail => ({ render: () => lines, digest: () => "agents-1" })
const card = { render: () => ["CARD"], digest: () => "card-1" }

describe("rail watch", () => {
  it("installs once immediately, before any slot exists", () => {
    const fake = fakeScheduler()
    let calls = 0
    const stop = watchRail(
      () => {
        calls += 1
        return calls >= 3
      },
      fake.scheduler,
    )

    assert.equal(calls, 1, "installs once immediately")
    fake.tick()
    assert.equal(calls, 2)
    fake.tick()
    assert.equal(calls, 3)
    stop()
  })

  it("keeps the slow heartbeat after the wrapper is installed", () => {
    const fake = fakeScheduler()
    let calls = 0
    const stop = watchRail(() => {
      calls += 1
      return true
    }, fake.scheduler)

    for (let index = 0; index < 120; index += 1) fake.tick()
    assert.equal(calls, 121, "a host that replaces the part is repaired later")
    assert.equal(fake.pending(), 1)
    stop()
  })

  it("reinstalls when the host replaces the wrapped part after a successful install", () => {
    const fake = fakeScheduler()
    const parts = new Map<string, SidebarRail>()
    const tui = fakeTui(parts)
    const stop = watchRail(() => {
      if (parts.get("agents")?.[Symbol.for("pi-system-monitor.rail-wrapper")] === true) return true
      installRailCard(tui, () => card)
      return parts.get("agents") !== undefined
    }, fake.scheduler)

    assert.equal(parts.get("agents"), undefined, "no slot exists yet")
    fake.tick()
    assert.equal(parts.get("agents"), undefined, "still nothing to wrap")

    parts.set("agents", agents(["AGENTS"]))
    fake.tick()
    assert.deepEqual(parts.get("agents")?.render(40), ["CARD", "", "AGENTS"])

    // The host rebuilds its part, dropping the wrapper.
    parts.set("agents", agents(["AGENTS"]))
    fake.tick()
    assert.deepEqual(parts.get("agents")?.render(40), ["CARD", "", "AGENTS"], "wrapper comes back")
    stop()
  })

  it("keeps polling far past the old fixed ten second window", () => {
    const fake = fakeScheduler()
    let calls = 0
    const stop = watchRail(
      () => {
        calls += 1
        return calls >= 90
      },
      fake.scheduler,
    )

    for (let index = 0; index < 89; index += 1) fake.tick()
    assert.equal(calls, 90)
    assert.equal(fake.pending(), 1, "the watcher never gives up on its own")
    stop()
  })

  it("uses the fast interval first and the slow heartbeat afterwards", () => {
    const fake = fakeScheduler()
    const stop = watchRail(() => false, fake.scheduler)

    for (let index = 0; index < 60; index += 1) fake.tick()
    assert.deepEqual(fake.delays.slice(0, 40), Array(40).fill(250))
    assert.deepEqual(fake.delays.slice(40, 45), Array(5).fill(2000))
    stop()
  })

  it("never runs again after stop", () => {
    const fake = fakeScheduler()
    let calls = 0
    const stop = watchRail(() => {
      calls += 1
      return false
    }, fake.scheduler)

    stop()
    fake.tick()
    fake.tick()
    assert.equal(calls, 1)
    assert.equal(fake.pending(), 0)
  })
})
