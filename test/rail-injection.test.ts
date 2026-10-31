import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { hasBelowStatusRail, installBelowStatusRail, SIDEBAR_STATE, type SidebarRail } from "../src/pi/rail.js"

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

describe("rail injection", () => {
  it("appends the card below the Status card and keeps a combined digest", () => {
    const base: SidebarRail = { render: () => ["STATUS"], digest: () => "status-1" }
    const parts = new Map<string, SidebarRail>([["footer", base]])
    const { tui } = fakeTui(parts)

    const dispose = installBelowStatusRail(tui, () => card(["CARD"]))
    const wrapper = parts.get("footer")
    assert.notEqual(wrapper, base)
    assert.deepEqual(wrapper?.render(40), ["STATUS", "", "CARD"])
    assert.equal(wrapper?.digest?.(), "status-1|card-1")

    dispose()
    assert.equal(parts.get("footer"), undefined)
  })

  it("does not duplicate the separator when the Status card is empty", () => {
    const base: SidebarRail = { render: () => [] }
    const parts = new Map<string, SidebarRail>([["footer", base]])
    const { tui } = fakeTui(parts)

    installBelowStatusRail(tui, () => card(["CARD"]))
    assert.deepEqual(parts.get("footer")?.render(40), ["CARD"])
  })

  it("wraps only once and keeps the first wrapper", () => {
    const base: SidebarRail = { render: () => ["STATUS"] }
    const parts = new Map<string, SidebarRail>([["footer", base]])
    const { tui } = fakeTui(parts)

    const first = installBelowStatusRail(tui, () => card(["ONE"]))
    const wrapper = parts.get("footer")
    const second = installBelowStatusRail(tui, () => card(["TWO"]))
    assert.equal(parts.get("footer"), wrapper)
    assert.deepEqual(wrapper?.render(40), ["STATUS", "", "ONE"])
    second()
    assert.equal(parts.get("footer"), wrapper)
    first()
  })

  it("never lets a card or Status failure reach the host render path", () => {
    const base: SidebarRail = { render: () => ["STATUS"], digest: () => { throw new Error("boom") } }
    const parts = new Map<string, SidebarRail>([["footer", base]])
    const { tui } = fakeTui(parts)

    installBelowStatusRail(tui, () => ({ render: () => { throw new Error("card boom") }, digest: () => { throw new Error("digest boom") } }))
    const wrapper = parts.get("footer")
    assert.deepEqual(wrapper?.render(40), ["STATUS"])
    assert.equal(wrapper?.digest?.(), "|")

    const broken: SidebarRail = { render: () => { throw new Error("status boom") } }
    const brokenParts = new Map<string, SidebarRail>([["footer", broken]])
    const { tui: brokenTui } = fakeTui(brokenParts)
    installBelowStatusRail(brokenTui, () => card(["CARD"]))
    assert.deepEqual(brokenParts.get("footer")?.render(40), ["CARD"])
  })

  it("is a no-op when the sidebar rail is missing", () => {
    const tui = { requestRender: () => {} }
    const dispose = installBelowStatusRail(tui, () => card(["CARD"]))
    assert.equal(typeof dispose, "function")
    dispose()
  })

  it("reports whether this extension currently owns the Status rail", () => {
    const parts = new Map<string, SidebarRail>([["footer", { render: () => ["STATUS"] }]])
    const { tui } = fakeTui(parts)
    assert.equal(hasBelowStatusRail(tui), false)
    const dispose = installBelowStatusRail(tui, () => card(["CARD"]))
    assert.equal(hasBelowStatusRail(tui), true)
    dispose()
    assert.equal(hasBelowStatusRail(tui), false)
    assert.equal(hasBelowStatusRail({}), false)
  })

  it("requests a render after installing", () => {
    const parts = new Map<string, SidebarRail>([["footer", { render: () => ["STATUS"] }]])
    const { tui, rendered } = fakeTui(parts)
    installBelowStatusRail(tui, () => card(["CARD"]))
    assert.equal(rendered.length, 1)
  })

  it("routes a click on a card row to the card and delegates every other click", () => {
    const baseClicks: unknown[] = []
    const base: SidebarRail = {
      render: () => ["STATUS"],
      handleMouse: (event) => {
        baseClicks.push(event)
        return { handled: true, source: "status" }
      },
    }
    const parts = new Map<string, SidebarRail>([["footer", base]])
    const { tui } = fakeTui(parts)
    const toggled: number[] = []
    installBelowStatusRail(tui, () => ({
      render: () => ["CARD0", "CARD1", "CARD2"],
      handleRow: (row) => {
        if (row !== 1) return false
        toggled.push(row)
        return true
      },
    }))

    const wrapper = parts.get("footer")
    wrapper?.render(40)
    assert.deepEqual(wrapper?.handleMouse?.({ type: "click", button: "left", y: 3 }), { handled: true, render: true })
    assert.deepEqual(toggled, [1])

    assert.deepEqual(wrapper?.handleMouse?.({ type: "click", button: "left", y: 0 }), { handled: true, source: "status" })
    assert.deepEqual(wrapper?.handleMouse?.({ type: "move", y: 3 }), { handled: true, source: "status" })
    assert.equal(baseClicks.length, 2)
  })

  it("maps card rows from zero when the Status card is empty", () => {
    const parts = new Map<string, SidebarRail>([["footer", { render: () => [] }]])
    const { tui } = fakeTui(parts)
    let clicked = -1
    installBelowStatusRail(tui, () => ({
      render: () => ["HEADER"],
      handleRow: (row) => {
        clicked = row
        return true
      },
    }))
    const wrapper = parts.get("footer")
    wrapper?.render(40)
    wrapper?.handleMouse?.({ type: "click", button: "left", y: 0 })
    assert.equal(clicked, 0)
  })
})
