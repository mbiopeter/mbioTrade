


export function reconnectionDelay(attempt: number, jitter = 0.5): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const capped = Math.min(30_000, 2_000 * 2 ** Math.min(safeAttempt - 1, 5));
  const spread = Math.max(0, Math.min(1, Number.isFinite(jitter) ? jitter : 0.5));
  return Math.max(500, Math.round(capped * (0.85 + 0.3 * spread)));
}

export const HTTP_REFRESH_MS = 45_000;
export const HTTP_TIMEOUT_MS = 23_000;
export const STREAM_FIRST_TICK_TIMEOUT_MS = 25_000;
export const STREAM_STALE_TIMEOUT_MS = 150_000;
