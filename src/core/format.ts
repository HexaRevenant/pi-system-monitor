const BYTES_PER_GIB = 1024 ** 3

export function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)}%`
}

export function formatTemperature(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)}°C`
}

export function formatGiB(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—"
  return `${(bytes / BYTES_PER_GIB).toFixed(1)} GiB`
}

export function formatRate(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null || !Number.isFinite(bytesPerSecond)) return "—"

  const units = ["B/s", "KiB/s", "MiB/s", "GiB/s"]
  let value = Math.max(0, bytesPerSecond)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
