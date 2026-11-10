import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { getMetricIcons, hasNerdFont, shouldUseNerdFont } from "./core/font.js"
import type { Monitor } from "./pi/monitor.js"
import { createMonitor } from "./pi/monitor.js"
import { hasRailCard, installRailCard } from "./pi/rail.js"
import { MONITOR_USAGE, parseMonitorCommand } from "./pi/monitor-command.js"
import type { PanelStyle } from "./panel/render.js"

const WIDGET_KEY = "pi-system-monitor"
const STYLE_SLOT = Symbol.for("gentle-pi.card-style")
const RETRY_MS = 250
const RETRY_ATTEMPTS = 40

const platform = process.platform as "linux" | "darwin" | "win32"
const icons = getMetricIcons(shouldUseNerdFont(platform, platform === "win32" ? false : hasNerdFont()))

/** Gentle Shell publishes its active card style on this process-wide slot. */
function cardStyle(): PanelStyle {
  return (globalThis as Record<symbol, unknown>)[STYLE_SLOT] === "neon" ? "neon" : "float"
}

type ActiveSession = {
  monitor: Monitor
  cleanup: () => void
}

export default function piSystemMonitor(pi: ExtensionAPI): void {
  let active: ActiveSession | undefined

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return

    ctx.ui.setWidget(
      WIDGET_KEY,
      (tui, theme) => {
        const monitor = createMonitor({
          cwd: ctx.cwd,
          theme,
          icons,
          style: cardStyle,
          provider: () => ctx.model?.provider,
          requestRender: () => tui.requestRender(),
        })

        let disposeRail = () => {}
        let retry: ReturnType<typeof setInterval> | undefined
        let attempts = 0

        const stopRetry = () => {
          if (retry !== undefined) clearInterval(retry)
          retry = undefined
        }

        const ensure = () => {
          if (hasRailCard(tui)) {
            stopRetry()
            return
          }
          disposeRail()
          disposeRail = installRailCard(tui, monitor.card)
          if (hasRailCard(tui)) stopRetry()
        }

        const cleanup = () => {
          stopRetry()
          monitor.stop()
          disposeRail()
          disposeRail = () => {}
          if (active?.monitor === monitor) active = undefined
        }

        ensure()
        retry = setInterval(() => {
          attempts += 1
          ensure()
          if (attempts >= RETRY_ATTEMPTS) stopRetry()
        }, RETRY_MS)
        retry.unref?.()

        active = { monitor, cleanup }
        monitor.start()

        return {
          render: () => {
            ensure()
            return []
          },
          invalidate: () => {},
          dispose: cleanup,
        }
      },
      { placement: "belowEditor" },
    )
  })

  pi.on("session_shutdown", () => {
    active?.cleanup()
    active = undefined
  })

  pi.registerCommand("monitor", {
    description: "Toggle the card or its sections (on|off|refresh|toggle|collapse|expand <metrics|git|usage>)",
    handler: async (args, ctx) => {
      if (active === undefined) {
        ctx.ui.notify("System monitor is not active in this session", "warning")
        return
      }
      const command = parseMonitorCommand(args)
      switch (command.kind) {
        case "toggle-card": {
          const next = !active.monitor.isVisible()
          active.monitor.setVisible(next)
          ctx.ui.notify(`System monitor ${next ? "on" : "off"}`, "info")
          return
        }
        case "set-visible":
          active.monitor.setVisible(command.visible)
          ctx.ui.notify(`System monitor ${command.visible ? "on" : "off"}`, "info")
          return
        case "refresh":
          active.monitor.refresh()
          ctx.ui.notify("System monitor refreshed", "info")
          return
        case "toggle-section":
          active.monitor.toggleSection(command.section)
          ctx.ui.notify(`System monitor ${command.section} toggled`, "info")
          return
        case "set-section":
          active.monitor.setSection(command.section, command.collapsed)
          ctx.ui.notify(`System monitor ${command.section} ${command.collapsed ? "collapsed" : "expanded"}`, "info")
          return
        case "expand-all":
          active.monitor.expandAll()
          ctx.ui.notify("System monitor sections expanded", "info")
          return
        case "collapse-all":
          active.monitor.collapseAll()
          ctx.ui.notify("System monitor sections collapsed", "info")
          return
        case "usage":
          ctx.ui.notify(MONITOR_USAGE, "warning")
          return
      }
    },
  })
}
