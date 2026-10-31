import { homedir } from "node:os"
import { join } from "node:path"

export type LinkState =
  | { exists: false }
  | { exists: true; symlink: true; target: string }
  | { exists: true; symlink: false }

export type InstallPlan =
  | { action: "create"; link: string; target: string }
  | { action: "keep"; link: string; target: string; reason: string }
  | { action: "replace"; link: string; target: string; previous: string }
  | { action: "refuse"; link: string; target: string; reason: string }

export function planExtensionInstall(link: string, target: string, state: LinkState, force: boolean): InstallPlan {
  if (!state.exists) return { action: "create", link, target }
  if (!state.symlink) {
    return { action: "refuse", link, target, reason: "a real file or directory already exists at that path" }
  }
  if (state.target === target) {
    return { action: "keep", link, target, reason: "already linked to this checkout" }
  }
  if (!force) {
    return { action: "refuse", link, target, reason: `already linked to ${state.target}; pass --force to replace it` }
  }
  return { action: "replace", link, target, previous: state.target }
}

export type AgentHomeInput = {
  flag?: string
  env?: NodeJS.ProcessEnv
  home?: string
}

/** Gentle Shell's isolated agent home, or Pi's agent home when run under Pi. */
export function resolveAgentHome(input: AgentHomeInput = {}): string {
  const env = input.env ?? process.env
  const home = input.home ?? homedir()
  if (input.flag !== undefined && input.flag.trim() !== "") return input.flag
  if (env.GENTLE_SHELL_HOME !== undefined && env.GENTLE_SHELL_HOME.trim() !== "") return env.GENTLE_SHELL_HOME
  if (env.PI_CODING_AGENT_DIR !== undefined && env.PI_CODING_AGENT_DIR.trim() !== "") return env.PI_CODING_AGENT_DIR
  return join(home, ".gentle-shell", "agent")
}

export function extensionLink(agentHome: string): string {
  return join(agentHome, "extensions", "pi-system-monitor")
}
