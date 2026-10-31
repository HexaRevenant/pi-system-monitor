import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { extensionLink, planExtensionInstall, resolveAgentHome } from "../scripts/install-plan.js"

describe("install plan", () => {
  const link = "/agent/extensions/pi-system-monitor"
  const target = "/repo/pi-system-monitor"

  it("creates a symlink when nothing is installed", () => {
    assert.deepEqual(planExtensionInstall(link, target, { exists: false }, false), { action: "create", link, target })
  })

  it("keeps an existing link to the same checkout", () => {
    const plan = planExtensionInstall(link, target, { exists: true, symlink: true, target }, false)
    assert.equal(plan.action, "keep")
  })

  it("refuses a different link unless forced, and never deletes a real directory", () => {
    const other = planExtensionInstall(link, target, { exists: true, symlink: true, target: "/other" }, false)
    assert.equal(other.action, "refuse")
    const forced = planExtensionInstall(link, target, { exists: true, symlink: true, target: "/other" }, true)
    assert.equal(forced.action, "replace")
    const real = planExtensionInstall(link, target, { exists: true, symlink: false }, true)
    assert.equal(real.action, "refuse")
  })

  it("resolves the agent home from the flag, gentle-shell, Pi, then the default", () => {
    assert.equal(resolveAgentHome({ flag: "/flag", env: { GENTLE_SHELL_HOME: "/gentle" }, home: "/home" }), "/flag")
    assert.equal(resolveAgentHome({ env: { GENTLE_SHELL_HOME: "/gentle", PI_CODING_AGENT_DIR: "/pi" }, home: "/home" }), "/gentle")
    assert.equal(resolveAgentHome({ env: { PI_CODING_AGENT_DIR: "/pi" }, home: "/home" }), "/pi")
    assert.equal(resolveAgentHome({ env: {}, home: "/home" }), "/home/.gentle-shell/agent")
    assert.equal(extensionLink("/agent"), "/agent/extensions/pi-system-monitor")
  })
})
