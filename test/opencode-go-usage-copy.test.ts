import assert from "node:assert/strict"
import { it } from "node:test"
import { formatOpenCodeGoWindowLines, getOpenCodeGoLabels } from "../src/core/opencode-go-usage-copy.js"

it("localizes OpenCode Go usage and displays remaining, status, and reset date", () => {
  const labels = getOpenCodeGoLabels("es-CL")
  const lines = formatOpenCodeGoWindowLines({
    remainingPercent: 75,
    status: "ok",
    resetsAt: "2026-09-23T12:00:00Z",
  }, labels, "es-CL")
  assert.equal(labels.heading, "Uso de OpenCode Go")
  assert.equal(lines[0], "restante: 75%")
  assert.equal(lines[1], "Estado: ok")
  assert.match(lines[2], /se restablece/)
})

it("shows unavailable values without inventing usage, status, or reset data", () => {
  assert.deepEqual(formatOpenCodeGoWindowLines(undefined, getOpenCodeGoLabels("en"), "en-US"), [
    "remaining: unavailable",
    "Status: unavailable",
    "resets unavailable",
  ])
})
