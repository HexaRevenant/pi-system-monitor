import { readFile } from "node:fs/promises"

export type NativeMetricSample = {
  cpuPercent: number | undefined
  memoryTotalBytes: number
  memoryAvailableBytes: number
}

export type CpuCounters = { total: bigint; idle: bigint }

export function parseLinuxCpuCounters(stat: string): CpuCounters | undefined {
  const line = stat.split(/\r?\n/).find((item) => /^cpu(?:\s|$)/.test(item))
  if (line === undefined) return undefined
  const fields = line.trim().split(/\s+/).slice(1)
  if (fields.length < 4) return undefined
  const values = fields.map((value) => {
    try {
      const parsed = BigInt(value)
      return parsed >= 0n ? parsed : undefined
    } catch {
      return undefined
    }
  })
  if (values.some((value) => value === undefined)) return undefined
  const numbers = values as bigint[]
  return { total: numbers.reduce((sum, value) => sum + value, 0n), idle: numbers[3] + (numbers[4] ?? 0n) }
}

export function cpuPercentFromCounters(current: CpuCounters, previous: CpuCounters | undefined): number | undefined {
  if (previous === undefined || current.total < previous.total || current.idle < previous.idle) return undefined
  const totalDelta = current.total - previous.total
  const idleDelta = current.idle - previous.idle
  if (totalDelta <= 0n || idleDelta > totalDelta) return undefined
  return Number((totalDelta - idleDelta) * 10000n / totalDelta) / 100
}

export function parseLinuxMemoryInfo(meminfo: string): { totalBytes: number; availableBytes: number } | undefined {
  const values = new Map<string, number>()
  for (const line of meminfo.split(/\r?\n/)) {
    const match = /^(MemTotal|MemAvailable|MemFree|Buffers|Cached):\s+(\d+)(?:\s+kB)?\s*$/.exec(line)
    if (match !== null) values.set(match[1], Number(match[2]) * 1024)
  }
  const total = values.get("MemTotal")
  const hasAvailable = values.has("MemAvailable") || values.has("MemFree") || values.has("Buffers") || values.has("Cached")
  const available = values.get("MemAvailable") ??
    ((values.get("MemFree") ?? 0) + (values.get("Buffers") ?? 0) + (values.get("Cached") ?? 0))
  if (total === undefined || !hasAvailable || !Number.isSafeInteger(total) || !Number.isSafeInteger(available) || total <= 0 || available < 0) return undefined
  return { totalBytes: total, availableBytes: Math.min(total, available) }
}

export function mapMemoryBytes(totalBytes: number, availableBytes: number): Pick<NativeMetricSample, "memoryTotalBytes" | "memoryAvailableBytes"> | undefined {
  if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(availableBytes) || totalBytes <= 0 || availableBytes < 0) return undefined
  return { memoryTotalBytes: totalBytes, memoryAvailableBytes: Math.min(totalBytes, availableBytes) }
}

type NativeReader = () => Promise<NativeMetricSample>
let reader: Promise<NativeReader> | undefined

export function isNativeReaderAvailable(platform: NodeJS.Platform, bunVersion: string | undefined): boolean {
  return bunVersion === undefined && (platform === "linux" || platform === "win32" || platform === "darwin")
}

export async function readNativeMetrics(): Promise<NativeMetricSample> {
  const bunVersion = (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun
  if (!isNativeReaderAvailable(process.platform, bunVersion)) {
    throw new Error("Native CPU/RAM metrics are unavailable on Bun")
  }

  reader ??= (async () => {
    if (process.platform === "linux") return createLinuxReader()
    if (process.platform === "win32") return createWindowsReader()
    if (process.platform === "darwin") return createMacReader()
    throw new Error(`Native CPU/RAM metrics are unsupported on ${process.platform}`)
  })()
  return (await reader)()
}

function createLinuxReader(): NativeReader {
  let previous: CpuCounters | undefined
  return async () => {
    const [stat, meminfo] = await Promise.all([readFile("/proc/stat", "utf8"), readFile("/proc/meminfo", "utf8")])
    const counters = parseLinuxCpuCounters(stat)
    const memory = parseLinuxMemoryInfo(meminfo)
    if (counters === undefined || memory === undefined) throw new Error("Malformed Linux CPU/RAM data")
    const cpuPercent = cpuPercentFromCounters(counters, previous)
    previous = cpuPercent === undefined && previous !== undefined ? undefined : counters
    return { cpuPercent, memoryTotalBytes: memory.totalBytes, memoryAvailableBytes: memory.availableBytes }
  }
}

type Koffi = typeof import("koffi").default

async function createWindowsReader(): Promise<NativeReader> {
  const loaded = await import("koffi")
  const koffi = (loaded.default ?? loaded) as Koffi
  koffi.struct("FILETIME", { low: "uint32", high: "uint32" })
  const memoryStatus = koffi.struct("MEMORYSTATUSEX", {
    length: "uint32", memoryLoad: "uint32", total: "uint64", available: "uint64",
    pageFile: "uint64", availablePageFile: "uint64", virtual: "uint64", availableVirtual: "uint64", availableExtended: "uint64",
  })
  const kernel32 = koffi.load("kernel32.dll")
  const getSystemTimes = kernel32.func("int __stdcall GetSystemTimes(_Out_ FILETIME *idle, _Out_ FILETIME *kernel, _Out_ FILETIME *user)")
  const globalMemoryStatusEx = kernel32.func("int __stdcall GlobalMemoryStatusEx(_Inout_ MEMORYSTATUSEX *status)")
  let previous: CpuCounters | undefined
  return async () => {
    const idle: { low?: number; high?: number } = {}
    const kernel: { low?: number; high?: number } = {}
    const user: { low?: number; high?: number } = {}
    if (!getSystemTimes(idle, kernel, user)) throw new Error("GetSystemTimes failed")
    const toUint64 = (value: { low?: number; high?: number }) => BigInt(value.low ?? 0) + (BigInt(value.high ?? 0) << 32n)
    const counters = { total: toUint64(kernel) + toUint64(user), idle: toUint64(idle) }
    const cpuPercent = cpuPercentFromCounters(counters, previous)
    previous = cpuPercent === undefined && previous !== undefined ? undefined : counters
    const status: { length?: number; total?: bigint; available?: bigint } = { length: koffi.sizeof(memoryStatus) }
    if (!globalMemoryStatusEx(status)) throw new Error("GlobalMemoryStatusEx failed")
    const memory = mapMemoryBytes(Number(status.total ?? 0n), Number(status.available ?? 0n))
    if (memory === undefined) throw new Error("Malformed Windows RAM data")
    return { cpuPercent, ...memory }
  }
}

async function createMacReader(): Promise<NativeReader> {
  const loaded = await import("koffi")
  const koffi = (loaded.default ?? loaded) as Koffi
  const vmStatistics = koffi.struct("vm_statistics64", {
    free_count: "uint32", active_count: "uint32", inactive_count: "uint32", wire_count: "uint32",
    zero_fill_count: "uint32", reactivations: "uint32", pageins: "uint32", pageouts: "uint32",
    faults: "uint32", cow_faults: "uint32", lookups: "uint32", hits: "uint32", purgeable_count: "uint32",
    speculative_count: "uint32", decompressions: "uint32", compressions: "uint32", swapins: "uint32", swapouts: "uint32",
    compressor_page_count: "uint32", throttled_count: "uint32", external_page_count: "uint32", internal_page_count: "uint32",
    total_uncompressed_pages_in_compressor: "uint32",
  })
  const cpuLoad = koffi.struct("host_cpu_load_info", { user: "uint32", system: "uint32", idle: "uint32", nice: "uint32" })
  const libc = koffi.load("libSystem.B.dylib")
  const sysctlbyname = libc.func("int sysctlbyname(const char *name, void *oldp, size_t *oldlenp, const void *newp, size_t newlen)")
  const machHostSelf = libc.func("uint32 mach_host_self()")
  const hostStatistics64 = libc.func("int host_statistics64(uint32 host, int flavor, _Out_ vm_statistics64 *stats, _Inout_ uint32_t *count)")
  const hostCpuLoad = libc.func("int host_statistics(uint32 host, int flavor, _Out_ host_cpu_load_info *load, _Inout_ uint32_t *count)")
  const readUint64Sysctl = (name: string) => {
    const output = koffi.alloc("uint64", 1)
    const length = [8]
    if (sysctlbyname(name, output, length, null, 0) !== 0) throw new Error(`sysctlbyname failed: ${name}`)
    return Number(koffi.decode(output, "uint64"))
  }
  const totalBytes = readUint64Sysctl("hw.memsize")
  const pageSize = readUint64Sysctl("hw.pagesize")
  if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(pageSize) || pageSize <= 0) throw new Error("Malformed macOS memory data")
  let previous: CpuCounters | undefined
  return async () => {
    const load: Record<string, number> = {}
    const loadCount = [4]
    if (hostCpuLoad(machHostSelf(), 3, load, loadCount) !== 0) throw new Error("host_statistics failed")
    const counters = {
      total: BigInt(load.user ?? 0) + BigInt(load.system ?? 0) + BigInt(load.idle ?? 0) + BigInt(load.nice ?? 0),
      idle: BigInt(load.idle ?? 0),
    }
    const cpuPercent = cpuPercentFromCounters(counters, previous)
    previous = cpuPercent === undefined && previous !== undefined ? undefined : counters
    const stats: Record<string, number> = {}
    const count = [38]
    if (hostStatistics64(machHostSelf(), 4, stats, count) !== 0) throw new Error("host_statistics64 failed")
    const availablePages = (stats.free_count ?? 0) + (stats.inactive_count ?? 0) + (stats.purgeable_count ?? 0) + (stats.speculative_count ?? 0)
    const memory = mapMemoryBytes(totalBytes, availablePages * pageSize)
    if (memory === undefined) throw new Error("Malformed macOS RAM data")
    return { cpuPercent, ...memory }
  }
}
