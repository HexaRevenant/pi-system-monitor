import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { visibleWidth } from "@earendil-works/pi-tui"
import { renderPanel, type PanelSnapshot, type PanelTheme } from "../src/panel/render.js"
import type { SystemMetrics } from "../src/core/metrics.js"
import type { GitStatus } from "../src/core/git-status.js"

const theme: PanelTheme = { fg: (_role, text) => text, bold: (text) => text }
const now = new Date("2026-10-31T14:32:07")

const emptyMetrics: SystemMetrics = {
  cpuPercent: null,
  memoryUsedBytes: null,
  memoryTotalBytes: null,
  memoryPercent: null,
  gpuPercent: null,
  cpuTemperatureCelsius: null,
  gpuTemperatureCelsius: null,
  gpuMemoryUsedBytes: null,
  gpuMemoryTotalBytes: null,
  gpuMemoryPercent: null,
  gpuMemoryIsUnified: null,
  downloadBytesPerSecond: null,
  uploadBytesPerSecond: null,
}

const metrics: SystemMetrics = {
  ...emptyMetrics,
  cpuPercent: 23,
  cpuTemperatureCelsius: 34,
  memoryUsedBytes: 8.1 * 1024 ** 3,
  memoryTotalBytes: 31.2 * 1024 ** 3,
  memoryPercent: 26,
  gpuPercent: 41,
  gpuTemperatureCelsius: 52,
  gpuMemoryUsedBytes: 2.4 * 1024 ** 3,
  gpuMemoryTotalBytes: 8 * 1024 ** 3,
  gpuMemoryPercent: 30,
  downloadBytesPerSecond: 1.2 * 1024 ** 2,
  uploadBytesPerSecond: 84 * 1024,
}

const git: GitStatus = {
  repository: true,
  branch: "main",
  ahead: 2,
  behind: 1,
  changes: [
    { status: "M", path: "src/extension.ts" },
    { status: "A", path: "src/panel/render.ts" },
    { status: "?", path: "docs/note.md" },
  ],
}

const snapshot = (overrides: Partial<PanelSnapshot> = {}): PanelSnapshot => ({
  now,
  metrics,
  git,
  ...overrides,
})

describe("panel renderer", () => {
  it("draws a neon card whose every line fits the requested width", () => {
    const lines = renderPanel(snapshot(), theme, 50, { locale: "es-ES", style: "neon" })
    assert.ok(lines.length > 4)
    for (const line of lines) assert.equal(visibleWidth(line), 50, `line does not fit: ${line}`)
    assert.match(lines[0] ?? "", /^╭─ .*Métricas del sistema/)
    assert.match(lines.at(-1) ?? "", /^╰─+╯$/)
  })

  it("shows the clock and every system row when the metrics are available", () => {
    const text = renderPanel(snapshot(), theme, 50, { locale: "es-ES", style: "neon" }).join("\n")
    assert.match(text, /14:32:07/)
    assert.match(text, /CPU.*23%.*34°C/)
    assert.match(text, /RAM.*8\.1 GiB.*31\.2 GiB.*26%/)
    assert.match(text, /GPU.*41%.*52°C/)
    assert.match(text, /VRAM.*2\.4 GiB.*8\.0 GiB.*30%/)
    assert.match(text, /1\.2 MiB\/s/)
    assert.match(text, /84 KiB\/s/)
  })

  it("keeps every row with an em dash when a metric is unavailable", () => {
    const text = renderPanel(snapshot({ metrics: emptyMetrics }), theme, 50, { locale: "es-ES", style: "neon" }).join("\n")
    for (const label of ["CPU", "RAM", "GPU", "VRAM"]) assert.match(text, new RegExp(label))
    assert.match(text, /—/)
    assert.doesNotMatch(text, /null|undefined|NaN/)
  })

  it("bounds the git change list and reports the hidden remainder", () => {
    const text = renderPanel(snapshot(), theme, 50, { locale: "es-ES", style: "neon", maxChanges: 2 }).join("\n")
    assert.match(text, /main/)
    assert.match(text, /↑2/)
    assert.match(text, /↓1/)
    assert.match(text, /src\/extension\.ts/)
    assert.match(text, /src\/panel\/render\.ts/)
    assert.doesNotMatch(text, /docs\/note\.md/)
    assert.match(text, /\+1 más/)
  })

  it("renders Codex usage only when that panel is active", () => {
    const codex = renderPanel(
      snapshot({ usage: { kind: "codex", quota: { primary: { usedPercent: 25, limitWindowSeconds: 18000 }, secondary: { usedPercent: 60, limitWindowSeconds: 604800 }, additional: [] } } }),
      theme,
      50,
      { locale: "es-ES", style: "neon" },
    ).join("\n")
    assert.match(codex, /Uso de Codex/)
    assert.match(codex, /Sesión.*25%/)
    assert.match(codex, /Semanal.*60%/)
  })

  it("renders OpenCode Go usage with its remaining percentages", () => {
    const go = renderPanel(
      snapshot({ usage: { kind: "opencode-go", usage: { rolling: { remainingPercent: 75, status: "ok" }, weekly: { remainingPercent: 40 } } } }),
      theme,
      50,
      { locale: "es-ES", style: "neon" },
    ).join("\n")
    assert.match(go, /OpenCode Go/)
    assert.match(go, /75%/)
    assert.match(go, /40%/)
  })

  it("renders the float style with a left bar and no closing border", () => {
    const lines = renderPanel(snapshot(), theme, 50, { locale: "es-ES", style: "float" })
    assert.ok(lines.length > 3)
    for (const line of lines) assert.equal(visibleWidth(line), 50)
    assert.match(lines[0] ?? "", /^▎ .*Métricas del sistema/)
    assert.doesNotMatch(lines.at(-1) ?? "", /╰/)
  })

  it("renders nothing when the width cannot hold the frame", () => {
    assert.deepEqual(renderPanel(snapshot(), theme, 10, { locale: "es-ES" }), [])
  })
})
