/**
 * Gentle Shell renders only the rail sections it knows: `footer` (the Status
 * card), `jobs`, `agents`, and `todo`. A third-party extension cannot register
 * a new section, so the supported way to place a card below Status is to wrap
 * the existing `footer` rail without replacing what it paints.
 *
 * The state lives on `tui.terminal` under a process-wide symbol, so this module
 * never imports Gentle Shell internals. Every access is defensive: a missing
 * state, a throwing Status render, or a throwing card degrades to the original
 * rail instead of breaking the host render loop.
 */

export const SIDEBAR_STATE = Symbol.for("gentle-pi.experimental-sidebar.state")
const WRAPPER_MARK = Symbol.for("pi-system-monitor.rail-wrapper")

export type SidebarRail = {
  render(width: number): string[]
  digest?(): string
  invalidate?(): void
  handleMouse?(event: unknown): unknown
  [key: symbol]: unknown
}

export type CardSource = {
  render(width: number): string[]
  digest?(): string
  invalidate?(): void
}

type SidebarState = { parts?: Map<string, SidebarRail> }
type RailHost = { terminal?: Record<symbol, unknown>; requestRender?(): void }

function safeRender(rail: { render(width: number): string[] } | undefined, width: number): string[] {
  if (rail === undefined) return []
  try {
    const lines = rail.render(width)
    return Array.isArray(lines) ? lines : []
  } catch {
    return []
  }
}

function safeDigest(rail: { digest?(): string } | undefined): string {
  if (rail?.digest === undefined) return ""
  try {
    return rail.digest()
  } catch {
    return ""
  }
}

function requestRender(host: RailHost): void {
  try {
    host.requestRender?.()
  } catch {
    /* Render requests are best effort. */
  }
}

/** Reports whether this extension's wrapper currently owns the Status rail part. */
export function hasBelowStatusRail(host: unknown): boolean {
  const terminal = (host as RailHost).terminal
  if (terminal === undefined || terminal === null) return false
  const state = terminal[SIDEBAR_STATE] as SidebarState | undefined
  return state?.parts?.get("footer")?.[WRAPPER_MARK] === true
}

/**
 * Appends the card to the Status rail part and returns an idempotent disposer.
 * Callers retry installation until the Status part exists; a missing rail is a
 * no-op, never an error.
 */
export function installBelowStatusRail(host: unknown, card: () => CardSource): () => void {
  const railHost = host as RailHost
  const terminal = railHost.terminal
  if (terminal === undefined || terminal === null) return () => {}

  const state = terminal[SIDEBAR_STATE] as SidebarState | undefined
  const parts = state?.parts
  if (!(parts instanceof Map)) return () => {}

  const original = parts.get("footer")
  if (original === undefined) return () => {}
  if (original[WRAPPER_MARK] === true) return () => {}

  const currentCard = () => {
    try {
      return card()
    } catch {
      return undefined
    }
  }

  const wrapper: SidebarRail = {
    [WRAPPER_MARK]: true,
    render(width: number): string[] {
      const base = safeRender(original, width)
      const lines = safeRender(currentCard(), width)
      if (lines.length === 0) return base
      return base.some((line) => line.trim() !== "") ? [...base, "", ...lines] : lines
    },
    digest(): string {
      return `${safeDigest(original)}|${safeDigest(currentCard())}`
    },
    invalidate(): void {
      try {
        original.invalidate?.()
      } catch {
        /* Invalidation is best effort. */
      }
      try {
        currentCard()?.invalidate?.()
      } catch {
        /* Invalidation is best effort. */
      }
    },
    handleMouse(event: unknown): unknown {
      return original.handleMouse?.(event)
    },
  }

  parts.set("footer", wrapper)
  requestRender(railHost)

  return () => {
    if (parts.get("footer") === wrapper) {
      parts.delete("footer")
      requestRender(railHost)
    }
  }
}
