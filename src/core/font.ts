import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { posix, win32 } from "node:path"

export type SupportedPlatform = "linux" | "darwin" | "win32"

const NERD_FONT_FILE_PATTERN = /NerdFont[A-Za-z0-9-]*[-_][A-Za-z0-9-]+\.(?:ttf|otf)$/i
const MAX_FONT_SCAN_DEPTH = 2
const MAX_FONT_SCAN_ENTRIES = 256

export function getFontDirectories(platform: SupportedPlatform, home = homedir(), env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform === "darwin") return [posix.join(home, "Library", "Fonts"), "/Library/Fonts", "/System/Library/Fonts"]
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA ?? win32.join(home, "AppData", "Local")
    const windows = env.WINDIR ?? "C:\\Windows"
    return [win32.join(localAppData, "Microsoft", "Windows", "Fonts"), win32.join(windows, "Fonts")]
  }
  return [posix.join(home, ".local", "share", "fonts"), posix.join(home, ".fonts"), "/usr/local/share/fonts", "/usr/share/fonts"]
}

export function isNerdFontFile(fileName: string): boolean {
  return NERD_FONT_FILE_PATTERN.test(fileName)
}

export function hasNerdFont(platform: SupportedPlatform = process.platform as SupportedPlatform, home = homedir(), env: NodeJS.ProcessEnv = process.env): boolean {
  if (platform === "win32" && env.OPENCODE_MONITOR_NERD_FONT !== "1") return false

  const containsFont = (directory: string, depth: number): boolean => {
    if (depth > MAX_FONT_SCAN_DEPTH) return false
    if (!existsSync(directory)) return false
    try {
      return readdirSync(directory, { withFileTypes: true }).slice(0, MAX_FONT_SCAN_ENTRIES).some((entry) => {
        const path = platform === "win32" ? win32.join(directory, entry.name) : posix.join(directory, entry.name)
        return entry.isFile() ? isNerdFontFile(entry.name) : entry.isDirectory() && containsFont(path, depth + 1)
      })
    } catch {
      return false
    }
  }
  return getFontDirectories(platform, home, env).some((directory) => containsFont(directory, 0))
}

export const nerdFontIcons = {
  title: "\u{f0379}",
  clock: "\u{f017}",
  calendar: "\u{f073}",
  cpu: "\u{f0ee0}",
  ram: "\u{f061a}",
  gpu: "\u{f08ae}",
  vram: "\u{f035b}",
  thermometer: "\u{f2c7}",
  network: "\u{f06f3}",
  git: "\u{f1d3}",
  goRolling: "\u{f017}",
  goWeekly: "\u{f073}",
  goMonthly: "\u{f073}",
  codexSession: "\u{f017}",
  codexWeekly: "\u{f073}",
  creditBalance: "\u{f09d}",
  quotaResetCredits: "\u{f021}",
  additionalLimit: "\u{f0ae}",
  disclosureExpanded: "▼",
  disclosureCollapsed: "▶",
} as const

export const unicodeIcons = {
  title: "▦", clock: "◷", calendar: "▦", cpu: "▣", ram: "▤", gpu: "◆", vram: "◈", thermometer: "♨", network: "⇅", git: "±",
  goRolling: "◷", goWeekly: "▦", goMonthly: "▣",
  codexSession: "◷", codexWeekly: "▦", creditBalance: "¤", quotaResetCredits: "↻", additionalLimit: "◇",
  disclosureExpanded: "▼", disclosureCollapsed: "▶",
} as const

export function getMetricIcons(useNerdFont: boolean) {
  return useNerdFont ? nerdFontIcons : unicodeIcons
}

export function shouldUseNerdFont(
  platform: SupportedPlatform,
  detected: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (platform === "win32") return env.OPENCODE_MONITOR_NERD_FONT === "1"
  return detected
}
