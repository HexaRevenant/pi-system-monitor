import assert from "node:assert/strict"
import { it } from "node:test"
import { canonicalizeLocale, currentLocale, formatLocaleDate, formatLocaleDateTime } from "../src/core/locale.js"

it("canonicalizes POSIX locale names to BCP 47 tags", () => {
  assert.equal(canonicalizeLocale("es_CL.UTF-8", "en-US"), "es-CL")
})

it("uses runtime locale when the environment locale is invalid", () => {
  assert.equal(currentLocale({ LC_ALL: "invalid_locale" }, "es-CL"), "es-CL")
  assert.equal(canonicalizeLocale("C", "es-CL"), "es-CL")
})

it("formats Chile reset date and time in local day-month-year order with seconds", () => {
  const formatted = formatLocaleDateTime(new Date(2024, 8, 23, 12, 34, 56), "es-CL")
  assert.match(formatted, /23\D+0?9\D+2024/)
  assert.match(formatted, /12:34:56/)
})

it("formats the panel date using the same host locale", () => {
  const formatted = formatLocaleDate(new Date(2026, 8, 23, 12), "es-CL")
  assert.match(formatted, /miércoles/)
  assert.match(formatted, /23/)
  assert.match(formatted, /septiembre/)
  assert.match(formatted, /2026/)
})

it("omits only the Spanish long-date 'de' before the year", () => {
  const date = new Date(2026, 8, 23, 12)
  assert.equal(formatLocaleDate(date, "es-ES"), "miércoles, 23 de septiembre 2026")
  assert.equal(
    formatLocaleDate(date, "fr-FR"),
    new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date),
  )
})
