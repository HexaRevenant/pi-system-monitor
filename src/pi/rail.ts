/**
 * Gentle Shell paints the fullscreen rail in a fixed section order
 * (`todo`, `jobs`, `agents`, `footer`) and a third-party extension cannot
 * register a new section. The supported way to place a card above the live
 * work is to wrap the existing `agents` rail part: the wrapper prepends its
 * card and keeps everything the host part paints.
 *
 * Two host contracts matter here. `cardGroups()` tells a transparent rail how
 * to slice a part into one card per section, so the wrapper shifts the groups
 * of the part it wraps and declares its own group; without it the host falls
 * back to a single group and paints our card inside the wrapped card. Every
 * other host member (`summary`, `open`, `alert`, `spend`, `surface`) is
 * forwarded unchanged, so wrapping never drops a feature of that section.
 *
 * The state lives on `tui.terminal` under a process-wide symbol, so this module
 * never imports Gentle Shell internals. Every access is defensive: a missing
 * state, a throwing host render, or a throwing card degrades to the original
 * rail instead of breaking the host render loop.
 */

import type { PanelChrome } from "../panel/render.js"

export const SIDEBAR_STATE = Symbol.for("gentle-pi.experimental-sidebar.state")
const WRAPPER_MARK = Symbol.for("pi-system-monitor.rail-wrapper")

/**
 * Rail slots the shell paints, in paint order. The card takes the first slot
 * that exists, so it lands above every later section.
 */
export const RAIL_CARD_TARGETS = ["agents", "footer"] as const

export type SidebarRail = {
  render(width: number): string[]
  digest?(): string
  invalidate?(): void
  handleMouse?(event: unknown): unknown
  cardGroups?(width: number): { groups: Array<{ start: number; end: number }>; loose?: number[] } | undefined
  [key: string]: unknown
  [key: symbol]: unknown
}

/** How the card should paint itself for one frame. */
export type CardRenderContext = { chrome: PanelChrome }

export type CardSource = {
  /**
   * `chrome` is the host's answer, not a guess: a transparent rail calls
   * `cardGroups()` and paints the card, so the card stays frameless there.
   */
  render(width: number, context?: CardRenderContext): string[]
  digest?(): string
  invalidate?(): void
  /** Handles a click on one card line (0-based, card coordinates). */
  handleRow?(row: number, column?: number): boolean
}

type SidebarState = { parts?: Map<string, SidebarRail> }
type RailHost = { terminal?: Record<symbol, unknown>; requestRender?(): void }
type RailLayout = { width: number; cardLines: number; offset: number; baseLines: number }

function safeRender(rail: { render(width: number, context?: CardRenderContext): string[] } | undefined, width: number, context?: CardRenderContext): string[] {
  if (rail === undefined) return []
  try {
    const lines = rail.render(width, context)
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

function partsOf(host: unknown): Map<string, SidebarRail> | undefined {
  const terminal = (host as RailHost | undefined)?.terminal
  if (terminal === undefined || terminal === null) return undefined
  const state = terminal[SIDEBAR_STATE] as SidebarState | undefined
  return state?.parts instanceof Map ? state.parts : undefined
}

function occupied(parts: Map<string, SidebarRail>): string | undefined {
  return RAIL_CARD_TARGETS.find((key) => parts.get(key)?.[WRAPPER_MARK] === true)
}

/** Reports whether this extension's wrapper currently owns a rail slot. */
export function hasRailCard(host: unknown): boolean {
  const parts = partsOf(host)
  return parts === undefined ? false : occupied(parts) !== undefined
}

/**
 * Prepends the card to the first existing rail slot and returns an idempotent
 * disposer. Callers retry installation until a slot exists; a missing rail is a
 * no-op, never an error.
 */
export function installRailCard(host: unknown, card: () => CardSource): () => void {
  const railHost = host as RailHost
  const parts = partsOf(railHost)
  if (parts === undefined) return () => {}

  if (occupied(parts) !== undefined) return () => {}
  const key = RAIL_CARD_TARGETS.find((candidate) => parts.get(candidate) !== undefined)
  if (key === undefined) return () => {}

  const original = parts.get(key)
  if (original === undefined || original[WRAPPER_MARK] === true) return () => {}

  const currentCard = () => {
    try {
      return card()
    } catch {
      return undefined
    }
  }

  let last: RailLayout | undefined

  /**
   * Only a transparent-chrome rail asks for card groups, so a render that
   * follows a frame without that call proves the host is not painting our
   * card and the card has to draw its own frame.
   */
  let hostPaints = true
  const rendered = new Map<number, number>()
  const grouped = new Map<number, number>()
  const chrome = (): PanelChrome => (hostPaints ? "host" : "self")

  const wrapper: SidebarRail = {
    ...original,
    [WRAPPER_MARK]: true,
    render(width: number): string[] {
      if ((rendered.get(width) ?? 0) > 0 && (grouped.get(width) ?? 0) === 0) hostPaints = false
      rendered.set(width, (rendered.get(width) ?? 0) + 1)
      const base = safeRender(original, width)
      const lines = safeRender(currentCard(), width, { chrome: chrome() })
      if (lines.length === 0) {
        last = { width, cardLines: 0, offset: 0, baseLines: base.length }
        return base
      }
      const hasBase = base.some((line) => line.trim() !== "")
      const offset = hasBase ? lines.length + 1 : lines.length
      last = { width, cardLines: lines.length, offset, baseLines: base.length }
      return hasBase ? [...lines, "", ...base] : lines
    },
    digest(): string {
      return `${safeDigest(original)}|${safeDigest(currentCard())}|${chrome()}`
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
    cardGroups(width: number) {
      grouped.set(width, (grouped.get(width) ?? 0) + 1)
      hostPaints = true
      const layout = last?.width === width ? last : undefined
      const cardLines = layout?.cardLines ?? safeRender(currentCard(), width, { chrome: "host" }).length
      if (cardLines === 0) {
        return original.cardGroups === undefined ? undefined : original.cardGroups(width)
      }
      const baseLines = layout?.baseLines ?? safeRender(original, width).length
      const hasBase = baseLines > 0
      const offset = hasBase ? cardLines + 1 : cardLines
      const groups = [{ start: 0, end: cardLines }]
      if (hasBase) {
        const wrapped = original.cardGroups === undefined ? undefined : original.cardGroups(width)
        const shifted = wrapped === undefined ? [{ start: 0, end: baseLines }] : wrapped.groups
        groups.push(...shifted.map((group) => ({ start: group.start + offset, end: group.end + offset })))
      }
      const wrappedLoose = original.cardGroups === undefined ? undefined : original.cardGroups(width)?.loose
      const loose = wrappedLoose?.map((row) => row + offset)
      return loose === undefined || loose.length === 0 ? { groups } : { groups, loose }
    },
    handleMouse(event: unknown): unknown {
      const click = event as { type?: string; button?: string; x?: number; y?: number } | undefined
      if (click?.type === "click" && click.button === "left" && typeof click.y === "number" && last !== undefined && last.cardLines > 0) {
        if (click.y < last.cardLines) {
          // Inside our card: the card owns those rows, the wrapped part does not.
          return currentCard()?.handleRow?.(click.y, click.x) === true ? { handled: true, render: true } : undefined
        }
        return original.handleMouse?.({ ...(event as Record<string, unknown>), y: click.y - last.offset })
      }
      return original.handleMouse?.(event)
    },
  }

  parts.set(key, wrapper)
  requestRender(railHost)

  return () => {
    if (parts.get(key) === wrapper) {
      // Restore the part we wrapped: deleting the slot would take the host
      // section (Agents) down with our card.
      parts.set(key, original)
      requestRender(railHost)
    }
  }
}
