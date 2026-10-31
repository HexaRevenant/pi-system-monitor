import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatGiB, formatPercent, formatRate, formatTemperature } from "../src/core/format.js"
import { getFontDirectories, getMetricIcons, hasNerdFont, isNerdFontFile, shouldUseNerdFont } from "../src/core/font.js"

describe("metric formatting", () => {
  it("formats percentages and unavailable values", () => {
    assert.equal(formatPercent(42.4), "42%")
    assert.equal(formatPercent(null), "—")
  })

  it("formats temperatures and unavailable values", () => {
    assert.equal(formatTemperature(45.4), "45°C")
    assert.equal(formatTemperature(null), "—")
    assert.equal(formatTemperature(Number.NaN), "—")
  })

  it("formats memory in GiB", () => {
    assert.equal(formatGiB(1024 ** 3 * 3.5), "3.5 GiB")
    assert.equal(formatGiB(null), "—")
  })

  it("formats network rates with readable units", () => {
    assert.equal(formatRate(1536), "1.5 KiB/s")
    assert.equal(formatRate(2 * 1024 ** 2), "2.0 MiB/s")
  })
})

describe("Hack Nerd Font paths and fallback", () => {
  it("uses standard per-user directories on every supported platform", () => {
    assert.equal(getFontDirectories("linux", "/home/test")[0], "/home/test/.local/share/fonts")
    assert.equal(getFontDirectories("darwin", "/Users/test")[0], "/Users/test/Library/Fonts")
    assert.equal(getFontDirectories("win32", "C:\\Users\\test", { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" })[0], "C:\\Users\\test\\AppData\\Local\\Microsoft\\Windows\\Fonts")
  })

  it("recognizes Hack Nerd Font files and keeps Unicode fallback icons", () => {
    assert.equal(isNerdFontFile("HackNerdFont-Regular.ttf"), true)
    assert.equal(isNerdFontFile("JetBrainsMonoNerdFontMono-Regular.ttf"), true)
    assert.equal(isNerdFontFile("OtherFont.ttf"), false)
    assert.equal(getMetricIcons(false).cpu, "▣")
    assert.equal(getMetricIcons(false).vram, "◈")
    assert.equal(getMetricIcons(false).git, "±")
    for (const name of ["goRolling", "goWeekly", "goMonthly", "codexSession", "codexWeekly", "creditBalance", "quotaResetCredits", "additionalLimit", "git"] as const) {
      assert.ok(getMetricIcons(false)[name].length > 0, `Unicode ${name} icon should be available`)
      assert.ok(getMetricIcons(true)[name].length > 0, `Nerd Font ${name} icon should be available`)
      assert.notEqual(getMetricIcons(true)[name], getMetricIcons(false)[name], `${name} should have a font-specific variant`)
    }
    for (const name of ["disclosureExpanded", "disclosureCollapsed"] as const) {
      assert.equal(getMetricIcons(false)[name], getMetricIcons(true)[name], `${name} should match across font modes`)
    }
    assert.equal(getMetricIcons(false).disclosureExpanded, "▼")
    assert.equal(getMetricIcons(false).disclosureCollapsed, "▶")
    assert.notEqual(getMetricIcons(true).cpu, getMetricIcons(false).cpu)
    assert.notEqual(getMetricIcons(true).vram, getMetricIcons(false).vram)
    assert.equal(shouldUseNerdFont("win32", true, {}), false)
    assert.equal(shouldUseNerdFont("win32", true, { OPENCODE_MONITOR_NERD_FONT: "1" }), true)
  })

  it("does not scan Windows fonts unless explicitly opted in", async () => {
    const home = await mkdtemp(join(tmpdir(), "opencode-monitor-fonts-"))
    const fonts = join(home, "AppData", "Local", "Microsoft", "Windows", "Fonts")
    await mkdir(fonts, { recursive: true })
    await writeFile(join(fonts, "HackNerdFont-Regular.ttf"), "")
    const env = { LOCALAPPDATA: join(home, "AppData", "Local"), WINDIR: home }

    assert.equal(hasNerdFont("win32", home, env), false)
    assert.equal(shouldUseNerdFont("win32", hasNerdFont("win32", home, env), { OPENCODE_MONITOR_NERD_FONT: "1" }), true)
  })

  it("falls back safely for missing font paths", async () => {
    const home = await mkdtemp(join(tmpdir(), "opencode-monitor-fonts-"))
    assert.equal(hasNerdFont("win32", join(home, "missing"), {
      LOCALAPPDATA: join(home, "missing"), WINDIR: join(home, "missing"), OPENCODE_MONITOR_NERD_FONT: "1",
    }), false)
  })
})
