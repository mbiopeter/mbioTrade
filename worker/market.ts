import type { Candle, NewsEvent, Timeframe } from "../src/lib/types";
import { isRecord } from "../src/lib/validation";
import { MAX_ANALYSIS_CANDLES } from "../src/lib/strategy-engine/candles";

export function appendTick(
  candles: Candle[],
  epoch: number,
  quote: number,
  timeframe: Timeframe,
): Candle[] {
  if (!Number.isFinite(epoch) || !Number.isFinite(quote) || epoch <= 0 || quote <= 0)
    return candles;
  const time = Math.floor(epoch / timeframe) * timeframe;
  const last = candles.at(-1);
  if (last && time < last.time) return candles;
  if (last?.time === time) {
    return [
      ...candles.slice(0, -1),
      {
        ...last,
        high: Math.max(last.high, quote),
        low: Math.min(last.low, quote),
        close: quote,
      },
    ];
  }
  return [
    ...candles,
    { time, open: quote, high: quote, low: quote, close: quote },
  ].slice(-(MAX_ANALYSIS_CANDLES + 1));
}

export type NewsSnapshot = { events: NewsEvent[]; ready: boolean };

export class WorkerNews {
  private events: NewsEvent[] = [];
  private fetchedAt = 0;
  private attemptedAt = -Infinity;

  constructor(
    private readonly url: string | null,
    private readonly required: boolean,
  ) {}

  async snapshot(now = Date.now()): Promise<NewsSnapshot> {
    if (!this.required) return { events: [], ready: true };
    if (!this.url) return { events: [], ready: false };
    if (now - this.attemptedAt >= 300_000) {
      this.attemptedAt = now;
      try {
        const response = await fetch(this.url, {
          signal: AbortSignal.timeout(12_000),
          cache: "no-store",
        });
        const payload: unknown = await response.json();
        if (!response.ok || !isRecord(payload) || !Array.isArray(payload.events)) {
          throw new Error("The news calendar is unavailable.");
        }
        const valid = payload.events.every(
          (event) =>
            isRecord(event) &&
            typeof event.title === "string" &&
            typeof event.time === "number" &&
            Number.isFinite(event.time) &&
            ["low", "medium", "high"].includes(String(event.impact)),
        );
        if (!valid) throw new Error("The news calendar returned invalid events.");
        this.events = payload.events as NewsEvent[];
        this.fetchedAt = now;
      } catch {
        // A short provider outage may use the last successful response; after
        // ten minutes no new automatic order can bypass an enabled News Guard.
      }
    }
    return {
      events: this.events,
      ready: this.fetchedAt > 0 && now - this.fetchedAt <= 600_000,
    };
  }
}
