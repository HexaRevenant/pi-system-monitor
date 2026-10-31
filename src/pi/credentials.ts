import { readFile as nodeReadFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const CODEX_PROVIDER_ID = "openai-codex"
export const OPENCODE_GO_PROVIDER_ID = "opencode-go"
const CHATGPT_CLAIM = "https://api.openai.com/auth"

export type CodexCredential = { accessToken: string; accountId?: string }
export type OpenCodeGoCredential = { apiKey: string }

type AuthEntry = Record<string, unknown>
type ReadOptions = { filePath?: string; readFile?: (path: string) => Promise<string> }

/**
 * Pi keeps one credential per provider in `<agentDir>/auth.json`. Gentle Shell
 * runs with its own agent dir, so `PI_CODING_AGENT_DIR` wins over the Pi home.
 */
export function defaultPiAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  const agentDir = env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent")
  return join(agentDir, "auth.json")
}

async function readEntry(providerId: string, options: ReadOptions = {}): Promise<AuthEntry | undefined> {
  try {
    const contents = await (options.readFile ?? ((path) => nodeReadFile(path, "utf8")))(
      options.filePath ?? defaultPiAuthPath(),
    )
    const auth: unknown = JSON.parse(contents)
    if (typeof auth !== "object" || auth === null || Array.isArray(auth)) return undefined
    const entry = (auth as Record<string, unknown>)[providerId]
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined
    return entry as AuthEntry
  } catch {
    return undefined
  }
}

/**
 * Pi's Codex provider is `openai-codex` and stores the OAuth access token.
 * The ChatGPT account id travels in the token's `https://api.openai.com/auth`
 * claim; a stored `accountId` still wins when a flow wrote one explicitly.
 */
export async function readCodexCredential(options: ReadOptions = {}): Promise<CodexCredential | undefined> {
  const entry = await readEntry(CODEX_PROVIDER_ID, options)
  if (entry === undefined) return undefined
  if (entry.type !== "oauth" || typeof entry.access !== "string" || entry.access.length === 0) return undefined
  const accountId =
    typeof entry.accountId === "string" && entry.accountId.length > 0
      ? entry.accountId
      : extractChatGptAccountId(entry.access)
  return { accessToken: entry.access, ...(accountId === undefined ? {} : { accountId }) }
}

/** Reads the OpenCode Go key from either credential kind Pi can store for it. */
export async function readOpenCodeGoCredential(options: ReadOptions = {}): Promise<OpenCodeGoCredential | undefined> {
  const entry = await readEntry(OPENCODE_GO_PROVIDER_ID, options)
  if (entry === undefined) return undefined
  if (entry.type === "api_key" && typeof entry.key === "string" && entry.key.length > 0) return { apiKey: entry.key }
  if (entry.type === "oauth" && typeof entry.access === "string" && entry.access.length > 0) return { apiKey: entry.access }
  return undefined
}

/** Decodes the ChatGPT account id from a JWT access token, never throwing. */
export function extractChatGptAccountId(token: string): string | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8"))
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined
    const claim = (payload as Record<string, unknown>)[CHATGPT_CLAIM]
    if (typeof claim !== "object" || claim === null || Array.isArray(claim)) return undefined
    const accountId = (claim as Record<string, unknown>).chatgpt_account_id
    return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined
  } catch {
    return undefined
  }
}
