import { createInterface } from "node:readline"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readWindowsNetworkCounters, type NativeNetworkCounters } from "./windows-network.js"

export type WindowsMetricsHelperResponse =
  | { ok: true; rx: string; tx: string }
  | { ok: false; error: string }

export function serializeWindowsMetricsResponse(counters: NativeNetworkCounters): string {
  return JSON.stringify({ ok: true, rx: counters.rx.toString(10), tx: counters.tx.toString(10) })
}

export function parseWindowsMetricsResponse(line: string): NativeNetworkCounters {
  const response = JSON.parse(line) as WindowsMetricsHelperResponse
  if (!response.ok) throw new Error(response.error)
  const rx = BigInt(response.rx)
  const tx = BigInt(response.tx)
  if (rx < 0n || tx < 0n) throw new Error("Invalid negative network counter")
  return { rx, tx }
}

async function serve(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of input) {
    let response: string
    try {
      JSON.parse(line)
      response = serializeWindowsMetricsResponse(await readWindowsNetworkCounters())
    } catch (error) {
      response = JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    process.stdout.write(`${response}\n`)
  }
  input.close()
}

const entrypoint = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
const currentFile = resolve(fileURLToPath(import.meta.url))
if (entrypoint === currentFile) {
  await serve()
}
