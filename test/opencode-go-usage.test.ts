import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  fetchOpenCodeGoUsage,
  OPENCODE_GO_USAGE_URL,
  parseOpenCodeGoUsage,
} from "../src/core/opencode-go-usage.js"

describe("OpenCode Go usage", () => {
  it("maps consumption to clamped remaining percentages and preserves status/reset timestamps", () => {
    const usage = parseOpenCodeGoUsage({
      usage: {
        rolling: { status: "ok", percent: 25, resetsAt: "2026-09-23T12:00:00Z" },
        weekly: { status: "rate-limited", percent: 100, resetsAt: "2026-09-28T00:00:00Z" },
        monthly: { status: "ok", percent: 140, resetsAt: "malformed" },
      },
    })
    assert.deepEqual(usage.rolling, {
      status: "ok", remainingPercent: 75, resetsAt: "2026-09-23T12:00:00Z",
    })
    assert.deepEqual(usage.weekly, {
      status: "rate-limited", remainingPercent: 0, resetsAt: "2026-09-28T00:00:00Z",
    })
    assert.deepEqual(usage.monthly, { status: "ok", remainingPercent: 0 })
  })

  it("leaves missing or malformed usage fields unavailable", () => {
    const usage = parseOpenCodeGoUsage({
      usage: {
        rolling: { status: 4, percent: "25", resetsAt: "not-a-date" },
        weekly: null,
        monthly: { status: "", percent: Number.NaN, resetsAt: "2026-02-31T12:00:00Z" },
      },
    })
    assert.deepEqual(usage.rolling, {})
    assert.equal(usage.weekly, undefined)
    assert.deepEqual(usage.monthly, {})
    assert.deepEqual(parseOpenCodeGoUsage({}), {})
  })

  it("fetches usage with the API key and never exposes the key or response body in errors", async () => {
    let request: Request | undefined
    let requestSignal: AbortSignal | null | undefined
    const usage = await fetchOpenCodeGoUsage({ apiKey: "secret" }, async (input, init) => {
      request = new Request(input, init)
      requestSignal = init?.signal as AbortSignal | null | undefined
      return Response.json({ usage: { rolling: { status: "ok", percent: 40 } } })
    })
    assert.equal(new URL(request!.url).href, OPENCODE_GO_USAGE_URL)
    assert.equal(request!.headers.get("authorization"), "Bearer secret")
    assert.ok(requestSignal instanceof AbortSignal)
    assert.equal(usage.rolling?.remainingPercent, 60)

    await assert.rejects(
      fetchOpenCodeGoUsage({ apiKey: "secret" }, async () => new Response("secret response", { status: 401 })),
      (error: Error) => error.message === "OpenCode Go usage unavailable" && !error.message.includes("secret"),
    )
  })
})
