import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { hasRailCard, installRailCard, RAIL_CARD_TARGETS, SIDEBAR_STATE, type SidebarRail } from "../src/pi/rail.js"

function fakeTui(parts: Map<string, SidebarRail>) {
  const rendered: number[] = []
  const terminal: Record<symbol, unknown> = { [SIDEBAR_STATE]: { parts } }
  const tui = { terminal, requestRender: () => rendered.push(1) }
  return { tui, rendered }
}

const card = (lines: string[], digest = "card-1") => ({
  render: () => lines,
  digest: () => digest,
})

const agents = (lines: string[]): SidebarRail => ({ render: () => lines, digest: () => "agents-1" })

describe("rail injection", () => {
  it("takes the agents slot so the card paints above AGENTS", () => {
    const parts = new Map<string, SidebarRail>([
      ["agents", agents(["AGENTS"])],
      ["footer", { render: () => ["STATUS"] }],
    ])
    const { tui } = fakeTui(parts)

    installRailCard(tui, () => card(["CARD"]))
    assert.deepEqual(parts.get("agents")?.render(40), ["CARD", "", "AGENTS"])
    assert.deepEqual(parts.get("footer")?.render(40), ["STATUS"])
  })

  it("falls back to the footer slot when no earlier slot exists", () => {
    const parts = new Map<string, SidebarRail>([["footer", { render: () => ["STATUS"] }]])
    const { tui } = fakeTui(parts)

    installRailCard(tui, () => card(["CARD"]))
    assert.deepEqual(parts.get("footer")?.render(40), ["CARD", "", "STATUS"])
  })

  it("keeps a combined digest and restores the wrapped part on dispose", () => {
    const base = agents(["AGENTS"])
    const parts = new Map<string, SidebarRail>([["agents", base]])
    const { tui } = fakeTui(parts)

    const dispose = installRailCard(tui, () => card(["CARD"]))
    const wrapper = parts.get("agents")
    assert.notEqual(wrapper, base)
    assert.equal(wrapper?.digest?.(), "agents-1|card-1|host")

    dispose()
    assert.equal(parts.get("agents"), base)
  })

  it("does not add a separator when the wrapped part is empty", () => {
    const parts = new Map<string, SidebarRail>([["agents", agents([])]])
    const { tui } = fakeTui(parts)

    installRailCard(tui, () => card(["CARD"]))
    assert.deepEqual(parts.get("agents")?.render(40), ["CARD"])
  })

  it("declares its own card group ahead of the shifted groups it wraps", () => {
    const base: SidebarRail = {
      render: () => ["▼ AGENTS", "none running", "▼ JOBS", "idle"],
      cardGroups: () => ({ groups: [{ start: 0, end: 2 }, { start: 2, end: 4 }], loose: [1] }),
    }
    const parts = new Map<string, SidebarRail>([["agents", base]])
    const { tui } = fakeTui(parts)

    installRailCard(tui, () => card(["CARD0", "CARD1"]))
    const wrapper = parts.get("agents")
    wrapper?.render(40)
    assert.deepEqual(wrapper?.cardGroups?.(40), {
      groups: [
        { start: 0, end: 2 },
        { start: 3, end: 5 },
        { start: 5, end: 7 },
      ],
      loose: [4],
    })
  })

  it("groups the wrapped part on its own when it declares no groups", () => {
    const parts = new Map<string, SidebarRail>([["agents", agents(["AGENTS", "running"])]])
    const { tui } = fakeTui(parts)

    installRailCard(tui, () => card(["CARD0", "CARD1"]))
    const wrapper = parts.get("agents")
    wrapper?.render(40)
    assert.deepEqual(wrapper?.cardGroups?.(40), {
      groups: [
        { start: 0, end: 2 },
        { start: 3, end: 5 },
      ],
    })
  })

  it("forwards the host members it does not override", () => {
    const base: SidebarRail & { summary?(): string; open?(): void } = {
      render: () => ["AGENTS"],
      summary: () => "2 running",
      open: () => {},
    }
    const parts = new Map<string, SidebarRail>([["agents", base]])
    const { tui } = fakeTui(parts)

    installRailCard(tui, () => card(["CARD"]))
    const wrapper = parts.get("agents") as unknown as { summary?(): string; open?(): void }
    assert.equal(wrapper.summary?.(), "2 running")
    assert.equal(typeof wrapper.open, "function")
  })

  it("wraps only once and keeps the first wrapper", () => {
    const parts = new Map<string, SidebarRail>([["agents", agents(["AGENTS"])]])
    const { tui } = fakeTui(parts)

    const first = installRailCard(tui, () => card(["ONE"]))
    const wrapper = parts.get("agents")
    const second = installRailCard(tui, () => card(["TWO"]))
    assert.equal(parts.get("agents"), wrapper)
    assert.deepEqual(wrapper?.render(40), ["ONE", "", "AGENTS"])
    second()
    assert.equal(parts.get("agents"), wrapper)
    first()
  })

  it("never lets a card or host failure reach the host render path", () => {
    const base: SidebarRail = { render: () => ["AGENTS"], digest: () => { throw new Error("boom") } }
    const parts = new Map<string, SidebarRail>([["agents", base]])
    const { tui } = fakeTui(parts)

    installRailCard(tui, () => ({ render: () => { throw new Error("card boom") }, digest: () => { throw new Error("digest boom") } }))
    const wrapper = parts.get("agents")
    assert.deepEqual(wrapper?.render(40), ["AGENTS"])
    assert.equal(wrapper?.digest?.(), "||host")

    const brokenParts = new Map<string, SidebarRail>([["agents", { render: () => { throw new Error("agents boom") } }]])
    const { tui: brokenTui } = fakeTui(brokenParts)
    installRailCard(brokenTui, () => card(["CARD"]))
    assert.deepEqual(brokenParts.get("agents")?.render(40), ["CARD"])
  })

  it("is a no-op when no target slot exists", () => {
    const parts = new Map<string, SidebarRail>()
    const { tui } = fakeTui(parts)
    const dispose = installRailCard(tui, () => card(["CARD"]))
    assert.equal(typeof dispose, "function")
    assert.equal(parts.size, 0)
    dispose()

    const disposeHeadless = installRailCard({ requestRender: () => {} }, () => card(["CARD"]))
    disposeHeadless()
  })

  it("reports whether this extension currently owns a rail slot", () => {
    const parts = new Map<string, SidebarRail>([["agents", agents(["AGENTS"])]])
    const { tui } = fakeTui(parts)
    assert.equal(hasRailCard(tui), false)
    const dispose = installRailCard(tui, () => card(["CARD"]))
    assert.equal(hasRailCard(tui), true)
    dispose()
    assert.equal(hasRailCard(tui), false)
    assert.equal(hasRailCard({}), false)
  })

  it("requests a render after installing", () => {
    const parts = new Map<string, SidebarRail>([["agents", agents(["AGENTS"])]])
    const { tui, rendered } = fakeTui(parts)
    installRailCard(tui, () => card(["CARD"]))
    assert.equal(rendered.length, 1)
  })

  it("routes a click on a card row to the card and shifts clicks to the wrapped part", () => {
    const baseClicks: Array<{ y?: number }> = []
    const base: SidebarRail = {
      render: () => ["AGENTS"],
      handleMouse: (event) => {
        baseClicks.push(event as { y?: number })
        return { handled: true, source: "agents" }
      },
    }
    const parts = new Map<string, SidebarRail>([["agents", base]])
    const { tui } = fakeTui(parts)
    const toggled: number[] = []
    installRailCard(tui, () => ({
      render: () => ["CARD0", "CARD1", "CARD2"],
      handleRow: (row) => {
        if (row !== 1) return false
        toggled.push(row)
        return true
      },
    }))

    const wrapper = parts.get("agents")
    wrapper?.render(40)
    assert.deepEqual(wrapper?.handleMouse?.({ type: "click", button: "left", y: 1 }), { handled: true, render: true })
    assert.deepEqual(toggled, [1])

    assert.deepEqual(wrapper?.handleMouse?.({ type: "click", button: "left", y: 5 }), { handled: true, source: "agents" })
    assert.deepEqual(baseClicks[0], { type: "click", button: "left", y: 1 })

    assert.deepEqual(wrapper?.handleMouse?.({ type: "move", y: 3 }), { handled: true, source: "agents" })
    assert.equal(baseClicks.length, 2)
  })

  it("maps card rows from zero when the wrapped part is empty", () => {
    const parts = new Map<string, SidebarRail>([["agents", agents([])]])
    const { tui } = fakeTui(parts)
    const toggled: number[] = []
    installRailCard(tui, () => ({
      render: () => ["CARD0", "CARD1"],
      handleRow: (row) => {
        toggled.push(row)
        return row === 0
      },
    }))

    const wrapper = parts.get("agents")
    assert.deepEqual(wrapper?.render(40), ["CARD0", "CARD1"])
    assert.deepEqual(wrapper?.handleMouse?.({ type: "click", button: "left", y: 0 }), { handled: true, render: true })
    assert.deepEqual(toggled, [0])
  })

  it("asks the card for host chrome while the rail keeps calling cardGroups", () => {
    const parts = new Map<string, SidebarRail>([["agents", agents(["AGENTS"])]])
    const { tui } = fakeTui(parts)
    const chromes: Array<string | undefined> = []
    installRailCard(tui, () => ({
      render: (_width, context) => {
        chromes.push(context?.chrome)
        return ["CARD"]
      },
    }))

    const wrapper = parts.get("agents")
    wrapper?.render(40)
    wrapper?.cardGroups?.(40)
    wrapper?.render(40)
    wrapper?.cardGroups?.(40)
    assert.deepEqual(chromes, ["host", "host"])
  })

  it("falls back to drawing its own frame when the host never asks for card groups", () => {
    const parts = new Map<string, SidebarRail>([["agents", agents(["AGENTS"])]])
    const { tui } = fakeTui(parts)
    const chromes: Array<string | undefined> = []
    installRailCard(tui, () => ({
      render: (_width, context) => {
        chromes.push(context?.chrome)
        return ["CARD"]
      },
      digest: () => "card",
    }))

    const wrapper = parts.get("agents")
    wrapper?.render(40)
    wrapper?.render(40)
    wrapper?.render(40)
    assert.deepEqual(chromes, ["host", "self", "self"])
    assert.equal(wrapper?.digest?.(), "agents-1|card|self")
  })

  it("keeps the declared target order stable", () => {
    assert.deepEqual([...RAIL_CARD_TARGETS], ["agents", "footer"])
  })
})
