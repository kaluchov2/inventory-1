export interface RealtimeRefreshGate {
  invalidate: (id: string) => number;
  isCurrent: (id: string, generation: number) => boolean;
  schedule: (id: string, callback: (generation: number) => void) => number;
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
