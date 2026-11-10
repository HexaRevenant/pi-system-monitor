import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui"
import type { CodexQuota } from "../core/codex-quota.js"
import { getCodexQuotaLabels } from "../core/codex-quota-copy.js"
import type { GitStatus } from "../core/git-status.js"
import { formatGitFileLine, formatGitOverflowLine, formatGitStatusLine, getGitStatusLabels } from "../core/git-status-copy.js"
import { formatGiB, formatPercent, formatRate, formatTemperature } from "../core/format.js"
import { unicodeIcons } from "../core/font.js"
import { currentLocale, formatLocaleDate } from "../core/locale.js"
import type { SystemMetrics } from "../core/metrics.js"
import { visibleChanges } from "../core/git-status.js"
import type { OpenCodeGoUsage } from "../core/opencode-go-usage.js"
import { getOpenCodeGoLabels } from "../core/opencode-go-usage-copy.js"
import { getPanelLabels } from "./labels.js"

export type UsageSnapshot =
  | { kind: "codex"; quota: CodexQuota }
  | { kind: "opencode-go"; usage: OpenCodeGoUsage }

export type PanelSnapshot = {
  now: Date
  metrics: SystemMetrics
  git?: GitStatus
  usage?: UsageSnapshot
}

export type PanelTheme = {
  fg(role: string, text: string): string
  bold(text: string): string
}

export type PanelStyle = "neon" | "float"

/**
 * `self` draws the frame described by the style; `host` returns frameless rows
 * and lets the rail paint the card, which is what a transparent-chrome sidebar
 * does for every section it shows.
 */
export type PanelChrome = "self" | "host"

/**
 * `comfortable` is one metric per row with totals; `compact` pairs two per row
 * with gauges; `dense` pairs two per row without gauges and keeps the totals;
 * `summary` keeps every section on one line; `minimal` drops the fold glyphs,
 * the section labels of the lower blocks and every separator. The density
 * control cycles them.
 */
export type PanelDensity = "comfortable" | "compact" | "dense" | "summary" | "minimal"

export const PANEL_DENSITIES: readonly PanelDensity[] = ["comfortable", "compact", "dense", "summary", "minimal"]

/** The next density the control switches to. */
export function nextDensity(density: PanelDensity): PanelDensity {
  const index = PANEL_DENSITIES.indexOf(density)
  return PANEL_DENSITIES[(index + 1) % PANEL_DENSITIES.length] ?? "comfortable"
}

export type PanelIcons = {
  title: string
  cpu: string
  ram: string
  gpu: string
  vram: string
  network: string
  git: string
}

export type PanelSection = "metrics" | "git" | "usage"

export type PanelHeader = { section: PanelSection; row: number }

/** Column range of the density control, on the metrics header row. */
export type PanelToggle = { row: number; column: number }

export type PanelLayout = { lines: string[]; headers: PanelHeader[]; toggle?: PanelToggle }

export type HeaderAction = "toggle-view" | "toggle-section" | "none"

export type PanelOptions = {
  locale?: string
  style?: PanelStyle
  density?: PanelDensity
  maxChanges?: number
  gauges?: boolean
  icons?: PanelIcons
  collapsed?: ReadonlySet<PanelSection>
  chrome?: PanelChrome
}

const BRAND = "✿"
const HEADING_ROLE = "accent"
const GAUGE_CELLS = 6
const METRIC_LABEL_WIDTH = 7
const DEFAULT_MAX_CHANGES = 3
/** Marks the density control: a turning arrow next to the Sistemas heading. */
const TOGGLE_GLYPH = "↻"
const COMPACT_GAP = 2
const COMPACT_GAUGE_CELLS = 5

const defaultIcons: PanelIcons = {
  title: unicodeIcons.title,
  cpu: unicodeIcons.cpu,
  ram: unicodeIcons.ram,
  gpu: unicodeIcons.gpu,
  vram: unicodeIcons.vram,
  network: unicodeIcons.network,
  git: unicodeIcons.git,
}

function paintGauge(percent: number | null, theme: PanelTheme, cells = GAUGE_CELLS): string {
  const clamped = Math.max(0, Math.min(100, percent ?? 0))
  const filled = percent === null ? 0 : Math.round((clamped / 100) * cells)
  const role = percent === null ? "dim" : clamped >= 95 ? "error" : clamped >= 80 ? "warning" : "accent"
  return theme.fg(role, "▰".repeat(filled)) + theme.fg("border", "▱".repeat(cells - filled))
}

function row(icon: string, label: string, parts: string[], theme: PanelTheme, gauges: boolean, percent: number | null = null): string {
  const head = `${icon} ${label}`.padEnd(METRIC_LABEL_WIDTH)
  const gauge = gauges ? `${paintGauge(percent, theme)}  ` : ""
  return `${theme.fg("muted", head)}${gauge}${parts.join("  ")}`
}

function clockLine(now: Date, locale: string): string {
  const pad = (value: number) => value.toString().padStart(2, "0")
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  // Date first, clock last: the line is read as a date, and the time is the
  // detail that changes every second.
  return `${formatLocaleDate(now, locale)} · ${time}`
}

/**
 * Calendar date in the system's own field order (es-ES `10/11/2026`,
 * en-US `11/10/2026`, sv-SE `2026-11-10`) next to a fixed 24-hour clock.
 * The order comes from `Intl`, never from a hardcoded pattern.
 */
function metaStamp(now: Date, locale: string): string {
  const pad = (value: number) => value.toString().padStart(2, "0")
  const date = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(now)
  // One space, not a middle dot: the header is tight and the two halves read
  // as one stamp.
  return `${date} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function temperature(celsius: number | null | undefined): string | undefined {
  return celsius === null || celsius === undefined ? undefined : formatTemperature(celsius)
}

function metricLines(metrics: SystemMetrics, labels: ReturnType<typeof getPanelLabels>, theme: PanelTheme, gauges: boolean, icons: PanelIcons): string[] {
  const lines = [
    row(icons.cpu, labels.cpu, [formatPercent(metrics.cpuPercent), formatTemperature(metrics.cpuTemperatureCelsius)], theme, gauges, metrics.cpuPercent),
    row(icons.ram, labels.ram, [`${formatGiB(metrics.memoryUsedBytes)} / ${formatGiB(metrics.memoryTotalBytes)}`, formatPercent(metrics.memoryPercent)], theme, gauges, metrics.memoryPercent),
    row(icons.gpu, labels.gpu, [formatPercent(metrics.gpuPercent), formatTemperature(metrics.gpuTemperatureCelsius)], theme, gauges, metrics.gpuPercent),
    row(icons.vram, labels.vram, [`${formatGiB(metrics.gpuMemoryUsedBytes)} / ${formatGiB(metrics.gpuMemoryTotalBytes)}`, formatPercent(metrics.gpuMemoryPercent)], theme, gauges, metrics.gpuMemoryPercent),
  ]
  const download = formatRate(metrics.downloadBytesPerSecond)
  const upload = formatRate(metrics.uploadBytesPerSecond)
  lines.push(row(icons.network, labels.network, [`↓ ${download}`, `↑ ${upload}`], theme, false))
  return lines
}

/**
 * Two metrics per row: CPU next to RAM, GPU next to VRAM. Each cell is half the
 * content width, so the gauges stay in two clean columns; a narrow rail
 * truncates the optional detail (temperature) before the value.
 */
function compactMetricLines(metrics: SystemMetrics, labels: ReturnType<typeof getPanelLabels>, theme: PanelTheme, gauges: boolean, icons: PanelIcons, inner: number): string[] {
  const cellWidth = Math.max(8, Math.floor((inner - COMPACT_GAP) / 2))
  const gap = " ".repeat(COMPACT_GAP)
  const cell = (icon: string, label: string, percent: number | null, detail: string | undefined): string => {
    const head = theme.fg("muted", `${icon} ${label}`)
    const gauge = gauges ? ` ${paintGauge(percent, theme, COMPACT_GAUGE_CELLS)}` : ""
    const value = ` ${theme.fg("text", formatPercent(percent))}`
    const tail = detail === undefined ? "" : ` ${theme.fg("text", detail)}`
    return pad(`${head}${gauge}${value}${tail}`, cellWidth)
  }
  const download = formatRate(metrics.downloadBytesPerSecond)
  const upload = formatRate(metrics.uploadBytesPerSecond)
  return [
    `${cell(icons.cpu, labels.cpu, metrics.cpuPercent, temperature(metrics.cpuTemperatureCelsius))}${gap}${cell(icons.ram, labels.ram, metrics.memoryPercent, undefined)}`,
    `${cell(icons.gpu, labels.gpu, metrics.gpuPercent, temperature(metrics.gpuTemperatureCelsius))}${gap}${cell(icons.vram, labels.vram, metrics.gpuMemoryPercent, undefined)}`,
    row(icons.network, labels.network, [`↓ ${download}`, `↑ ${upload}`], theme, false),
  ]
}

/**
 * Two metrics per row without gauges, keeping the byte totals: the packing of
 * `compact` with the precision of `comfortable`. A pair that does not fit the
 * rail is split into two rows instead of being truncated.
 */
function denseMetricLines(metrics: SystemMetrics, labels: ReturnType<typeof getPanelLabels>, theme: PanelTheme, icons: PanelIcons, inner: number): string[] {
  const cell = (icon: string, label: string, parts: string[]): string => row(icon, label, parts, theme, false)
  const pair = (left: string, right: string): string[] =>
    visibleWidth(`${left}  ${right}`) <= inner ? [`${left}  ${right}`] : [left, right]
  const download = formatRate(metrics.downloadBytesPerSecond)
  const upload = formatRate(metrics.uploadBytesPerSecond)
  return [
    ...pair(
      cell(icons.cpu, labels.cpu, [formatPercent(metrics.cpuPercent), formatTemperature(metrics.cpuTemperatureCelsius)]),
      cell(icons.gpu, labels.gpu, [formatPercent(metrics.gpuPercent), formatTemperature(metrics.gpuTemperatureCelsius)]),
    ),
    ...pair(
      cell(icons.ram, labels.ram, [`${formatGiB(metrics.memoryUsedBytes)}/${formatGiB(metrics.memoryTotalBytes)}`, formatPercent(metrics.memoryPercent)]),
      cell(icons.vram, labels.vram, [`${formatGiB(metrics.gpuMemoryUsedBytes)}/${formatGiB(metrics.gpuMemoryTotalBytes)}`, formatPercent(metrics.gpuMemoryPercent)]),
    ),
    row(icons.network, labels.network, [`↓ ${download}`, `↑ ${upload}`], theme, false),
  ]
}

function allMetricsSummary(metrics: SystemMetrics, labels: ReturnType<typeof getPanelLabels>, separator = " · "): string {
  return [
    `${labels.cpu} ${formatPercent(metrics.cpuPercent)}`,
    `${labels.ram} ${formatPercent(metrics.memoryPercent)}`,
    `${labels.gpu} ${formatPercent(metrics.gpuPercent)}`,
    `${labels.vram} ${formatPercent(metrics.gpuMemoryPercent)}`,
  ].join(separator)
}

function metricSummary(metrics: SystemMetrics, labels: ReturnType<typeof getPanelLabels>): string {
  return [
    `${labels.cpu} ${formatPercent(metrics.cpuPercent)}`,
    `${labels.ram} ${formatPercent(metrics.memoryPercent)}`,
    `${labels.gpu} ${formatPercent(metrics.gpuPercent)}`,
  ].join(" · ")
}

function gitSummary(git: GitStatus, locale: string): string {
  return formatGitStatusLine(git, getGitStatusLabels(locale))
}

function gitDetailLines(git: GitStatus, locale: string, theme: PanelTheme, maxChanges: number): string[] {
  const copy = getGitStatusLabels(locale)
  const { visible, hidden } = visibleChanges(git.changes, maxChanges)
  return [
    ...visible.map((change) => theme.fg("dim", `  ${formatGitFileLine(change)}`)),
    ...(hidden > 0 ? [theme.fg("dim", `  ${formatGitOverflowLine(hidden, copy)}`)] : []),
  ]
}

type UsageSection = { heading: string; summary: string; inline: string; lines: string[] }

function usageSection(usage: UsageSnapshot | undefined, locale: string, theme: PanelTheme): UsageSection | undefined {
  if (usage === undefined) return undefined

  if (usage.kind === "codex") {
    const copy = getCodexQuotaLabels(locale)
    const windows: string[] = []
    const summary: string[] = []
    const inline: string[] = []
    const primary = usage.quota.primary
    const secondary = usage.quota.secondary
    if (primary !== undefined) {
      windows.push(`${copy.session} ${primary.usedPercent}% ${copy.used}`)
      summary.push(`${primary.usedPercent}%`)
      inline.push(`${copy.shortSession} ${primary.usedPercent}%`)
    }
    if (secondary !== undefined) {
      windows.push(`${copy.weekly} ${secondary.usedPercent}% ${copy.used}`)
      summary.push(`${secondary.usedPercent}%`)
      inline.push(`${copy.shortWeekly} ${secondary.usedPercent}%`)
    }
    if (windows.length === 0) {
      windows.push(copy.unavailable)
      summary.push(copy.unavailable)
      inline.push(copy.unavailable)
    }
    const credits = usage.quota.credits?.balance
    return {
      heading: copy.heading,
      summary: summary.join(" · "),
      inline: inline.join(" · "),
      lines: [
        ...windows.map((line) => theme.fg("text", `  ${line}`)),
        ...(credits === undefined ? [] : [theme.fg("text", `  ${copy.creditBalance}: ${credits}`)]),
      ],
    }
  }

  const copy = getOpenCodeGoLabels(locale)
  const rows: string[] = []
  const summary: string[] = []
  const inline: string[] = []
  for (const [label, short, window] of [
    [copy.rolling, copy.short.rolling, usage.usage.rolling],
    [copy.weekly, copy.short.weekly, usage.usage.weekly],
    [copy.monthly, copy.short.monthly, usage.usage.monthly],
  ] as const) {
    if (window === undefined) {
      rows.push(`${label} ${copy.unavailable}`)
      summary.push(copy.unavailable)
      inline.push(`${short} ${copy.unavailable}`)
      continue
    }
    const remaining = window.remainingPercent === undefined ? copy.unavailable : `${window.remainingPercent}%`
    summary.push(remaining)
    inline.push(`${short} ${remaining}`)
    const status = window.status === undefined ? "" : ` · ${copy.status}: ${window.status}`
    if (window.status !== undefined && window.status !== "ok") inline.push(`${copy.status}: ${window.status}`)
    rows.push(`${label} ${remaining} ${copy.remaining}${status}`)
  }
  return { heading: copy.heading, summary: summary.join(" · "), inline: inline.join(" · "), lines: rows.map((line) => theme.fg("text", `  ${line}`)) }
}

function sectionHeading(icon: string, heading: string, collapsed: boolean, collapsedSummary: string | undefined, theme: PanelTheme, suffix?: string, bare = false): string {
  const glyph = bare ? "" : collapsed ? "▶ " : "▼ "
  const tail = suffix === undefined ? "" : ` ${suffix}`
  const head = theme.fg(HEADING_ROLE, theme.bold(`${glyph}${icon} ${heading}${tail}`))
  return collapsedSummary === undefined ? head : `${head}  ${theme.fg("muted", collapsedSummary)}`
}

function pad(content: string, inner: number): string {
  const clipped = truncateToWidth(content, inner, "")
  return clipped + " ".repeat(Math.max(0, inner - visibleWidth(clipped)))
}

function frameTitle(title: string, meta: string | undefined): string {
  return meta === undefined ? `${BRAND} ${title}` : `${BRAND} ${title} · ${meta}`
}

function neonCard(title: string, body: string[], theme: PanelTheme, width: number, meta?: string): string[] {
  const inner = width - 4
  const titleText = truncateToWidth(frameTitle(title, meta), Math.max(0, inner - 3), "")
  const rule = "─".repeat(Math.max(0, width - 5 - visibleWidth(titleText)))
  return [
    theme.fg("border", "╭─ ") + theme.fg(HEADING_ROLE, theme.bold(titleText)) + theme.fg("border", ` ${rule}╮`),
    ...body.map((line) => theme.fg("border", "│ ") + pad(line, inner) + theme.fg("border", " │")),
    theme.fg("border", `╰${"─".repeat(Math.max(0, width - 2))}╯`),
  ]
}

/**
 * The float style draws a self-contained box with square corners. A left bar
 * with an indent reads as one more nesting level under the host's sections, so
 * the card owns its own frame instead and its rows stay aligned with it.
 */
function floatCard(title: string, body: string[], theme: PanelTheme, width: number, meta?: string): string[] {
  const inner = width - 4
  const titleText = truncateToWidth(frameTitle(title, meta), Math.max(0, inner - 3), "")
  const rule = "─".repeat(Math.max(0, width - 5 - visibleWidth(titleText)))
  return [
    theme.fg("border", "┌─ ") + theme.fg(HEADING_ROLE, theme.bold(titleText)) + theme.fg("border", ` ${rule}┐`),
    ...body.map((line) => theme.fg("border", "│ ") + pad(line, inner) + theme.fg("border", " │")),
    theme.fg("border", `└${"─".repeat(Math.max(0, width - 2))}┘`),
  ]
}

/**
 * Frameless rows: the host paints the card and folds the first row into its
 * header. The host splits a header on two or more spaces, so the meta text (the
 * clock in compact density) lands in its right-hand count slot.
 */
function hostCard(title: string, body: string[], theme: PanelTheme, width: number, meta?: string): string[] {
  const head = title
  const text = meta === undefined
    ? head
    : `${head}${" ".repeat(Math.max(COMPACT_GAP, width - visibleWidth(head) - visibleWidth(meta)))}${meta}`
  return [
    theme.fg(HEADING_ROLE, theme.bold(truncateToWidth(text, width, ""))),
    ...body.map((line) => truncateToWidth(line, width, "")),
  ]
}

/** Which control a click on a rendered row hits. */
export function headerAction(layout: PanelLayout, row: number, column?: number): HeaderAction {
  const header = layout.headers.find((candidate) => candidate.row === row)
  if (header === undefined) return "none"
  const toggle = layout.toggle
  if (
    toggle !== undefined &&
    header.section === "metrics" &&
    header.row === toggle.row &&
    column !== undefined &&
    // The glyph is one cell wide; the slack keeps a near miss from folding the
    // section instead of switching the view.
    column >= toggle.column &&
    column <= toggle.column + 3
  ) {
    return "toggle-view"
  }
  return "toggle-section"
}

/** Pure renderer: the card lines plus the clickable section header rows. */
export function renderPanelLayout(snapshot: PanelSnapshot, theme: PanelTheme, width: number, options: PanelOptions = {}): PanelLayout {
  const style = options.style ?? "neon"
  const chrome = options.chrome ?? "self"
  const inner = width - 4
  if (inner < 12) return { lines: [], headers: [] }
  /** Room a body row really has: a host card paints the full part width. */
  const budget = chrome === "host" ? width : inner

  const locale = options.locale ?? currentLocale()
  const labels = getPanelLabels(locale)
  const gauges = options.gauges ?? true
  const icons = options.icons ?? defaultIcons
  const density = options.density ?? "comfortable"
  const compact = density === "compact"
  const dense = density === "dense"
  const resume = density === "summary"
  const minimal = density === "minimal"
  /** Densities that keep each section's data on its heading row. */
  const folded = compact || dense || resume || minimal
  const maxChanges = Math.max(0, options.maxChanges ?? DEFAULT_MAX_CHANGES)
  const collapsed = options.collapsed ?? new Set<PanelSection>()

  const body: string[] = []
  const headers: PanelHeader[] = []
  let toggle: PanelToggle | undefined

  /** A folded section keeps its data on the heading only while the line fits. */
  const fitsInline = (icon: string, heading: string, summary: string, suffix?: string): boolean =>
    visibleWidth(`${minimal ? "" : "▼ "}${icon} ${heading}${suffix === undefined ? "" : ` ${suffix}`}  ${summary}`) <= budget
  /** The minimal density carries no separators at all. */
  const tight = (text: string): string => text.replace(/ · /g, " ")

  const pushHeader = (
    section: PanelSection,
    icon: string,
    heading: string,
    summary: string,
    headerOptions: { inline?: boolean; suffix?: string; bare?: boolean } = {},
  ): boolean => {
    const isCollapsed = collapsed.has(section)
    const showSummary = isCollapsed || headerOptions.inline === true
    // One frame/title line precedes the body in every card style.
    headers.push({ section, row: body.length + 1 })
    body.push(sectionHeading(icon, heading, isCollapsed, showSummary ? summary : undefined, theme, headerOptions.suffix, headerOptions.bare))
    return isCollapsed
  }

  // The header stamp is never shortened: no dropped year, no dropped seconds.
  // The host paints a header's right-hand text only when `title + 5 + stamp + 2`
  // fits, so when it does not, the stamp takes the first body row at full width.
  const stamp = folded ? metaStamp(snapshot.now, locale) : undefined
  const stampFits = stamp !== undefined && visibleWidth(stamp) <= budget - visibleWidth(labels.title) - 7
  const meta = stampFits ? stamp : undefined
  if (stamp !== undefined && !stampFits) body.push(" ".repeat(Math.max(0, inner - visibleWidth(stamp))) + stamp)

  if (!folded) body.push(theme.fg("text", clockLine(snapshot.now, locale)))

  const metricsSummary = resume || minimal
    ? allMetricsSummary(snapshot.metrics, labels, minimal ? " " : " · ")
    : metricSummary(snapshot.metrics, labels)
  const metricsInline = (resume || minimal) && fitsInline(icons.title, labels.system, metricsSummary, TOGGLE_GLYPH)
  const metricsCollapsed = pushHeader("metrics", icons.title, labels.system, metricsSummary, {
    ...(metricsInline ? { inline: true } : {}),
    suffix: TOGGLE_GLYPH,
    bare: minimal,
  })
  const togglePrefix = visibleWidth(`${minimal ? "" : "▼ "}${icons.title} ${labels.system}`)
  toggle = { row: headers[headers.length - 1]?.row ?? 1, column: togglePrefix + 1 }
  if (!metricsCollapsed) {
    if (compact) body.push(...compactMetricLines(snapshot.metrics, labels, theme, gauges, icons, inner))
    else if (dense) body.push(...denseMetricLines(snapshot.metrics, labels, theme, icons, inner))
    else if ((resume || minimal) && !metricsInline) body.push(theme.fg("text", `  ${metricsSummary}`))
    else if (!resume && !minimal) body.push(...metricLines(snapshot.metrics, labels, theme, gauges, icons))
  }

  const usage = usageSection(snapshot.usage, locale, theme)
  if (usage !== undefined && minimal) {
    // The provider name stays: without it the numbers lose their owner. If the
    // line does not fit, the name is what goes, never a percentage.
    const named = `◷ ${usage.heading}  ${tight(usage.inline)}`
    body.push(theme.fg("text", visibleWidth(named) <= budget ? named : `◷ ${tight(usage.inline)}`))
  } else if (usage !== undefined) {
    const summary = folded ? usage.inline : usage.summary
    const inline = folded && fitsInline("◷", usage.heading, summary)
    const collapsedUsage = pushHeader("usage", "◷", usage.heading, summary, inline ? { inline: true } : {})
    if (!collapsedUsage && !folded) body.push(...usage.lines)
    else if (!collapsedUsage && folded && !inline) body.push(theme.fg("text", `  ${summary}`))
  }

  // Git closes the card: it is the section read last and the one that grows with
  // the working tree, so it sits at the bottom in every density.
  if (snapshot.git !== undefined && minimal) {
    body.push(theme.fg("muted", `${icons.git} ${tight(gitSummary(snapshot.git, locale))}`))
  } else if (snapshot.git !== undefined) {
    const summary = gitSummary(snapshot.git, locale)
    if (!pushHeader("git", icons.git, getGitStatusLabels(locale).heading, summary)) {
      body.push(theme.fg("muted", `  ${summary}`))
      body.push(...gitDetailLines(snapshot.git, locale, theme, maxChanges))
    }
  }

  const lines = chrome === "host"
    ? hostCard(labels.title, body, theme, width, meta)
    : style === "float" ? floatCard(labels.title, body, theme, width, meta) : neonCard(labels.title, body, theme, width, meta)
  return toggle === undefined ? { lines, headers } : { lines, headers, toggle }
}

/** Pure renderer: a snapshot in, card lines out. Every line is exactly `width` columns. */
export function renderPanel(snapshot: PanelSnapshot, theme: PanelTheme, width: number, options: PanelOptions = {}): string[] {
  return renderPanelLayout(snapshot, theme, width, options).lines
}
