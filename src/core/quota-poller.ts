export type QuotaPoller = {
  refresh: () => Promise<void>
  reset: () => void
}

export type QuotaPollerOptions<T> = {
  enabled: () => boolean
  load: () => Promise<T | undefined>
  update: (value: T) => void
  empty: () => T
}

/**
 * Polls one provider quota source without overlapping requests.
 *
 * A refresh is skipped while `enabled` is false. Concurrent `refresh` calls
 * collapse into a single follow-up read. `reset` invalidates the in-flight
 * generation so a late response for a previous provider or session is dropped;
 * a stale load still occupies the single-flight slot until it settles, matching
 * the pre-extraction behavior.
 */
export function createQuotaPoller<T>(options: QuotaPollerOptions<T>): QuotaPoller {
  let refreshing = false
  let refreshRequested = false
  let generation = 0

  const refresh = async (): Promise<void> => {
    if (!options.enabled()) return
    if (refreshing) {
      refreshRequested = true
      return
    }

    refreshing = true
    const current = generation
    try {
      const value = await options.load()
      if (current === generation && options.enabled()) options.update(value ?? options.empty())
    } catch {
      if (current === generation) options.update(options.empty())
    } finally {
      refreshing = false
      if (refreshRequested && options.enabled()) {
        refreshRequested = false
        queueMicrotask(() => void refresh())
      }
    }
  }

  return {
    refresh,
    reset() {
      generation += 1
      refreshRequested = false
    },
  }
}
