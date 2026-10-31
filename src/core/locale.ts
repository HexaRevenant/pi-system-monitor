const runtimeLocale = (): string => Intl.DateTimeFormat().resolvedOptions().locale

function canonicalTag(locale: string): string | undefined {
  const posixName = locale.trim().split(":", 1)[0].split("@", 1)[0].split(".", 1)[0]
  if (!posixName || /^(C|POSIX)$/i.test(posixName)) return undefined
  try {
    const canonical = Intl.getCanonicalLocales(posixName.replace(/_/g, "-"))[0]
    const resolved = new Intl.DateTimeFormat(canonical).resolvedOptions().locale
    return resolved.toLowerCase() === canonical.toLowerCase() ? canonical : undefined
  } catch {
    return undefined
  }
}

export function canonicalizeLocale(locale: string, fallback = runtimeLocale()): string {
  return canonicalTag(locale) ?? canonicalTag(fallback) ?? "en-US"
}

export function currentLocale(
  env: NodeJS.ProcessEnv = process.env,
  fallback = runtimeLocale(),
): string {
  const selected = env.LC_ALL || env.LANGUAGE?.split(":")[0] || env.LANG || ""
  return canonicalizeLocale(selected, fallback)
}

export function formatLocaleDate(date: Date, locale: string): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
  const language = locale.split(/[-_]/)[0].toLowerCase()
  return language === "es" ? formatted.replace(/\s+de(?=\s+\d{4}$)/, "") : formatted
}

export function formatLocaleDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}
