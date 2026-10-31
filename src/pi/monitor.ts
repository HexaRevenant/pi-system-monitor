import { fetchCodexQuota, type CodexQuota } from "../core/codex-quota.js"
import { readGitStatus, type GitStatus } from "../core/git-status.js"
import { currentLocale } from "../core/locale.js"
import { readMetrics, type SystemMetrics } from "../core/metrics.js"
import { fetchOpenCodeGoUsage, type OpenCodeGoUsage } from "../core/opencode-go-usage.js"
import { createQuotaPoller } from "../core/quota-poller.js"
import type { CardSource } from "./rail.js"
import { CODEX_PROVIDER_ID, OPENCODE_GO_PROVIDER_ID, readCodexCredential, readOpenCodeGoCredential } from "./credentials.js"
import { renderPanel, type PanelIcons, type PanelStyle, type PanelTheme, type UsageSnapshot } from "../panel/render.js"

const CLOCK_REFRESH_MS = 1_000
const SYSTEM_REFRESH_MS = 2_000
const GIT_REFRESH_MS = 2_000
const QUOTA_REFRESH_MS = 5 * 60_000

const EMPTY_METRICS: SystemMetrics = {
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

const EMPTY_CODEX: CodexQuota = { additional: [] }

export type MonitorOptions = {
  cwd: string
  theme: PanelTheme
  icons: PanelIcons
  style: () => PanelStyle
  provider: () => string | undefined
  requestRender: () => void
}

export type Monitor = {
  card: () => CardSource
  start: () => void
  stop: () => void
  setVisible: (visible: boolean) => void
  isVisible: () => boolean
  refresh: () => void
}

export function createMonitor(options: MonitorOptions): Monitor {
  const locale = currentLocale()
  let metrics = EMPTY_METRICS
  let git: GitStatus | undefined
  let codexQuota: CodexQuota = EMPTY_CODEX
  let goUsage: OpenCodeGoUsage = {}
  let visible = true
  let revision = 0
  let started = false
  let lastQuotaProvider: string | undefined

  const timers: Array<ReturnType<typeof setInterval>> = []
  const bump = () => {
    revision += 1
    try {
      options.requestRender()
    } catch {
      /* Render requests are best effort. */
    }
  }

  const refreshMetrics = async () => {
    try {
      metrics = await readMetrics()
      bump()
    } catch {
      /* Keep the previous sample; the next tick retries. */
    }
  }

  const refreshGit = async () => {
    try {
      git = await readGitStatus(options.cwd)
      bump()
    } catch {
      /* Keep the previous sample; the next tick retries. */
    }
  }

  const codexPoller = createQuotaPoller<CodexQuota>({
    enabled: () => options.provider() === CODEX_PROVIDER_ID,
    load: async () => {
      const credential = await readCodexCredential()
      return credential === undefined ? undefined : await fetchCodexQuota(credential)
    },
    update: (value) => {
      codexQuota = value
      bump()
    },
    empty: () => EMPTY_CODEX,
  })

  const goPoller = createQuotaPoller<OpenCodeGoUsage>({
    enabled: () => options.provider() === OPENCODE_GO_PROVIDER_ID,
    load: async () => {
      const credential = await readOpenCodeGoCredential()
      return credential === undefined ? undefined : await fetchOpenCodeGoUsage(credential)
    },
    update: (value) => {
      goUsage = value
      bump()
    },
    empty: () => ({}),
  })

  const refreshQuota = (force = false) => {
    const provider = options.provider()
    if (provider !== lastQuotaProvider || force) {
      lastQuotaProvider = provider
      codexPoller.reset()
      goPoller.reset()
    }
    void codexPoller.refresh()
    void goPoller.refresh()
  }

  const usage = (): UsageSnapshot | undefined => {
    const provider = options.provider()
    if (provider === CODEX_PROVIDER_ID) return { kind: "codex", quota: codexQuota }
    if (provider === OPENCODE_GO_PROVIDER_ID) return { kind: "opencode-go", usage: goUsage }
    return undefined
  }

  const card = (): CardSource => ({
    render: (width: number) =>
      visible
        ? renderPanel({ now: new Date(), metrics, git, usage: usage() }, options.theme, width, {
            locale,
            style: options.style(),
            icons: options.icons,
          })
        : [],
    digest: () => `${revision}`,
  })

  const tick = (refresh: () => Promise<void>, interval: number) => {
    void refresh()
    const timer = setInterval(() => void refresh(), interval)
    timer.unref?.()
    timers.push(timer)
  }

  return {
    card,
    start() {
      if (started) return
      started = true
      tick(refreshMetrics, SYSTEM_REFRESH_MS)
      tick(refreshGit, GIT_REFRESH_MS)
      const clock = setInterval(bump, CLOCK_REFRESH_MS)
      clock.unref?.()
      timers.push(clock)
      refreshQuota(true)
      const quota = setInterval(() => refreshQuota(), QUOTA_REFRESH_MS)
      quota.unref?.()
      timers.push(quota)
    },
    stop() {
      started = false
      for (const timer of timers.splice(0)) clearInterval(timer)
      codexPoller.reset()
      goPoller.reset()
    },
    setVisible(next: boolean) {
      visible = next
      bump()
    },
    isVisible: () => visible,
    refresh() {
      void refreshMetrics()
      void refreshGit()
      refreshQuota(true)
    },
  }
}
