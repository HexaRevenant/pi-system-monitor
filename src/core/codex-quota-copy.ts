import type { QuotaWindow } from "./codex-quota.js"
import { formatLocaleDateTime } from "./locale.js"

export type CodexQuotaLabels = {
  heading: string
  session: string
  weekly: string
  used: string
  resets: string
  unavailable: string
  creditBalance: string
  quotaResetCredits: string
  unlimited: string
  available: string
  applicable: string
  resetUnavailable: string
  resetsIn: string
}

const labels: Record<string, CodexQuotaLabels> = {
  de: { heading: "Codex-Nutzung", session: "Sitzung", weekly: "Wöchentlich", used: "verbraucht", resets: "Zurücksetzung", unavailable: "nicht verfügbar", creditBalance: "Guthabenstand", quotaResetCredits: "Kontingent-Reset-Credits", unlimited: "unbegrenzt", available: "verfügbar", applicable: "anwendbar", resetUnavailable: "Zurücksetzung nicht verfügbar", resetsIn: "Zurücksetzung in" },
  es: { heading: "Uso de Codex", session: "Sesión", weekly: "Semanal", used: "usado", resets: "se restablece", unavailable: "no disponible", creditBalance: "Saldo de créditos", quotaResetCredits: "Créditos de reinicio de cuota", unlimited: "ilimitados", available: "disponibles", applicable: "aplicables", resetUnavailable: "restablecimiento no disponible", resetsIn: "se restablece en" },
  fr: { heading: "Utilisation de Codex", session: "Session", weekly: "Hebdomadaire", used: "utilisé", resets: "réinitialisation", unavailable: "indisponible", creditBalance: "Solde de crédits", quotaResetCredits: "Crédits de réinitialisation du quota", unlimited: "illimités", available: "disponibles", applicable: "applicables", resetUnavailable: "réinitialisation indisponible", resetsIn: "réinitialisation dans" },
  it: { heading: "Utilizzo di Codex", session: "Sessione", weekly: "Settimanale", used: "usato", resets: "si reimposta", unavailable: "non disponibile", creditBalance: "Saldo dei crediti", quotaResetCredits: "Crediti di ripristino della quota", unlimited: "illimitati", available: "disponibili", applicable: "applicabili", resetUnavailable: "ripristino non disponibile", resetsIn: "si reimposta tra" },
  pt: { heading: "Uso do Codex", session: "Sessão", weekly: "Semanal", used: "usado", resets: "reinicia", unavailable: "indisponível", creditBalance: "Saldo de créditos", quotaResetCredits: "Créditos de reinicialização da cota", unlimited: "ilimitados", available: "disponíveis", applicable: "aplicáveis", resetUnavailable: "reinicialização indisponível", resetsIn: "reinicia em" },
}

const english: CodexQuotaLabels = { heading: "Codex usage", session: "Session", weekly: "Weekly", used: "used", resets: "resets", unavailable: "unavailable", creditBalance: "Credit balance", quotaResetCredits: "Quota reset credits", unlimited: "unlimited", available: "available", applicable: "applicable", resetUnavailable: "reset unavailable", resetsIn: "resets in" }

export function getCodexQuotaLabels(locale: string): CodexQuotaLabels {
  const language = locale.split(/[-_.]/)[0].toLowerCase()
  return labels[language] ?? english
}

export function formatCodexQuotaWindowLines(
  window: QuotaWindow | undefined,
  copy: CodexQuotaLabels,
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
): string[] {
  if (!window) return [copy.unavailable]
  return [
    `${window.usedPercent}% ${copy.used}`,
    `${copy.resets} ${window.resetAt ? formatLocaleDateTime(new Date(window.resetAt * 1000), locale) : copy.unavailable}`,
  ]
}

export function formatQuotaResetCredits(applicable: number | undefined, available: number | undefined, copy: CodexQuotaLabels): string {
  return `${applicable ?? copy.unavailable} ${copy.applicable} / ${available ?? copy.unavailable} ${copy.available}`
}
