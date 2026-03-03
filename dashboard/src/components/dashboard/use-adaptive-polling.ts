"use client";

import { useEffect } from "react";

type Options = {
  activeDelayMs?: number;
  hiddenDelayMs?: number;
  backoffStepMs?: number;
  maxBackoffSteps?: number;
};

export function useAdaptivePolling(
  task: (showLoader: boolean) => Promise<boolean>,
  deps: ReadonlyArray<unknown>,
  options: Options = {}
) {
  const {
    activeDelayMs = 15000,
    hiddenDelayMs = 60000,
    backoffStepMs = 5000,
    maxBackoffSteps = 4,
  } = options;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failureCount = 0;

    const nextDelay = () => {
      const hidden = typeof document !== "undefined" && document.hidden;
      const baseDelay = hidden ? hiddenDelayMs : activeDelayMs;
      const penalty = Math.min(failureCount, maxBackoffSteps) * backoffStepMs;
      return baseDelay + penalty;
    };

    const run = async (showLoader: boolean) => {
      const ok = await task(showLoader).catch(() => false);
      failureCount = ok ? 0 : failureCount + 1;

      if (!active) return;
      timer = setTimeout(() => {
        run(false).catch(() => null);
      }, nextDelay());
    };

    run(true).catch(() => null);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, deps);
}
