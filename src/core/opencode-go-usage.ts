import { record } from "./json-value.js"

export const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
export const OPENCODE_GO_USAGE_REFRESH_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 10_000

export type OpenCodeGoCredential = { apiKey: string }
export type OpenCodeGoWindow = {
  status?: string
  remainingPercent?: number
  resetsAt?: string
}
export type OpenCodeGoUsage = {
  rolling?: OpenCodeGoWindow
  weekly?: OpenCodeGoWindow
  monthly?: OpenCodeGoWindow
}

function validIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
  if (!match) return undefined
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond] = match
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)
  const hour = Number(rawHour)
  const minute = Number(rawMinute)
  const second = Number(rawSecond)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || hour > 23 || minute > 59 || second > 59) return undefined
  return Number.isFinite(Date.parse(value)) ? value : undefined
}

function parseWindow(value: unknown): OpenCodeGoWindow | undefined {
  const source = record(value)
  if (!source) return undefined
  const result: OpenCodeGoWindow = {}
  if (typeof source.status === "string" && source.status.trim().length > 0) result.status = source.status
  if (typeof source.percent === "number" && Number.isFinite(source.percent)) {
    result.remainingPercent = Math.min(100, Math.max(0, 100 - source.percent))
  }
  const resetsAt = validIsoTimestamp(source.resetsAt)
  if (resetsAt !== undefined) result.resetsAt = resetsAt
  return result
}

export function parseOpenCodeGoUsage(value: unknown): OpenCodeGoUsage {
  const usage = record(record(value)?.usage)
  if (!usage) return {}
  return {
    ...(record(usage.rolling) ? { rolling: parseWindow(usage.rolling)! } : {}),
    ...(record(usage.weekly) ? { weekly: parseWindow(usage.weekly)! } : {}),
    ...(record(usage.monthly) ? { monthly: parseWindow(usage.monthly)! } : {}),
  }
}

export async function fetchOpenCodeGoUsage(
  credential: OpenCodeGoCredential,
  fetcher: typeof fetch = fetch,
): Promise<OpenCodeGoUsage> {
  try {
    const response = await fetcher(OPENCODE_GO_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error("request failed")
    return parseOpenCodeGoUsage(await response.json())
  } catch {
    throw new Error("OpenCode Go usage unavailable")
  }
}
