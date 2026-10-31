#!/usr/bin/env node
import { lstat, realpath, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { extensionLink, resolveAgentHome } from "./install-plan.js"

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

type Options = { yes: boolean; dryRun: boolean; agentHome?: string; help: boolean }

function parseArgs(argv: string[]): Options {
  const options: Options = { yes: false, dryRun: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--yes" || argument === "-y") options.yes = true
    else if (argument === "--dry-run") options.dryRun = true
    else if (argument === "--help" || argument === "-h") options.help = true
    else if (argument === "--agent-home") {
      options.agentHome = argv[index + 1]
      index += 1
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function help(): void {
  console.log(`Remove the pi-system-monitor extension symlink.

Usage: npm run uninstall-extension -- [--yes] [--dry-run] [--agent-home <path>]

  --yes              Remove the symlink. Without it the script only prints the plan.
  --dry-run          Print the plan even when --yes is present.
  --agent-home PATH  Agent home to clean. Defaults to GENTLE_SHELL_HOME,
                     then PI_CODING_AGENT_DIR, then ~/.gentle-shell/agent.
  -h, --help         Show this help.

Only a symlink that resolves to this checkout is removed. Real directories and
links owned by another checkout are left untouched.`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    help()
    return
  }

  const link = extensionLink(resolveAgentHome({ flag: options.agentHome }))
  let target: string
  try {
    const stats = await lstat(link)
    if (!stats.isSymbolicLink()) {
      console.error(`pi-system-monitor: refusing to remove ${link}: it is not a symlink.`)
      process.exitCode = 1
      return
    }
    target = await realpath(link)
  } catch {
    console.log(`pi-system-monitor: nothing to remove at ${link}.`)
    return
  }

  if (target !== (await realpath(repoRoot))) {
    console.error(`pi-system-monitor: refusing to remove ${link}: it points to ${target}, not this checkout.`)
    process.exitCode = 1
    return
  }

  console.log(`pi-system-monitor: remove ${link} -> ${target}`)
  if (!options.yes || options.dryRun) {
    console.log("pi-system-monitor: dry run; pass --yes to apply.")
    return
  }

  await rm(link)
  console.log("pi-system-monitor: removed. Run /reload inside gentle-shell, or restart it.")
}

main().catch((error: unknown) => {
  console.error(`pi-system-monitor: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
