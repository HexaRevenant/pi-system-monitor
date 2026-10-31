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

export type PanelLayout = { lines: string[]; headers: PanelHeader[] }

export type PanelOptions = {
  locale?: string
  style?: PanelStyle
  maxChanges?: number
  gauges?: boolean
  icons?: PanelIcons
  collapsed?: ReadonlySet<PanelSection>
}

const BRAND = "✿"
const HEADING_ROLE = "accent"
const GAUGE_CELLS = 6
const METRIC_LABEL_WIDTH = 7
const DEFAULT_MAX_CHANGES = 3

const defaultIcons: PanelIcons = {
  title: unicodeIcons.title,
  cpu: unicodeIcons.cpu,
  ram: unicodeIcons.ram,
  gpu: unicodeIcons.gpu,
  vram: unicodeIcons.vram,
  network: unicodeIcons.network,
  git: unicodeIcons.git,
}

function paintGauge(percent: number | null, theme: PanelTheme): string {
  const clamped = Math.max(0, Math.min(100, percent ?? 0))
  const filled = percent === null ? 0 : Math.round((clamped / 100) * GAUGE_CELLS)
  const role = percent === null ? "dim" : clamped >= 95 ? "error" : clamped >= 80 ? "warning" : "accent"
  return theme.fg(role, "▰".repeat(filled)) + theme.fg("border", "▱".repeat(GAUGE_CELLS - filled))
}

function row(icon: string, label: string, parts: string[], theme: PanelTheme, gauges: boolean, percent: number | null = null): string {
  const head = `${icon} ${label}`.padEnd(METRIC_LABEL_WIDTH)
  const gauge = gauges ? `${paintGauge(percent, theme)}  ` : ""
  return `${theme.fg("muted", head)}${gauge}${parts.join("  ")}`
}

function clockLine(now: Date, locale: string): string {
  const pad = (value: number) => value.toString().padStart(2, "0")
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return `${time} · ${formatLocaleDate(now, locale)}`
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

type UsageSection = { heading: string; summary: string; lines: string[] }

function usageSection(usage: UsageSnapshot | undefined, locale: string, theme: PanelTheme): UsageSection | undefined {
  if (usage === undefined) return undefined

  if (usage.kind === "codex") {
    const copy = getCodexQuotaLabels(locale)
    const windows: string[] = []
    const summary: string[] = []
    const primary = usage.quota.primary
    const secondary = usage.quota.secondary
    if (primary !== undefined) {
      windows.push(`${copy.session} ${primary.usedPercent}% ${copy.used}`)
      summary.push(`${primary.usedPercent}%`)
    }
    if (secondary !== undefined) {
      windows.push(`${copy.weekly} ${secondary.usedPercent}% ${copy.used}`)
      summary.push(`${secondary.usedPercent}%`)
    }
    if (windows.length === 0) {
      windows.push(copy.unavailable)
      summary.push(copy.unavailable)
    }
    const credits = usage.quota.credits?.balance
    return {
      heading: copy.heading,
      summary: summary.join(" · "),
      lines: [
        ...windows.map((line) => theme.fg("text", `  ${line}`)),
        ...(credits === undefined ? [] : [theme.fg("text", `  ${copy.creditBalance}: ${credits}`)]),
      ],
    }
  }

  const copy = getOpenCodeGoLabels(locale)
  const rows: string[] = []
  const summary: string[] = []
  for (const [label, window] of [
    [copy.rolling, usage.usage.rolling],
    [copy.weekly, usage.usage.weekly],
    [copy.monthly, usage.usage.monthly],
  ] as const) {
    if (window === undefined) {
      rows.push(`${label} ${copy.unavailable}`)
      summary.push(copy.unavailable)
      continue
    }
    const remaining = window.remainingPercent === undefined ? copy.unavailable : `${window.remainingPercent}%`
    summary.push(remaining)
    const status = window.status === undefined ? "" : ` · ${copy.status}: ${window.status}`
    rows.push(`${label} ${remaining} ${copy.remaining}${status}`)
  }
  return { heading: copy.heading, summary: summary.join(" · "), lines: rows.map((line) => theme.fg("text", `  ${line}`)) }
}

function sectionHeading(icon: string, heading: string, collapsedSummary: string | undefined, theme: PanelTheme): string {
  const glyph = collapsedSummary === undefined ? "▼" : "▶"
  const head = theme.fg(HEADING_ROLE, theme.bold(`${glyph} ${icon} ${heading}`))
  return collapsedSummary === undefined ? head : `${head}  ${theme.fg("muted", collapsedSummary)}`
}

function pad(content: string, inner: number): string {
  const clipped = truncateToWidth(content, inner, "")
  return clipped + " ".repeat(Math.max(0, inner - visibleWidth(clipped)))
}

function neonCard(title: string, body: string[], theme: PanelTheme, width: number): string[] {
  const inner = width - 4
  const titleText = truncateToWidth(`${BRAND} ${title}`, Math.max(0, inner - 3), "")
  const rule = "─".repeat(Math.max(0, width - 5 - visibleWidth(titleText)))
  return [
    theme.fg("border", "╭─ ") + theme.fg(HEADING_ROLE, theme.bold(titleText)) + theme.fg("border", ` ${rule}╮`),
    ...body.map((line) => theme.fg("border", "│ ") + pad(line, inner) + theme.fg("border", " │")),
    theme.fg("border", `╰${"─".repeat(Math.max(0, width - 2))}╯`),
  ]
}

function floatCard(title: string, body: string[], theme: PanelTheme, width: number): string[] {
  const inner = width - 2
  const head = theme.fg(HEADING_ROLE, theme.bold(truncateToWidth(`${BRAND} ${title}`, inner, "")))
  return [
    theme.fg("border", "▎ ") + pad(head, inner),
    ...body.map((line) => theme.fg("border", "▎ ") + pad(line, inner)),
  ]
}

/** Pure renderer: the card lines plus the clickable section header rows. */
export function renderPanelLayout(snapshot: PanelSnapshot, theme: PanelTheme, width: number, options: PanelOptions = {}): PanelLayout {
  const style = options.style ?? "neon"
  const inner = width - (style === "neon" ? 4 : 2)
  if (inner < 12) return { lines: [], headers: [] }

  const locale = options.locale ?? currentLocale()
  const labels = getPanelLabels(locale)
  const gauges = options.gauges ?? true
  const icons = options.icons ?? defaultIcons
  const maxChanges = Math.max(0, options.maxChanges ?? DEFAULT_MAX_CHANGES)
  const collapsed = options.collapsed ?? new Set<PanelSection>()

  const body: string[] = []
  const headers: PanelHeader[] = []
  const pushHeader = (section: PanelSection, icon: string, heading: string, summary: string): boolean => {
    const isCollapsed = collapsed.has(section)
    // One frame/title line precedes the body in both card styles.
    headers.push({ section, row: body.length + 1 })
    body.push(sectionHeading(icon, heading, isCollapsed ? summary : undefined, theme))
    return isCollapsed
  }

  body.push(theme.fg("text", clockLine(snapshot.now, locale)))

  if (!pushHeader("metrics", icons.title, labels.system, metricSummary(snapshot.metrics, labels))) {
    body.push(...metricLines(snapshot.metrics, labels, theme, gauges, icons))
  }

  if (snapshot.git !== undefined) {
    const summary = gitSummary(snapshot.git, locale)
    if (!pushHeader("git", icons.git, getGitStatusLabels(locale).heading, summary)) {
      body.push(theme.fg("muted", `  ${summary}`))
      body.push(...gitDetailLines(snapshot.git, locale, theme, maxChanges))
    }
  }

  const usage = usageSection(snapshot.usage, locale, theme)
  if (usage !== undefined && !pushHeader("usage", "◷", usage.heading, usage.summary)) {
    body.push(...usage.lines)
  }

  const lines = style === "float" ? floatCard(labels.title, body, theme, width) : neonCard(labels.title, body, theme, width)
  return { lines, headers }
}

/** Pure renderer: a snapshot in, card lines out. Every line is exactly `width` columns. */
export function renderPanel(snapshot: PanelSnapshot, theme: PanelTheme, width: number, options: PanelOptions = {}): string[] {
  return renderPanelLayout(snapshot, theme, width, options).lines
}
