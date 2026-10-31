import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  defaultPiAuthPath,
  extractChatGptAccountId,
  readCodexCredential,
  readOpenCodeGoCredential,
} from "../src/pi/credentials.js"

const jwt = (payload: Record<string, unknown>): string =>
  ["header", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(".")

describe("Pi credentials", () => {
  it("resolves the agent auth file from PI_CODING_AGENT_DIR before the home default", () => {
    assert.equal(defaultPiAuthPath({ PI_CODING_AGENT_DIR: "/agent" }, "/home/test"), "/agent/auth.json")
    assert.equal(defaultPiAuthPath({}, "/home/test"), "/home/test/.pi/agent/auth.json")
  })

  it("reads the openai-codex OAuth credential and derives the account id from the token", async () => {
    const token = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } })
    const credential = await readCodexCredential({
      filePath: "/mock/auth.json",
      readFile: async (path) => {
        assert.equal(path, "/mock/auth.json")
        return JSON.stringify({
          "openai-codex": { type: "oauth", access: token, refresh: "r", expires: 1 },
          "opencode-go": { type: "api_key", key: "must-not-be-used" },
        })
      },
    })
    assert.deepEqual(credential, { accessToken: token, accountId: "acct-1" })
  })

  it("prefers a stored accountId and rejects non-OAuth entries", async () => {
    const token = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "from-token" } })
    const stored = await readCodexCredential({
      readFile: async () => JSON.stringify({ "openai-codex": { type: "oauth", access: token, accountId: "stored" } }),
    })
    assert.equal(stored?.accountId, "stored")
    const apiKeyEntry = await readCodexCredential({
      readFile: async () => JSON.stringify({ "openai-codex": { type: "api_key", key: "nope" } }),
    })
    assert.equal(apiKeyEntry, undefined)
  })

  it("extracts the ChatGPT account id only from a well-formed JWT claim", () => {
    assert.equal(extractChatGptAccountId(jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-2" } })), "acct-2")
    assert.equal(extractChatGptAccountId("not-a-jwt"), undefined)
    assert.equal(extractChatGptAccountId(jwt({})), undefined)
  })

  it("reads the OpenCode Go key from either stored credential kind", async () => {
    const apiKey = await readOpenCodeGoCredential({
      readFile: async () => JSON.stringify({ "opencode-go": { type: "api_key", key: "go-key" } }),
    })
    assert.deepEqual(apiKey, { apiKey: "go-key" })
    const oauth = await readOpenCodeGoCredential({
      readFile: async () => JSON.stringify({ "opencode-go": { type: "oauth", access: "go-token" } }),
    })
    assert.deepEqual(oauth, { apiKey: "go-token" })
    const missing = await readOpenCodeGoCredential({
      readFile: async () => JSON.stringify({ openai: { type: "api_key", key: "wrong" } }),
    })
    assert.equal(missing, undefined)
  })
})
