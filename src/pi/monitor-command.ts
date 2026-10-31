import type { PanelSection } from "../panel/render.js"

export const MONITOR_SECTIONS = ["metrics", "git", "usage"] as const

export const MONITOR_USAGE =
  "Usage: /monitor [on|off|refresh|toggle <metrics|git|usage>|collapse <metrics|git|usage>|expand <metrics|git|usage>|collapse all|expand all]"

export type MonitorCommand =
  | { kind: "toggle-card" }
  | { kind: "set-visible"; visible: boolean }
  | { kind: "refresh" }
  | { kind: "toggle-section"; section: PanelSection }
  | { kind: "set-section"; section: PanelSection; collapsed: boolean }
  | { kind: "expand-all" }
  | { kind: "collapse-all" }
  | { kind: "usage" }

/**
 * Strict parser for `/monitor`. Extra or conflicting arguments are a usage
 * error, never silently ignored: `on off`, `refresh metrics`, and
 * `collapse all extra` all return `usage`.
 */
export function parseMonitorCommand(args: string): MonitorCommand {
  const tokens = args.trim().toLowerCase().split(/\s+/).filter((token) => token.length > 0)
  if (tokens.length === 0) return { kind: "toggle-card" }
  if (tokens.length > 2) return { kind: "usage" }

  const [action = "", rawSection] = tokens
  const section = MONITOR_SECTIONS.find((candidate) => candidate === rawSection)

  if (tokens.length === 1) {
    if (action === "on") return { kind: "set-visible", visible: true }
    if (action === "off") return { kind: "set-visible", visible: false }
    if (action === "refresh") return { kind: "refresh" }
    return { kind: "usage" }
  }

  if (action === "expand" && rawSection === "all") return { kind: "expand-all" }
  if (action === "collapse" && rawSection === "all") return { kind: "collapse-all" }
  if (section === undefined) return { kind: "usage" }
  if (action === "toggle") return { kind: "toggle-section", section }
  if (action === "collapse") return { kind: "set-section", section, collapsed: true }
  if (action === "expand") return { kind: "set-section", section, collapsed: false }
  return { kind: "usage" }
}
