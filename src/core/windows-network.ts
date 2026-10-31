import type koffiType from "koffi"

export type NativeIfRow = {
  Alias?: string
  InterfaceAndOperStatusFlags?: number | { HardwareInterface?: number; FilterInterface?: number }
  OperStatus?: number
  AccessType?: number
  Type?: number
  InOctets?: bigint | number
  OutOctets?: bigint | number
}

export type NativeNetworkCounters = { rx: bigint; tx: bigint }

type Koffi = typeof koffiType

const IF_TYPE_SOFTWARE_LOOPBACK = 24
const IF_TYPE_TUNNEL = 131
const IF_OPER_STATUS_UP = 1
const NET_IF_ACCESS_LOOPBACK = 1
const ROWS_OFFSET = 8 // MIB_IF_TABLE2 has ULONG NumEntries followed by aligned rows.

let nativeReader: Promise<() => NativeIfRow[]> | undefined

export function isWindowsNetworkReaderAvailable(bunVersion: string | undefined): boolean {
  return bunVersion === undefined
}

function toUint64(value: bigint | number | undefined): bigint {
  if (typeof value === "bigint" && value >= 0n) return value
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  return 0n
}

export function mapWindowsNetworkRows(rows: NativeIfRow[]): NativeNetworkCounters {
  return rows.reduce<NativeNetworkCounters>((total, row) => {
    const flags = row.InterfaceAndOperStatusFlags
    const isHardware = typeof flags === "number" ? (flags & 1) !== 0 : flags?.HardwareInterface === 1
    const isFilter = typeof flags === "number" ? (flags & 2) !== 0 : flags?.FilterInterface === 1
    const isUsable = row.OperStatus === IF_OPER_STATUS_UP && row.AccessType !== NET_IF_ACCESS_LOOPBACK &&
      row.Type !== IF_TYPE_SOFTWARE_LOOPBACK && row.Type !== IF_TYPE_TUNNEL
    if (!isHardware || isFilter || !isUsable) return total
    return { rx: total.rx + toUint64(row.InOctets), tx: total.tx + toUint64(row.OutOctets) }
  }, { rx: 0n, tx: 0n })
}

export async function readWithFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<{ value: T; usedFallback: boolean }> {
  try {
    return { value: await primary(), usedFallback: false }
  } catch {
    return { value: await fallback(), usedFallback: true }
  }
}

export function networkRate(current: NativeNetworkCounters, previous: NativeNetworkCounters | undefined, elapsedMs: number): { rx: number | undefined; tx: number | undefined } {
  if (previous === undefined) return { rx: undefined, tx: undefined }
  const seconds = Math.max(elapsedMs / 1000, 0.001)
  const rx = current.rx >= previous.rx ? current.rx - previous.rx : 0n
  const tx = current.tx >= previous.tx ? current.tx - previous.tx : 0n
  return { rx: Number(rx) / seconds, tx: Number(tx) / seconds }
}

export function decodeNativeIfRow(koffi: Koffi, row: Parameters<Koffi["offsetof"]>[0], table: any, offset: number): NativeIfRow {
  const decode = (field: string, type: string) => koffi.decode(table, offset + koffi.offsetof(row, field), type)
  return {
    InterfaceAndOperStatusFlags: decode("InterfaceAndOperStatusFlags", "uint8"),
    OperStatus: decode("OperStatus", "uint32"),
    Type: decode("Type", "uint32"),
    AccessType: decode("AccessType", "uint32"),
    InOctets: decode("InOctets", "uint64"),
    OutOctets: decode("OutOctets", "uint64"),
  }
}

function defineNativeReader(koffi: Koffi): () => NativeIfRow[] {
  const guid = koffi.struct("MIB_GUID", {
    Data1: "uint32",
    Data2: "uint16",
    Data3: "uint16",
    Data4: koffi.array("uint8", 8),
  })
  const row = koffi.struct("MIB_IF_ROW2", {
    InterfaceLuid: "uint64",
    InterfaceIndex: "uint32",
    InterfaceGuid: guid,
    Alias: koffi.array("char16_t", 257),
    Description: koffi.array("char16_t", 257),
    PhysicalAddressLength: "uint32",
    PhysicalAddress: koffi.array("uint8", 32),
    PermanentPhysicalAddress: koffi.array("uint8", 32),
    Mtu: "uint32",
    Type: "uint32",
    TunnelType: "uint32",
    MediaType: "uint32",
    PhysicalMediumType: "uint32",
    AccessType: "uint32",
    DirectionType: "uint32",
    InterfaceAndOperStatusFlags: "uint8",
    OperStatus: "uint32",
    AdminStatus: "uint32",
    MediaConnectState: "uint32",
    NetworkGuid: guid,
    ConnectionType: "uint32",
    TransmitLinkSpeed: "uint64",
    ReceiveLinkSpeed: "uint64",
    InOctets: "uint64",
    InUcastPkts: "uint64",
    InNUcastPkts: "uint64",
    InDiscards: "uint64",
    InErrors: "uint64",
    InUnknownProtos: "uint64",
    InUcastOctets: "uint64",
    InMulticastOctets: "uint64",
    InBroadcastOctets: "uint64",
    OutOctets: "uint64",
    OutUcastPkts: "uint64",
    OutNUcastPkts: "uint64",
    OutDiscards: "uint64",
    OutErrors: "uint64",
    OutUcastOctets: "uint64",
    OutMulticastOctets: "uint64",
    OutBroadcastOctets: "uint64",
    OutQLen: "uint64",
  })
  // The Windows ABI pads this structure to 1,352 bytes after the final ULONG64.
  if (koffi.sizeof(row) !== 1352) throw new Error(`Unexpected MIB_IF_ROW2 size: ${koffi.sizeof(row)}`)

  const iphlpapi = koffi.load("iphlpapi.dll")
  const getIfTable2 = iphlpapi.func("uint32 __stdcall GetIfTable2(_Out_ void **Table)")
  const freeMibTable = iphlpapi.func("void __stdcall FreeMibTable(void *Memory)")

  return () => {
    const output: [bigint | null] = [null]
    const result = getIfTable2(output)
    if (result !== 0 || output[0] === null) throw new Error(`GetIfTable2 failed: ${result}`)
    const table = output[0]
    try {
      const count = Number(koffi.decode(table, 0, "uint32"))
      if (!Number.isSafeInteger(count) || count < 0 || count > 4096) throw new Error(`Invalid interface count: ${count}`)
      return Array.from({ length: count }, (_, index) =>
        decodeNativeIfRow(koffi, row, table, ROWS_OFFSET + index * koffi.sizeof(row)))
    } finally {
      freeMibTable(table)
    }
  }
}

async function loadNativeReader(): Promise<() => NativeIfRow[]> {
  const loaded = await import("koffi")
  return defineNativeReader((loaded.default ?? loaded) as Koffi)
}

export async function readWindowsNetworkCounters(): Promise<NativeNetworkCounters> {
  const bunVersion = (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun
  if (!isWindowsNetworkReaderAvailable(bunVersion)) {
    throw new Error("Native Windows network metrics are unavailable on Bun")
  }

  nativeReader ??= loadNativeReader()
  return mapWindowsNetworkRows((await nativeReader)())
}
