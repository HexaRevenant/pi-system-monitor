#!/usr/bin/env node
import { existsSync } from "node:fs"
import { lstat, mkdir, realpath, rm, symlink } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { extensionLink, planExtensionInstall, resolveAgentHome, type LinkState } from "./install-plan.js"

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

type Options = { yes: boolean; dryRun: boolean; force: boolean; agentHome?: string; help: boolean }

function parseArgs(argv: string[]): Options {
  const options: Options = { yes: false, dryRun: false, force: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--yes" || argument === "-y") options.yes = true
    else if (argument === "--dry-run") options.dryRun = true
    else if (argument === "--force") options.force = true
    else if (argument === "--help" || argument === "-h") options.help = true
    else if (argument === "--agent-home") {
      options.agentHome = argv[index + 1]
      index += 1
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function help(): void {
  console.log(`Install pi-system-monitor as a Gentle Shell / Pi extension.

Usage: npm run install-extension -- [--yes] [--dry-run] [--force] [--agent-home <path>]

  --yes              Apply the plan. Without it the script only prints it.
  --dry-run          Print the plan even when --yes is present.
  --force            Replace a symlink that points to another checkout.
  --agent-home PATH  Agent home to write into. Defaults to GENTLE_SHELL_HOME,
                     then PI_CODING_AGENT_DIR, then ~/.gentle-shell/agent.
  -h, --help         Show this help.

The script only ever creates or replaces the symlink
<agent-home>/extensions/pi-system-monitor. It never deletes a real directory.`)
}

async function linkState(link: string): Promise<LinkState> {
  try {
    const stats = await lstat(link)
    if (!stats.isSymbolicLink()) return { exists: true, symlink: false }
    return { exists: true, symlink: true, target: await realpath(link) }
  } catch {
    return { exists: false }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    help()
    return
  }

  const agentHome = resolveAgentHome({ flag: options.agentHome })
  const link = extensionLink(agentHome)
  const target = await realpath(repoRoot)
  const plan = planExtensionInstall(link, target, await linkState(link), options.force)

  if (plan.action === "refuse") {
    console.error(`pi-system-monitor: refusing to install: ${plan.reason}`)
    process.exitCode = 1
    return
  }

  console.log(`pi-system-monitor: ${plan.action} ${plan.link} -> ${plan.target}`)
  if (plan.action === "keep") {
    console.log("pi-system-monitor: already installed; nothing to do.")
    return
  }
  if (!existsSync(resolve(repoRoot, "node_modules"))) {
    console.warn("pi-system-monitor: dependencies are missing; run `npm install` in the checkout first.")
  }

  if (!options.yes || options.dryRun) {
    console.log("pi-system-monitor: dry run; pass --yes to apply.")
    return
  }

  await mkdir(dirname(link), { recursive: true })
  if (plan.action === "replace") await rm(link)
  await symlink(target, link, "dir")
  console.log("pi-system-monitor: installed. Run /reload inside gentle-shell, or restart it.")
}

main().catch((error: unknown) => {
  console.error(`pi-system-monitor: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
