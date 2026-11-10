import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { visibleWidth } from "@earendil-works/pi-tui"
import { headerAction, nextDensity, PANEL_DENSITIES, renderPanel, renderPanelLayout, type PanelDensity, type PanelSnapshot, type PanelTheme } from "../src/panel/render.js"
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

  it("renders the float style as its own box instead of an indented bar", () => {
    const lines = renderPanel(snapshot(), theme, 50, { locale: "es-ES", style: "float" })
    assert.ok(lines.length > 3)
    for (const line of lines) assert.equal(visibleWidth(line), 50)
    assert.match(lines[0] ?? "", /^┌─ .*Métricas del sistema ─+┐$/)
    assert.match(lines.at(-1) ?? "", /^└─+┘$/)
    assert.doesNotMatch(lines.join("\n"), /▎/)
  })

  it("returns frameless rows when the rail paints the card", () => {
    const lines = renderPanel(snapshot(), theme, 50, { locale: "es-ES", chrome: "host" })
    assert.ok(lines.length > 3)
    assert.match(lines[0] ?? "", /Métricas del sistema$/)
    assert.doesNotMatch(lines.join("\n"), /[┌┐└┘│▎]/)
  })

  it("renders nothing when the width cannot hold the frame", () => {
    assert.deepEqual(renderPanel(snapshot(), theme, 10, { locale: "es-ES" }), [])
    assert.deepEqual(renderPanel(snapshot(), theme, 10, { locale: "es-ES", chrome: "host" }), [])
  })
})

describe("panel density", () => {
  const hostRows = (density: PanelDensity, overrides: Partial<PanelSnapshot> = {}, width = 52) =>
    renderPanelLayout(snapshot(overrides), theme, width, { locale: "es-ES", chrome: "host", density })

  it("pairs two metrics per row and moves the clock into the title row", () => {
    const compact = hostRows("compact")
    assert.match(compact.lines[0] ?? "", /^Métricas del sistema\s+31\/10\/2026 14:32:07$/)
    const cpu = compact.lines.find((line) => line.includes("CPU"))
    const ram = compact.lines.find((line) => line.includes("RAM"))
    assert.ok(cpu !== undefined && ram !== undefined)
    assert.match(cpu ?? "", /CPU .*23% .*34°C/)
    assert.match(ram ?? "", /RAM .*26%/)
    assert.doesNotMatch(compact.lines.join("\n"), /8\.1 GiB/, "compact density drops the byte totals")
  })

  it("keeps the Git section expanded in every density and inlines the usage", () => {
    const usage = { kind: "opencode-go", usage: { rolling: { remainingPercent: 97, status: "ok" }, weekly: { remainingPercent: 90, status: "ok" }, monthly: { remainingPercent: 63, status: "ok" } } } as const
    for (const density of ["compact", "dense", "summary"] as const) {
      const lines = hostRows(density, { usage }, 64).lines
      const gitRow = lines.findIndex((line) => line.includes("Estado Git"))
      assert.match(lines[gitRow] ?? "", /▼ .*Estado Git$/, density)
      assert.match(lines[gitRow + 1] ?? "", /main · 3 archivos/, density)
      assert.match(lines[gitRow + 2] ?? "", /M .*src\/extension\.ts/, density)
    }
    const wide = hostRows("compact", { usage }, 64).lines
    const usageRow = wide.find((line) => line.includes("OpenCode Go")) ?? ""
    assert.match(usageRow, /▼ .*OpenCode Go  5h 97% · sem 90% · mes 63%/)
    assert.doesNotMatch(wide.join("\n"), /restante/)

    const narrow = hostRows("compact", { usage }, 46).lines
    const index = narrow.findIndex((line) => line.includes("OpenCode Go"))
    assert.match(narrow[index] ?? "", /▼ .*OpenCode Go$/)
    assert.match(narrow[index + 1] ?? "", /5h 97% · sem 90% · mes 63%/)
  })

  it("marks the density control on the metrics header and hit-tests its column", () => {
    const compact = hostRows("compact")
    const header = compact.headers.find((candidate) => candidate.section === "metrics")
    const toggle = compact.toggle
    assert.ok(header !== undefined && toggle !== undefined)
    assert.equal(toggle.row, header.row)
    assert.match(compact.lines[header.row] ?? "", /Sistema ↻/)
    assert.equal(headerAction(compact, header.row, toggle.column), "toggle-view")
    assert.equal(headerAction(compact, header.row, toggle.column + 1), "toggle-view")
    assert.equal(headerAction(compact, header.row, toggle.column + 3), "toggle-view")
    assert.equal(headerAction(compact, header.row, toggle.column + 4), "toggle-section")
    assert.equal(headerAction(compact, header.row, toggle.column - 2), "toggle-section")
    assert.equal(headerAction(compact, 0, toggle.column), "none")
  })

  it("keeps the control available in the comfortable density too", () => {
    const comfortable = hostRows("comfortable")
    const toggle = comfortable.toggle
    assert.ok(toggle !== undefined)
    assert.match(comfortable.lines[toggle.row] ?? "", /Sistema ↻$/)
  })
})

describe("panel density cycle", () => {
  const usage = { kind: "opencode-go", usage: { rolling: { remainingPercent: 97, status: "ok" }, weekly: { remainingPercent: 90, status: "ok" }, monthly: { remainingPercent: 63, status: "ok" } } } as const
  const hostRows = (density: PanelDensity, width = 60) =>
    renderPanelLayout(snapshot({ usage }), theme, width, { locale: "es-ES", chrome: "host", density })

  it("cycles comfortable, compact, dense, summary, minimal and back", () => {
    assert.equal(nextDensity("comfortable"), "compact")
    assert.equal(nextDensity("compact"), "dense")
    assert.equal(nextDensity("dense"), "summary")
    assert.equal(nextDensity("summary"), "minimal")
    assert.equal(nextDensity("minimal"), "comfortable")
    assert.equal(PANEL_DENSITIES.length, 5)
  })

  it("dense pairs two metrics per row without gauges and keeps the totals", () => {
    const lines = hostRows("dense").lines
    assert.doesNotMatch(lines.join("\n"), /▰|▱/)
    const cpuRow = lines.find((line) => line.includes("CPU")) ?? ""
    assert.match(cpuRow, /CPU .*23% .*34°C/)
    assert.match(cpuRow, /GPU .*41% .*52°C/)
    assert.match(lines.join("\n"), /8\.1 GiB\/31\.2 GiB/)
  })

  it("summary keeps the metrics on the heading row alone", () => {
    const layout = hostRows("summary")
    const header = layout.headers.find((candidate) => candidate.section === "metrics")
    assert.ok(header !== undefined)
    assert.match(layout.lines[header.row] ?? "", /▼ .*Sistema ↻  CPU 23% · RAM 26% · GPU 41% · VRAM 30%/)
    assert.equal(layout.lines.filter((line) => line.includes("CPU ")).length, 1)
  })

  it("is shorter than comfortable in every folded density, summary being the shortest", () => {
    const size = (density: PanelDensity) => hostRows(density).lines.length
    const comfortable = size("comfortable")
    for (const density of ["compact", "dense", "summary"] as const) {
      assert.ok(size(density) < comfortable, `${density}: ${size(density)} vs ${comfortable}`)
    }
    assert.ok(size("summary") <= size("compact"))
    assert.ok(size("summary") <= size("dense"))
  })

  it("splits a dense pair instead of truncating it on a narrow rail", () => {
    const lines = hostRows("dense", 46).lines
    const ram = lines.find((line) => line.includes("RAM")) ?? ""
    const vram = lines.find((line) => line.includes("VRAM")) ?? ""
    assert.notEqual(ram, "")
    assert.notEqual(vram, "")
    assert.doesNotMatch(ram, /VRAM/)
    assert.match(ram, /8\.1 GiB\/31\.2 GiB  26%$/)
  })
})

describe("summary density on a narrow rail", () => {
  it("wraps the metrics summary instead of truncating it", () => {
    const layout = renderPanelLayout(snapshot(), theme, 46, { locale: "es-ES", chrome: "host", density: "summary" })
    const header = layout.headers.find((candidate) => candidate.section === "metrics")
    assert.ok(header !== undefined)
    assert.match(layout.lines[header.row] ?? "", /▼ .*Sistema ↻$/)
    assert.match(layout.lines[header.row + 1] ?? "", /CPU 23% · RAM 26% · GPU 41% · VRAM 30%/)
  })
})

describe("header stamp", () => {
  const first = (locale: string) =>
    renderPanelLayout(snapshot(), theme, 60, { locale, chrome: "host", density: "compact" }).lines[0] ?? ""

  it("takes the date field order from the locale and a 24-hour clock", () => {
    assert.match(first("es-ES"), /31\/10\/2026 14:32:07$/)
    assert.match(first("en-US"), /10\/31\/2026 14:32:07$/)
    assert.match(first("sv-SE"), /2026-10-31 14:32:07$/)
  })

  it("never drops the year or the seconds: a stamp that cannot fit the header gets its own row", () => {
    const layout = renderPanelLayout(snapshot(), theme, 44, { locale: "es-ES", chrome: "host", density: "compact" })
    assert.equal((layout.lines[0] ?? "").trim(), "Métricas del sistema")
    assert.match(layout.lines[1] ?? "", /31\/10\/2026 14:32:07$/)
  })

  it("stays out of the comfortable density, which keeps its own clock row", () => {
    const lines = renderPanel(snapshot(), theme, 60, { locale: "es-ES", chrome: "host", density: "comfortable" })
    assert.doesNotMatch(lines[0] ?? "", /\d{2}\/\d{2}\/\d{4}/)
    assert.match(lines[1] ?? "", /^[^·]+ · 14:32:07$/)
  })
})

describe("minimal density", () => {
  const usage = { kind: "opencode-go", usage: { rolling: { remainingPercent: 92, status: "ok" }, weekly: { remainingPercent: 88, status: "ok" }, monthly: { remainingPercent: 62, status: "ok" } } } as const
  const lines = (width = 46) =>
    renderPanelLayout(snapshot({ usage }), theme, width, { locale: "es-ES", chrome: "host", density: "minimal" }).lines

  it("drops the fold glyphs and the separators, keeping the Sistema label", () => {
    const rows = lines()
    assert.equal(rows.length, 4)
    assert.match(rows[1] ?? "", /^▦ Sistema ↻  CPU 23% RAM 26% GPU 41% VRAM 30%$/)
    assert.match(rows[2] ?? "", /^◷ Uso de OpenCode Go  5h 92% sem 88% mes 62%$/)
    assert.match(rows[3] ?? "", /^± main 3 archivos ↑2 ↓1$/)
    assert.doesNotMatch(rows.join("\n"), /[▼▶]/)
    assert.doesNotMatch(rows.join("\n"), /·/)
  })

  it("keeps the density control on the Sistema row", () => {
    const layout = renderPanelLayout(snapshot({ usage }), theme, 46, { locale: "es-ES", chrome: "host", density: "minimal" })
    const toggle = layout.toggle
    assert.ok(toggle !== undefined)
    assert.equal(headerAction(layout, toggle.row, toggle.column), "toggle-view")
  })
})
