import { execFile } from "node:child_process"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import si from "systeminformation"
import { networkRate, readWithFallback, type NativeNetworkCounters } from "./windows-network.js"
import { readNativeMetrics } from "./native-metrics.js"
import { parseWindowsMetricsResponse } from "./windows-metrics-helper.js"

const execFileAsync = promisify(execFile)
export const DEFAULT_METRIC_TIMEOUT_MS = 1_500
export const WINDOWS_MEMORY_TIMEOUT_MS = 5_000
export const WINDOWS_NETWORK_PROCESS_TIMEOUT_MS = 4_000
export const WINDOWS_NETWORK_OUTER_TIMEOUT_MS = 4_500
const MAC_METRIC_TIMEOUT_MS = 1_500
const MAC_STATS_HELPER = "/Applications/Stats.app/Contents/Resources/smc"

export interface SystemMetrics {
  cpuPercent: number | null
  memoryUsedBytes: number | null
  memoryTotalBytes: number | null
  memoryPercent: number | null
  gpuPercent: number | null
  cpuTemperatureCelsius: number | null
  gpuTemperatureCelsius: number | null
  gpuMemoryUsedBytes: number | null
  gpuMemoryTotalBytes: number | null
  gpuMemoryPercent: number | null
  gpuMemoryIsUnified: boolean | null
  downloadBytesPerSecond: number | null
  uploadBytesPerSecond: number | null
}

export type NetworkSample = { rx_bytes?: number; tx_bytes?: number; rx_sec?: number; tx_sec?: number; iface?: string }
type MonitorNode = { Text?: string; Type?: string; Value?: string; Children?: MonitorNode[] }

export type CommandRunner = (command: string, args: string[], timeoutMs: number) => Promise<string>

const runCommand: CommandRunner = async (command, args, timeoutMs) => {
  const { stdout } = await execFileAsync(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 })
  return stdout
}

const runWindowsCommand: CommandRunner = (command, args, timeoutMs) => new Promise((resolve, reject) => {
  execFile(command, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout) => {
    if (error !== null) reject(error)
    else resolve(stdout)
  })
})

const WINDOWS_METRICS_HELPER = fileURLToPath(new URL("./windows-metrics-helper.js", import.meta.url))

class WindowsMetricsClient {
  private child: ChildProcessWithoutNullStreams | undefined
  private pending: { resolve: (value: NativeNetworkCounters) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined
  private output = ""

  async read(timeoutMs: number): Promise<NativeNetworkCounters> {
    if (this.pending !== undefined) throw new Error("Windows metrics helper request already in flight")
    const child = this.ensureChild()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error("Windows metrics helper timeout")), timeoutMs)
      this.pending = { resolve, reject, timer }
      child.stdin.write("{}\n", (error) => {
        if (error != null) this.fail(error)
      })
    })
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child !== undefined) return this.child
    const child = spawn("node", [WINDOWS_METRICS_HELPER], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    this.child = child
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      this.output += chunk
      let newline: number
      while ((newline = this.output.indexOf("\n")) >= 0) {
        const line = this.output.slice(0, newline).trim()
        this.output = this.output.slice(newline + 1)
        if (line.length === 0 || this.pending === undefined) continue
        const pending = this.pending
        this.pending = undefined
        clearTimeout(pending.timer)
        try {
          pending.resolve(parseWindowsMetricsResponse(line))
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)), pending)
        }
      }
    })
    child.on("error", (error) => this.fail(error))
    child.on("close", () => {
      if (this.pending !== undefined) this.fail(new Error("Windows metrics helper exited"))
      if (this.child === child) this.child = undefined
    })
    return child
  }

  private fail(error: Error, pending = this.pending): void {
    if (pending === undefined) return
    if (this.pending === pending) this.pending = undefined
    clearTimeout(pending.timer)
    pending.reject(error)
    const child = this.child
    this.child = undefined
    if (child !== undefined) child.kill()
    this.output = ""
  }
}

const windowsMetricsClient = new WindowsMetricsClient()

export type MacHardwareArchitecture = "arm64" | "x86_64"

export async function detectMacHardwareArchitecture(
  runner: CommandRunner = runCommand,
  processArchitecture: string = process.arch,
): Promise<MacHardwareArchitecture> {
  try {
    const output = (await runner("sysctl", ["-in", "hw.optional.arm64"], MAC_METRIC_TIMEOUT_MS)).trim()
    if (output === "1") return "arm64"
    if (output === "0") return "x86_64"
  } catch {
    // Fall back below when sysctl is unavailable or times out.
  }

  // A native arm64 process proves Apple Silicon, but an x64 process may be
  // either Intel or Rosetta. Treat the ambiguous case conservatively.
  return processArchitecture === "arm64" ? "arm64" : "x86_64"
}

export function gpuMemoryLabel(
  architecture: MacHardwareArchitecture | undefined,
  platform: string = process.platform,
): string {
  if (platform !== "darwin") return "GPU VRAM"
  if (architecture === "arm64") return "RAM"
  if (architecture === "x86_64") return "GPU VRAM"
  return "Memory"
}

export function parseMonitorTemperature(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseMacGpuUtilization(stdout: string): number | undefined {
  const match = stdout.match(/"Device Utilization %"\s*=\s*([\d]+(?:\.\d+)?)/)
  if (match === null) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined
}

export function parseMacStatsTemperature(stdout: string, sensorPrefix: "Tp" | "Tg"): number | undefined {
  let maximum: number | undefined
  for (const line of stdout.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/)
    if (fields.length < 2 || !new RegExp(`^\\[${sensorPrefix}`).test(fields[0])) continue
    const value = Number(fields[1].replace(",", ".").replace(/[°cC]/g, ""))
    if (Number.isFinite(value) && value > 0 && (maximum === undefined || value > maximum)) maximum = value
  }
  return maximum
}

export type MacMetrics = {
  gpuPercent: number | null
  cpuTemperatureCelsius: number | null
  gpuTemperatureCelsius: number | null
}

export async function readMacMetrics(runner: CommandRunner = runCommand): Promise<MacMetrics> {
  const [gpuOutput, temperatureOutput] = await Promise.all([
    runner("ioreg", ["-r", "-d", "1", "-c", "IOAccelerator"], MAC_METRIC_TIMEOUT_MS).catch(() => ""),
    runner(MAC_STATS_HELPER, ["list", "-t"], MAC_METRIC_TIMEOUT_MS).catch(() => ""),
  ])
  return {
    gpuPercent: parseMacGpuUtilization(gpuOutput) ?? null,
    cpuTemperatureCelsius: parseMacStatsTemperature(temperatureOutput, "Tp") ?? null,
    gpuTemperatureCelsius: parseMacStatsTemperature(temperatureOutput, "Tg") ?? null,
  }
}

async function readLibreHardwareMonitorTemperature(): Promise<number | undefined> {
  const response = await fetch("http://127.0.0.1:8085/data.json", { signal: AbortSignal.timeout(2_000) })
  if (!response.ok) return undefined
  const root = (await response.json()) as unknown
  if (root === null || typeof root !== "object") return undefined
  const sensors: MonitorNode[] = []
  const visit = (node: MonitorNode) => {
    if (node.Type === "Temperature" && node.Text !== undefined) sensors.push(node)
    for (const child of Array.isArray(node.Children) ? node.Children : []) {
      if (child !== null && typeof child === "object") visit(child)
    }
  }
  visit(root as MonitorNode)
  const cpuSensor = sensors.find((sensor) => sensor.Text === "CPU Package") ??
    sensors.find((sensor) => sensor.Text === "Core Average") ??
    sensors.find((sensor) => sensor.Text === "Core Max")
  return parseMonitorTemperature(cpuSensor?.Value)
}

export function parseWindowsNetworkOutput(stdout: string): NetworkSample[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout.trim())
  } catch {
    return []
  }
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
  return rows.map((item) => ({
    iface: typeof item.Name === "string" ? item.Name : undefined,
    rx_bytes: finite(item.ReceivedBytes) ?? 0,
    tx_bytes: finite(item.SentBytes) ?? 0,
  }))
}

export async function readWindowsNetworkFallback(runner: CommandRunner = runWindowsCommand): Promise<NetworkSample[]> {
  const stdout = await runner(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress",
    ],
    WINDOWS_NETWORK_PROCESS_TIMEOUT_MS,
  )
  return parseWindowsNetworkOutput(stdout)
}

let previousNetwork: { timestamp: number; rx: number; tx: number } | undefined

const unavailable: SystemMetrics = {
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

export type GpuMetric = {
  gpuPercent: number | null
  gpuTemperatureCelsius: number | null
  gpuMemoryUsedBytes: number | null
  gpuMemoryTotalBytes: number | null
  gpuMemoryPercent: number | null
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("metric timeout")), timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

const SLOW_METRIC_CACHE_MS = 10_000
const TEMPERATURE_CACHE_MS = 10_000
const OPTIONAL_SOURCE_BACKOFF_MS = 30_000
const isWindows = process.platform === "win32"
const isBun = (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun !== undefined
const isMac = process.platform === "darwin"
const NETWORK_CACHE_MS = 2_000
let macHardwareArchitecture: Promise<MacHardwareArchitecture> | undefined

function readMacHardwareArchitecture(): Promise<MacHardwareArchitecture> {
  if (!isMac) return Promise.resolve("x86_64")
  macHardwareArchitecture ??= detectMacHardwareArchitecture()
  return macHardwareArchitecture
}

export type CachedMetric<T> = {
  value: T | undefined
  lastAttemptAt: number
  lastFailureAt?: number
  inFlight: Promise<T | undefined> | undefined
}

export function selectGpuMetrics(graphics: { controllers: Array<{
  utilizationGpu?: unknown
  temperatureGpu?: unknown
  memoryTotal?: unknown
  memoryFree?: unknown
  memoryUsed?: unknown
}> } | undefined): GpuMetric {
  const empty: GpuMetric = {
    gpuPercent: null,
    gpuTemperatureCelsius: null,
    gpuMemoryUsedBytes: null,
    gpuMemoryTotalBytes: null,
    gpuMemoryPercent: null,
  }
  if (graphics === undefined || graphics === null || !Array.isArray(graphics.controllers)) return empty

  const controller = graphics.controllers
    .map((item) => {
      const source = item ?? {}
      const utilization = finite(source.utilizationGpu)
      const temperature = finite(source.temperatureGpu)
      const memoryTotal = finite(source.memoryTotal)
      const memoryFree = finite(source.memoryFree)
      const memoryUsed = finite(source.memoryUsed) ??
        (memoryTotal !== null && memoryFree !== null ? Math.max(0, memoryTotal - memoryFree) : null)
      const hasMemory = memoryUsed !== null && memoryTotal !== null && memoryTotal > 0
      return { utilization, temperature, memoryUsed, memoryTotal, hasMemory }
    })
    .filter(({ utilization, temperature, hasMemory }) => utilization !== null || temperature !== null || hasMemory)
    .sort((left, right) => {
      const score = (value: typeof left) => (value.hasMemory ? 2 : 0) + (value.utilization !== null ? 1 : 0)
      return score(right) - score(left) || (right.utilization ?? -Infinity) - (left.utilization ?? -Infinity)
    })[0]

  if (controller === undefined) return empty
  const result: GpuMetric = {
    gpuPercent: controller.utilization ?? 0,
    gpuTemperatureCelsius: controller.temperature,
    gpuMemoryUsedBytes: null,
    gpuMemoryTotalBytes: null,
    gpuMemoryPercent: null,
  }
  if (controller.hasMemory) {
    result.gpuMemoryUsedBytes = controller.memoryUsed! * 1024 ** 2
    result.gpuMemoryTotalBytes = controller.memoryTotal! * 1024 ** 2
    result.gpuMemoryPercent = (controller.memoryUsed! / controller.memoryTotal!) * 100
  }
  return result
}

export function readCachedMetric<T>(
  state: CachedMetric<T>,
  reader: () => Promise<T>,
  cacheMs = SLOW_METRIC_CACHE_MS,
  now = Date.now(),
  unavailableCacheMs = cacheMs,
  timeoutMs?: number,
): Promise<T | undefined> {
  if (state.inFlight !== undefined) return state.inFlight
  if (state.lastFailureAt !== undefined && now - state.lastFailureAt < unavailableCacheMs) {
    return Promise.resolve(state.value)
  }
  if (now - state.lastAttemptAt < cacheMs) return Promise.resolve(state.value)

  state.lastAttemptAt = now
  let flight!: Promise<T | undefined>
  flight = (async () => {
    try {
      const value = timeoutMs === undefined ? await reader() : await withTimeout(reader(), timeoutMs)
      state.value = value
      state.lastFailureAt = undefined
      return value
    } catch {
      state.lastFailureAt = now
      return state.value
    } finally {
      // A timed-out reader may still resolve later. Do not let that old
      // attempt clear a newer in-flight attempt.
      if (state.inFlight === flight) state.inFlight = undefined
    }
  })()
  state.inFlight = flight
  return flight
}

const cachedCpuTemperature: CachedMetric<Awaited<ReturnType<typeof si.cpuTemperature>>> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

const cachedLibreHardwareMonitorTemperature: CachedMetric<number> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

const cachedGraphics: CachedMetric<Awaited<ReturnType<typeof si.graphics>>> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

const cachedMacMetrics: CachedMetric<MacMetrics> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

const cachedNetwork: CachedMetric<NetworkSample[]> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

let previousWindowsNetwork: { timestamp: number; rx: number; tx: number } | undefined
let previousNativeWindowsNetwork: { timestamp: number; counters: NativeNetworkCounters } | undefined

async function readWindowsNetworkMetrics(): Promise<NetworkSample[]> {
  const timestamp = Date.now()
  const fallback = async () => {
    const samples = await readWindowsNetworkFallback()
    const rx = samples.reduce((total, item) => total + (finite(item.rx_bytes) ?? 0), 0)
    const tx = samples.reduce((total, item) => total + (finite(item.tx_bytes) ?? 0), 0)
    return { rx: BigInt(rx), tx: BigInt(tx) }
  }
  const primary = isWindows && isBun ? () => windowsMetricsClient.read(WINDOWS_NETWORK_PROCESS_TIMEOUT_MS) : async () => {
    const { readWindowsNetworkCounters } = await import("./windows-network.js")
    return readWindowsNetworkCounters()
  }
  const { value: counters, usedFallback } = await readWithFallback(primary, fallback)
  if (!usedFallback) {
    const rate = networkRate(counters, previousNativeWindowsNetwork?.counters, previousNativeWindowsNetwork === undefined ? 0 : timestamp - previousNativeWindowsNetwork.timestamp)
    previousNativeWindowsNetwork = { timestamp, counters }
    return [{ rx_bytes: Number(counters.rx), tx_bytes: Number(counters.tx), rx_sec: rate.rx, tx_sec: rate.tx }]
  }
  // Native loading/API failures use the old bounded path, never both readers.
  const seconds = previousWindowsNetwork === undefined ? undefined : Math.max((timestamp - previousWindowsNetwork.timestamp) / 1000, 0.001)
  const rx = Number(counters.rx)
  const tx = Number(counters.tx)
  const rxSec = seconds === undefined ? undefined : Math.max(0, rx - previousWindowsNetwork!.rx) / seconds
  const txSec = seconds === undefined ? undefined : Math.max(0, tx - previousWindowsNetwork!.tx) / seconds
  previousWindowsNetwork = { timestamp, rx, tx }
  return [{ rx_bytes: rx, tx_bytes: tx, rx_sec: rxSec, tx_sec: txSec }]
}

async function readWindowsCpuTemperature(): Promise<{ main: number } | undefined> {
  try {
    const native = await si.cpuTemperature()
    const value = finite(native.main) ?? finite(native.max) ?? undefined
    if (value !== undefined) return { main: value }
  } catch {
    // Try LibreHardwareMonitor when the native source is unavailable.
  }

  const now = Date.now()
  const value = await readCachedMetric(
    cachedLibreHardwareMonitorTemperature,
    async () => {
      const temperature = await readLibreHardwareMonitorTemperature()
      if (temperature === undefined) throw new Error("LibreHardwareMonitor temperature unavailable")
      return temperature
    },
    TEMPERATURE_CACHE_MS,
    now,
    OPTIONAL_SOURCE_BACKOFF_MS,
  )
  if (cachedLibreHardwareMonitorTemperature.lastFailureAt !== undefined &&
    now - cachedLibreHardwareMonitorTemperature.lastFailureAt < OPTIONAL_SOURCE_BACKOFF_MS) {
    return undefined
  }
  return value === undefined ? undefined : { main: value }
}

export async function readMetrics(): Promise<SystemMetrics> {
  const networkMetric = readCachedMetric(
    cachedNetwork,
    isWindows ? readWindowsNetworkMetrics : () => si.networkStats("*"),
    isWindows ? NETWORK_CACHE_MS : 2_000,
    Date.now(),
    isWindows && isBun ? NETWORK_CACHE_MS : OPTIONAL_SOURCE_BACKOFF_MS,
    isWindows ? WINDOWS_NETWORK_OUTER_TIMEOUT_MS : DEFAULT_METRIC_TIMEOUT_MS,
  )
  // Bun's Windows systeminformation fallbacks contend with PowerShell startup.
  // Run the network sample first so its existing timeout remains effective.
  if (isWindows && isBun) await networkMetric
  const [native, hardwareArchitecture] = await Promise.allSettled([
    withTimeout(readNativeMetrics(), isWindows ? WINDOWS_MEMORY_TIMEOUT_MS : DEFAULT_METRIC_TIMEOUT_MS),
    readMacHardwareArchitecture(),
  ])
  let cpuPercent = native.status === "fulfilled" ? finite(native.value.cpuPercent) : null
  let memoryTotalBytes = native.status === "fulfilled" ? finite(native.value.memoryTotalBytes) : null
  let memoryAvailableBytes = native.status === "fulfilled" ? finite(native.value.memoryAvailableBytes) : null
  let fallbackMemoryUsedBytes: number | null = null
  if (native.status !== "fulfilled") {
    const [load, memory] = await Promise.allSettled([
      withTimeout(si.currentLoad(), DEFAULT_METRIC_TIMEOUT_MS),
      withTimeout(si.mem(), isWindows ? WINDOWS_MEMORY_TIMEOUT_MS : DEFAULT_METRIC_TIMEOUT_MS),
    ])
    cpuPercent = load.status === "fulfilled" ? finite(load.value.currentLoad) : null
    memoryTotalBytes = memory.status === "fulfilled" ? finite(memory.value.total) : null
    memoryAvailableBytes = memory.status === "fulfilled" ? finite(memory.value.available) : null
    fallbackMemoryUsedBytes = memoryTotalBytes !== null && memoryAvailableBytes !== null
      ? Math.max(0, memoryTotalBytes - memoryAvailableBytes)
      : memory.status === "fulfilled" ? finite(memory.value.used) : null
  }

  const [temperature, graphics, network, mac] = await Promise.allSettled([
    readCachedMetric(cachedCpuTemperature, isWindows ? readWindowsCpuTemperature : () => si.cpuTemperature(), TEMPERATURE_CACHE_MS, Date.now(), TEMPERATURE_CACHE_MS, 2_500),
    readCachedMetric(cachedGraphics, () => si.graphics(), SLOW_METRIC_CACHE_MS, Date.now(), SLOW_METRIC_CACHE_MS, 2_500),
    networkMetric,
    isMac
      ? readCachedMetric(cachedMacMetrics, () => readMacMetrics(), SLOW_METRIC_CACHE_MS, Date.now(), OPTIONAL_SOURCE_BACKOFF_MS, MAC_METRIC_TIMEOUT_MS)
      : Promise.resolve(undefined),
  ])

  const memoryUsedBytes = fallbackMemoryUsedBytes ?? (
    memoryTotalBytes !== null && memoryAvailableBytes !== null
      ? Math.max(0, memoryTotalBytes - memoryAvailableBytes)
      : null)
  const memoryPercent =
    memoryUsedBytes !== null && memoryTotalBytes !== null && memoryTotalBytes > 0
      ? (memoryUsedBytes / memoryTotalBytes) * 100
      : null

  const gpu = selectGpuMetrics(graphics.status === "fulfilled" ? graphics.value : undefined)
  const macMetrics = mac.status === "fulfilled" ? mac.value : undefined
  const architecture = hardwareArchitecture.status === "fulfilled" ? hardwareArchitecture.value : undefined
  const isAppleSilicon = isMac && architecture === "arm64"
  if (isAppleSilicon) {
    // Apple Silicon has unified memory; systeminformation's graphics memory
    // fields are not a reliable live VRAM source and must not be relabeled.
    gpu.gpuMemoryUsedBytes = null
    gpu.gpuMemoryTotalBytes = null
    gpu.gpuMemoryPercent = null
  }

  let downloadBytesPerSecond: number | null = null
  let uploadBytesPerSecond: number | null = null
  if (network.status === "fulfilled" && network.value !== undefined) {
    const samples = Array.isArray(network.value) ? network.value : []
    const timestamp = Date.now()
    const rx = samples.reduce((total, item) => total + (finite(item.rx_bytes) ?? 0), 0)
    const tx = samples.reduce((total, item) => total + (finite(item.tx_bytes) ?? 0), 0)

    if (isWindows) {
      downloadBytesPerSecond = finite(samples[0]?.rx_sec) ?? null
      uploadBytesPerSecond = finite(samples[0]?.tx_sec) ?? null
    } else if (previousNetwork !== undefined) {
      const seconds = Math.max((timestamp - previousNetwork.timestamp) / 1000, 0.001)
      downloadBytesPerSecond = Math.max(0, rx - previousNetwork.rx) / seconds
      uploadBytesPerSecond = Math.max(0, tx - previousNetwork.tx) / seconds
    } else {
      downloadBytesPerSecond = finite(samples[0]?.rx_sec) ?? null
      uploadBytesPerSecond = finite(samples[0]?.tx_sec) ?? null
    }

    previousNetwork = { timestamp, rx, tx }
  }

  return {
    ...unavailable,
    cpuPercent,
    memoryUsedBytes,
    memoryTotalBytes,
    memoryPercent,
    gpuPercent: macMetrics?.gpuPercent ?? gpu.gpuPercent,
    cpuTemperatureCelsius:
      macMetrics?.cpuTemperatureCelsius ?? (temperature.status === "fulfilled" && temperature.value !== undefined
        ? finite(temperature.value.main) ?? ("max" in temperature.value ? finite(temperature.value.max) : null)
        : null),
    gpuTemperatureCelsius: macMetrics?.gpuTemperatureCelsius ?? gpu.gpuTemperatureCelsius,
    gpuMemoryUsedBytes: gpu.gpuMemoryUsedBytes,
    gpuMemoryTotalBytes: gpu.gpuMemoryTotalBytes,
    gpuMemoryPercent: gpu.gpuMemoryPercent,
    gpuMemoryIsUnified: isAppleSilicon ? true : isMac && architecture === "x86_64" ? false : null,
    downloadBytesPerSecond,
    uploadBytesPerSecond,
  }
}
