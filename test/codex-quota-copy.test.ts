import assert from "node:assert/strict"
import { it } from "node:test"
import { formatCodexQuotaWindowLines, formatQuotaResetCredits, getCodexQuotaLabels } from "../src/core/codex-quota-copy.js"

it("localizes Codex labels and preserves the distinction between credits and reset credits", () => {
  assert.equal(getCodexQuotaLabels("es-CL").heading, "Uso de Codex")
  assert.equal(formatQuotaResetCredits(2, 5, getCodexQuotaLabels("en")), "2 applicable / 5 available")
})

it("formats Codex used percentage and reset date with the system locale", () => {
  const lines = formatCodexQuotaWindowLines(
    { usedPercent: 25, limitWindowSeconds: 18000, resetAt: 1900000000 },
    getCodexQuotaLabels("en"),
    "en-US",
  )
  assert.equal(lines[0], "25% used")
  assert.equal(lines[1], `resets ${new Intl.DateTimeFormat("en-US", { day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(1900000000 * 1000))}`)
})
