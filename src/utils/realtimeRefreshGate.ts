export interface RealtimeRefreshGate {
  invalidate: (id: string) => number;
  isCurrent: (id: string, generation: number) => boolean;
  schedule: (id: string, callback: (generation: number) => void) => number;
}

/**
 * Returns false only when the local version is certainly current or newer.
 * JavaScript dates lose PostgreSQL microseconds, so equal milliseconds with
 * different strings must be rehydrated instead of being treated as equal.
 */
export function shouldRefreshTransactionVersion(
  localUpdatedAt?: string,
  remoteUpdatedAt?: string,
): boolean {
  if (!localUpdatedAt || !remoteUpdatedAt) return true;
  if (localUpdatedAt === remoteUpdatedAt) return false;

  const localMilliseconds = new Date(localUpdatedAt).getTime();
  const remoteMilliseconds = new Date(remoteUpdatedAt).getTime();
  if (!Number.isFinite(localMilliseconds) || !Number.isFinite(remoteMilliseconds)) return true;

  return localMilliseconds <= remoteMilliseconds;
}

/** Coalesces bursts per id and makes stale async responses detectable. */
export function createRealtimeRefreshGate(delayMs = 50): RealtimeRefreshGate {
  const generations = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const invalidate = (id: string): number => {
    const generation = (generations.get(id) || 0) + 1;
    generations.set(id, generation);
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    return generation;
  };

  return {
    invalidate,
    isCurrent: (id, generation) => generations.get(id) === generation,
    schedule: (id, callback) => {
      const generation = invalidate(id);
      const timer = setTimeout(() => {
        timers.delete(id);
        if (generations.get(id) === generation) callback(generation);
      }, delayMs);
      timers.set(id, timer);
      return generation;
    },
  };
}
