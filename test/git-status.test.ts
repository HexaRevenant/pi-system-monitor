import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "node:test"
import { parseGitStatus, readGitStatus, visibleChanges } from "../src/core/git-status.js"
import { formatGitFileLine, formatGitOverflowLine, formatGitStatusLine, getGitStatusLabels } from "../src/core/git-status-copy.js"

const english = getGitStatusLabels("en-US")

const porcelain = [
  "# branch.oid 386271d",
  "# branch.head main",
  "# branch.upstream origin/main",
  "# branch.ab +2 -1",
  "1 .M N... 100644 100644 100644 abc def src/tui.tsx",
  "1 M. N... 100644 100644 100644 abc def staged.ts",
  "? new file.ts",
  "u UU N... 100644 100644 100644 100644 a b c conflicted.ts",
  "2 R. N... 100644 100644 100644 a b R100 renamed.ts",
  "old.ts",
].join("\0")

it("parses branch, sync state and pending changes", () => {
  const status = parseGitStatus(porcelain)

  assert.equal(status.repository, true)
  assert.equal(status.branch, "main")
  assert.equal(status.ahead, 2)
  assert.equal(status.behind, 1)
  assert.deepEqual(status.changes, [
    { status: "M", path: "src/tui.tsx" },
    { status: "M", path: "staged.ts" },
    { status: "?", path: "new file.ts" },
    { status: "U", path: "conflicted.ts" },
    { status: "R", path: "renamed.ts" },
  ])
})

it("treats a detached head as an unknown branch", () => {
  const status = parseGitStatus(["# branch.head (detached)", "1 .M N... 100644 100644 100644 a b file.ts"].join("\0"))

  assert.equal(status.branch, undefined)
  assert.equal(status.ahead, 0)
  assert.equal(status.behind, 0)
  assert.deepEqual(status.changes, [{ status: "M", path: "file.ts" }])
})

it("reports a clean repository after the initial commit", () => {
  assert.deepEqual(parseGitStatus("# branch.oid (initial)\0# branch.head main\0"), {
    repository: true,
    branch: "main",
    ahead: 0,
    behind: 0,
    changes: [],
  })
})

it("preserves spaces and separates rename sources", () => {
  const status = parseGitStatus([
    "2 R. N... 100644 100644 100644 a b R100 renamed  file.txt",
    "base file.txt",
    "1 .M N... 100644 100644 100644 a b file with  spaces.txt",
    "?  leading.txt",
  ].join("\0"))

  assert.deepEqual(status.changes, [
    { status: "R", path: "renamed  file.txt" },
    { status: "M", path: "file with  spaces.txt" },
    { status: "?", path: " leading.txt" },
  ])
})

it("does not quote non-ASCII paths", () => {
  assert.deepEqual(parseGitStatus("? café.txt\0").changes, [{ status: "?", path: "café.txt" }])
})

it("returns repository false outside a repository and when git is unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "git-status-runtime-"))
  assert.deepEqual(await readGitStatus(directory), { repository: false, ahead: 0, behind: 0, changes: [] })

  const saved = process.env.PATH
  process.env.PATH = join(directory, "missing")
  try {
    assert.deepEqual(await readGitStatus(directory), { repository: false, ahead: 0, behind: 0, changes: [] })
  } finally {
    process.env.PATH = saved
  }
})

it("passes --no-optional-locks as a global git option and times out", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "git-status-args-"))
  const bin = join(directory, "bin")
  const log = join(directory, "args.log")
  await mkdir(bin)
  await writeFile(
    join(bin, "git"),
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(log)}\nprintf '# branch.head main\\0'\n`,
    { mode: 0o755 },
  )

  const saved = process.env.PATH
  process.env.PATH = `${bin}:${saved}`
  try {
    assert.equal((await readGitStatus(directory)).repository, true)
    const args = (await readFile(log, "utf8")).trim().split("\n")
    assert.deepEqual(args, ["-C", directory, "--no-optional-locks", "status", "--porcelain=v2", "--branch", "-z"])
  } finally {
    process.env.PATH = saved
  }

  const slow = await mkdtemp(join(tmpdir(), "git-status-timeout-"))
  const slowBin = join(slow, "bin")
  await mkdir(slowBin)
  await writeFile(join(slowBin, "git"), "#!/bin/sh\n/bin/sleep 5\n", { mode: 0o755 })
  process.env.PATH = `${slowBin}:${saved}`
  const started = Date.now()
  try {
    assert.equal((await readGitStatus(slow)).repository, false)
    assert.ok(Date.now() - started < 5000)
  } finally {
    process.env.PATH = saved
  }
})

it("formats a clean repository", () => {
  assert.equal(
    formatGitStatusLine({ repository: true, branch: "main", ahead: 0, behind: 0, changes: [] }, english),
    "main · no changes",
  )
})

it("formats pending changes with sync state and a singular file label", () => {
  assert.equal(
    formatGitStatusLine(
      { repository: true, branch: "main", ahead: 2, behind: 1, changes: [{ status: "M", path: "a.ts" }] },
      english,
    ),
    "main · 1 file · ↑2 ↓1",
  )
})

it("formats pending changes with a plural file label", () => {
  assert.equal(
    formatGitStatusLine(
      {
        repository: true,
        branch: "main",
        ahead: 0,
        behind: 0,
        changes: [
          { status: "M", path: "a.ts" },
          { status: "?", path: "b.ts" },
        ],
      },
      english,
    ),
    "main · 2 files",
  )
})

it("reports missing git data without inventing a branch", () => {
  assert.equal(
    formatGitStatusLine({ repository: false, ahead: 0, behind: 0, changes: [] }, english),
    "no git data",
  )
})

it("formats the per-file breakdown", () => {
  assert.equal(formatGitFileLine({ status: "M", path: "src/tui.tsx" }), "M src/tui.tsx")
  assert.equal(formatGitFileLine({ status: "?", path: "new file.ts" }), "? new file.ts")
})

it("formats the overflow line for the remaining files", () => {
  assert.equal(formatGitOverflowLine(4, english), "+4 more")
  assert.equal(formatGitOverflowLine(4, getGitStatusLabels("es")), "+4 más")
})

it("caps the visible file list and reports how many stay hidden", () => {
  const many = Array.from({ length: 13 }, (_, index) => ({ status: "M", path: `src/${index}.ts` }))

  assert.equal(visibleChanges(many).visible.length, 10)
  assert.equal(visibleChanges(many).hidden, 3)
  assert.equal(visibleChanges([]).hidden, 0)
})

it("uses the localized labels", () => {
  const spanish = getGitStatusLabels("es")
  assert.equal(formatGitStatusLine({ repository: true, branch: "main", ahead: 0, behind: 0, changes: [] }, spanish), "main · sin cambios")
  assert.equal(getGitStatusLabels("es").heading, "Estado Git")
  assert.equal(getGitStatusLabels("pt-BR").heading, "Status do Git")
})

it("falls back to English for an unknown locale", () => {
  assert.equal(getGitStatusLabels("xx-YY").files, "files")
  assert.equal(getGitStatusLabels("xx-YY").heading, "Git status")
})
