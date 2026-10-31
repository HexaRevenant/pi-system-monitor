import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MONITOR_USAGE, parseMonitorCommand } from "../src/pi/monitor-command.js"

describe("monitor command parser", () => {
  it("rejects trailing or conflicting arguments instead of ignoring them", () => {
    for (const args of ["on off", "refresh metrics", "collapse all extra", "toggle git extra"]) {
      assert.deepEqual(parseMonitorCommand(args), { kind: "usage" }, args)
    }
  })

  it("accepts the complete command set", () => {
    assert.deepEqual(parseMonitorCommand(""), { kind: "toggle-card" })
    assert.deepEqual(parseMonitorCommand("   "), { kind: "toggle-card" })
    assert.deepEqual(parseMonitorCommand("on"), { kind: "set-visible", visible: true })
    assert.deepEqual(parseMonitorCommand("off"), { kind: "set-visible", visible: false })
    assert.deepEqual(parseMonitorCommand("refresh"), { kind: "refresh" })
    assert.deepEqual(parseMonitorCommand("toggle git"), { kind: "toggle-section", section: "git" })
    assert.deepEqual(parseMonitorCommand("collapse metrics"), { kind: "set-section", section: "metrics", collapsed: true })
    assert.deepEqual(parseMonitorCommand("expand usage"), { kind: "set-section", section: "usage", collapsed: false })
    assert.deepEqual(parseMonitorCommand("expand all"), { kind: "expand-all" })
    assert.deepEqual(parseMonitorCommand("collapse all"), { kind: "collapse-all" })
    assert.equal(MONITOR_USAGE.startsWith("Usage: /monitor"), true)
  })

  it("rejects unknown, incomplete, or malformed commands", () => {
    for (const args of ["toggle", "toggle nope", "expand", "collapse all all", "wat", "on off extra"]) {
      assert.deepEqual(parseMonitorCommand(args), { kind: "usage" }, args)
    }
  })

  it("preserves the baseline case-insensitive grammar", () => {
    assert.deepEqual(parseMonitorCommand("ON"), { kind: "set-visible", visible: true })
    assert.deepEqual(parseMonitorCommand("Refresh"), { kind: "refresh" })
    assert.deepEqual(parseMonitorCommand("Toggle Git"), { kind: "toggle-section", section: "git" })
    assert.deepEqual(parseMonitorCommand("EXPAND ALL"), { kind: "expand-all" })
  })
})
