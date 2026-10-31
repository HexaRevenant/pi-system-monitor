import type { GitChange, GitStatus } from "./git-status.js"

export type GitStatusLabels = {
  heading: string
  noChanges: string
  unavailable: string
  file: string
  files: string
  more: string
}

const labels: Record<string, GitStatusLabels> = {
  de: { heading: "Git-Status", noChanges: "keine Änderungen", unavailable: "keine Git-Daten", file: "Datei", files: "Dateien", more: "weitere" },
  es: { heading: "Estado Git", noChanges: "sin cambios", unavailable: "sin datos de git", file: "archivo", files: "archivos", more: "más" },
  fr: { heading: "Statut Git", noChanges: "aucune modification", unavailable: "aucune donnée git", file: "fichier", files: "fichiers", more: "de plus" },
  it: { heading: "Stato Git", noChanges: "nessuna modifica", unavailable: "nessun dato git", file: "file", files: "file", more: "altri" },
  pt: { heading: "Status do Git", noChanges: "sem alterações", unavailable: "sem dados do git", file: "arquivo", files: "arquivos", more: "mais" },
}

const english: GitStatusLabels = {
  heading: "Git status",
  noChanges: "no changes",
  unavailable: "no git data",
  file: "file",
  files: "files",
  more: "more",
}

export function getGitStatusLabels(locale: string): GitStatusLabels {
  return labels[locale.split(/[-_.]/)[0].toLowerCase()] ?? english
}

export function formatGitStatusLine(status: GitStatus, copy: GitStatusLabels): string {
  if (!status.repository) return copy.unavailable

  const branch = status.branch ?? "—"
  const files = status.changes.length
  const sync = [
    status.ahead > 0 ? `↑${status.ahead}` : "",
    status.behind > 0 ? `↓${status.behind}` : "",
  ].filter((part) => part !== "")
  const suffix = sync.length > 0 ? ` · ${sync.join(" ")}` : ""

  if (files === 0) return `${branch} · ${copy.noChanges}${suffix}`

  const label = files === 1 ? copy.file : copy.files
  return `${branch} · ${files} ${label}${suffix}`
}

export function formatGitFileLine(change: GitChange): string {
  return `${change.status} ${change.path}`
}

export function formatGitOverflowLine(hidden: number, copy: GitStatusLabels): string {
  return `+${hidden} ${copy.more}`
}
