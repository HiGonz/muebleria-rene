export interface DebouncedMaxWaitScheduler {
  trigger: () => void;
  flushNow: () => void;
  cancel: () => void;
}

// Hand-rolled debounce-with-maxWait, same shape as createDebouncedLocalStorage
// (useKitchenStore.ts) but parameterized instead of hardcoded to localStorage.
// `trigger()` (re)arms a debounce timer that runs `run` after `debounceMs` of
// no further triggers; a separate non-resetting maxWait timer, armed on the
// FIRST trigger of a burst, guarantees `run` fires at least once every
// `maxWaitMs` even under continuous triggering (e.g. dragging a module for
// 30s straight). Whichever timer fires first runs `run` once and clears the
// other. `flushNow()` runs `run` immediately if something is pending, and is
// a no-op otherwise.
export function createDebouncedMaxWaitScheduler(run: () => void, debounceMs: number, maxWaitMs: number): DebouncedMaxWaitScheduler {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
  };

  const fire = () => {
    cancel();
    run();
  };

  const trigger = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fire, debounceMs);
    if (!maxWaitTimer) maxWaitTimer = setTimeout(fire, maxWaitMs);
  };

  const flushNow = () => {
    if (!debounceTimer && !maxWaitTimer) return;
    fire();
  };

  return { trigger, flushNow, cancel };
}
