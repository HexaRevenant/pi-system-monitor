import type { OpenCodeGoWindow } from "./opencode-go-usage.js"
import { formatLocaleDateTime } from "./locale.js"

export type OpenCodeGoLabels = {
  heading: string
  rolling: string
  weekly: string
  monthly: string
  remaining: string
  status: string
  resets: string
  unavailable: string
}

const labels: Record<string, OpenCodeGoLabels> = {
  de: { heading: "OpenCode Go-Nutzung", rolling: "Letzte 5 Stunden", weekly: "Wöchentlich", monthly: "Monatlich", remaining: "verbleibend", status: "Status", resets: "Zurücksetzung", unavailable: "nicht verfügbar" },
  es: { heading: "Uso de OpenCode Go", rolling: "Últimas 5 horas", weekly: "Semanal", monthly: "Mensual", remaining: "restante", status: "Estado", resets: "se restablece", unavailable: "no disponible" },
  fr: { heading: "Utilisation d’OpenCode Go", rolling: "5 dernières heures", weekly: "Hebdomadaire", monthly: "Mensuel", remaining: "restant", status: "Statut", resets: "réinitialisation", unavailable: "indisponible" },
  it: { heading: "Utilizzo di OpenCode Go", rolling: "Ultime 5 ore", weekly: "Settimanale", monthly: "Mensile", remaining: "rimanente", status: "Stato", resets: "si reimposta", unavailable: "non disponibile" },
  pt: { heading: "Uso do OpenCode Go", rolling: "Últimas 5 horas", weekly: "Semanal", monthly: "Mensal", remaining: "restante", status: "Status", resets: "reinicia", unavailable: "indisponível" },
}

const english: OpenCodeGoLabels = {
  heading: "OpenCode Go usage",
  rolling: "Rolling (5 hours)",
  weekly: "Weekly",
  monthly: "Monthly",
  remaining: "remaining",
  status: "Status",
  resets: "resets",
  unavailable: "unavailable",
}

export function getOpenCodeGoLabels(locale: string): OpenCodeGoLabels {
  return labels[locale.split(/[-_.]/)[0].toLowerCase()] ?? english
}

export function formatOpenCodeGoWindowLines(
  window: OpenCodeGoWindow | undefined,
  copy: OpenCodeGoLabels,
  locale: string,
): string[] {
  return [
    `${copy.remaining}: ${window?.remainingPercent === undefined ? copy.unavailable : `${window.remainingPercent}%`}`,
    `${copy.status}: ${window?.status ?? copy.unavailable}`,
    `${copy.resets} ${window?.resetsAt ? formatLocaleDateTime(new Date(window.resetsAt), locale) : copy.unavailable}`,
  ]
}
