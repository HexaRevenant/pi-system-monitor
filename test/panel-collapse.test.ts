import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderPanel, renderPanelLayout, type PanelSnapshot, type PanelTheme } from "../src/panel/render.js"
import type { SystemMetrics } from "../src/core/metrics.js"

const theme: PanelTheme = { fg: (_role, text) => text, bold: (text) => text }
const now = new Date("2026-10-31T14:32:07")

const metrics: SystemMetrics = {
  cpuPercent: 23,
  memoryUsedBytes: 8.1 * 1024 ** 3,
  memoryTotalBytes: 31.2 * 1024 ** 3,
  memoryPercent: 26,
  gpuPercent: 41,
  cpuTemperatureCelsius: 34,
  gpuTemperatureCelsius: 52,
  gpuMemoryUsedBytes: 2.4 * 1024 ** 3,
  gpuMemoryTotalBytes: 8 * 1024 ** 3,
  gpuMemoryPercent: 30,
  gpuMemoryIsUnified: null,
  downloadBytesPerSecond: 1.2 * 1024 ** 2,
  uploadBytesPerSecond: 84 * 1024,
}

const snapshot: PanelSnapshot = {
  now,
  metrics,
  git: {
    repository: true,
    branch: "main",
    ahead: 2,
    behind: 1,
    changes: [
      { status: "M", path: "src/a.ts" },
      { status: "A", path: "src/b.ts" },
    ],
  },
  usage: {
    kind: "codex",
    quota: {
      primary: { usedPercent: 25, limitWindowSeconds: 18000 },
      secondary: { usedPercent: 60, limitWindowSeconds: 604800 },
      additional: [],
    },
  },
}

const render = (collapsed: Set<"metrics" | "git" | "usage"> = new Set()) =>
  renderPanelLayout(snapshot, theme, 50, { locale: "es-ES", collapsed })

describe("collapsible panel sections", () => {
  it("shows expanded headings with a disclosure glyph and reports their rows", () => {
    const layout = render()
    const text = layout.lines.join("\n")
    assert.match(text, /▼.*Sistema/)
    assert.match(text, /▼.*Estado Git/)
    assert.match(text, /▼.*Uso de Codex/)
    assert.equal(layout.headers.length, 3)
    for (const header of layout.headers) {
      assert.match(layout.lines[header.row] ?? "", /^[│▎ ]*[▼▶]/)
    }
    assert.deepEqual(layout.headers.map((header) => header.section), ["metrics", "git", "usage"])
  })

  it("collapses metrics to one heading with a summary and hides its rows", () => {
    const layout = render(new Set(["metrics"]))
    const text = layout.lines.join("\n")
    assert.match(text, /▶.*Sistema.*CPU 23%.*RAM 26%.*GPU 41%/)
    assert.doesNotMatch(text, /VRAM/)
    assert.doesNotMatch(text, /1\.2 MiB\/s/)
    assert.equal(layout.headers.length, 3)
  })

  it("collapses git to its summary and hides the change list", () => {
    const text = render(new Set(["git"])).lines.join("\n")
    assert.match(text, /▶.*Estado Git.*main.*↑2.*↓1/)
    assert.doesNotMatch(text, /src\/a\.ts/)
  })

  it("collapses usage to its heading and hides the quota windows", () => {
    const text = render(new Set(["usage"])).lines.join("\n")
    assert.match(text, /▶.*Uso de Codex/)
    assert.doesNotMatch(text, /Sesión 25% usado/)
  })

  it("paints every section heading with the same role as the card title", () => {
    const tagged: PanelTheme = { fg: (role, text) => `{${role}}${text}`, bold: (text) => text }
    const layout = renderPanelLayout(snapshot, tagged, 50, { locale: "es-ES" })
    assert.match(layout.lines[0] ?? "", /\{accent\}.*Métricas del sistema/)
    for (const header of layout.headers) {
      const line = layout.lines[header.row] ?? ""
      assert.match(line, /\{accent\}/, `header ${header.section} does not use the title role`)
    }
    assert.match(layout.lines[layout.headers.find((header) => header.section === "git")!.row] ?? "", /\{accent\}.*Estado Git/)
  })

  it("keeps the public renderPanel result identical to the layout lines", () => {
    assert.deepEqual(renderPanel(snapshot, theme, 50, { locale: "es-ES" }), render().lines)
  })
})
