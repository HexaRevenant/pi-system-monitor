import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type GitChange = {
  status: string
  path: string
}

export type GitStatus = {
  repository: boolean
  branch?: string
  ahead: number
  behind: number
  changes: readonly GitChange[]
}

export const MAX_VISIBLE_CHANGES = 10

const EMPTY_STATUS: GitStatus = { repository: false, ahead: 0, behind: 0, changes: [] }

function statusLetter(xy: string): string {
  const [index, worktree] = xy
  if (index !== undefined && index !== "." && index !== " ") return index
  if (worktree !== undefined && worktree !== "." && worktree !== " ") return worktree
  return "?"
}

export function parseGitStatus(output: string): GitStatus {
  let branch: string | undefined
  let ahead = 0
  let behind = 0
  const changes: GitChange[] = []

  const records = output.split("\0")
  for (let index = 0; index < records.length; index += 1) {
    const line = records[index]
    if (line === "") continue
    if (line.startsWith("# branch.head ")) {
      const value = line.slice("# branch.head ".length).trim()
      if (value !== "" && value !== "(detached)") branch = value
      continue
    }
    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+)\s+-(\d+)/)
      if (match !== null) {
        ahead = Number(match[1])
        behind = Number(match[2])
      }
      continue
    }
    if (line.startsWith("? ")) {
      changes.push({ status: "?", path: line.slice(2) })
      continue
    }
    if (line.startsWith("1 ")) {
      const fields = line.split(" ")
      changes.push({ status: statusLetter(fields[1] ?? ""), path: fields.slice(8).join(" ") })
      continue
    }
    if (line.startsWith("2 ")) {
      const fields = line.split(" ")
      changes.push({ status: statusLetter(fields[1] ?? ""), path: fields.slice(9).join(" ") })
      // With -z the original path of a rename is the next NUL-separated record.
      index += 1
      continue
    }
    if (line.startsWith("u ")) {
      const fields = line.split(" ")
      changes.push({ status: "U", path: fields.slice(10).join(" ") })
    }
  }

  return { repository: true, branch, ahead, behind, changes }
}

export async function readGitStatus(directory: string): Promise<GitStatus> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", directory, "--no-optional-locks", "status", "--porcelain=v2", "--branch", "-z"],
      { timeout: 3000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    )
    return parseGitStatus(stdout)
  } catch {
    return { ...EMPTY_STATUS }
  }
}

export function visibleChanges(
  changes: readonly GitChange[],
  limit = MAX_VISIBLE_CHANGES,
): { visible: readonly GitChange[]; hidden: number } {
  return {
    visible: changes.slice(0, limit),
    hidden: Math.max(0, changes.length - limit),
  }
}
