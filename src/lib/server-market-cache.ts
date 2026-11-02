import { fetchMarket, FRAMES, type MarketPayload, type MarketSymbol } from "./v22/market.ts";

export const MARKET_CACHE_MS = 25_000;
export const MARKET_FAILURE_RETRY_MS = 8_000;

type MarketFetcher = (symbol: MarketSymbol) => Promise<MarketPayload>;
type CachedMarket = {
  payload: MarketPayload | null;
  expires: number;
  pending: Promise<MarketPayload> | null;
  failedAt: number;
  lastError: Error | null;
};

const cache = new Map<MarketSymbol, CachedMarket>();

export async function fetchMarketShared(
  symbol: MarketSymbol,
  loader: MarketFetcher = fetchMarket,
  clock: () => number = Date.now,
): Promise<MarketPayload> {
  let entry = cache.get(symbol);
  if (!entry) {
    entry = { payload: null, expires: 0, pending: null, failedAt: -Infinity, lastError: null };
    cache.set(symbol, entry);
  }
  const now = clock();
  if (entry.payload && now < entry.expires) return entry.payload;
  if (entry.pending) return entry.pending;
  if (entry.lastError && now - entry.failedAt < MARKET_FAILURE_RETRY_MS) throw entry.lastError;
  const item = entry;
  const task = loader(symbol)
    .then((payload) => {
      if (payload.symbol !== symbol || FRAMES.some((frame) => (payload.frames[frame]?.length ?? 0) < 60)) {
        throw new Error("Provider returned incomplete or mismatched market candles");
      }
      item.payload = payload;
      item.expires = clock() + MARKET_CACHE_MS;
      item.lastError = null;
      return payload;
    })
    .catch((reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error("Market provider unavailable");
      item.payload = null;
      item.expires = 0;
      item.lastError = error;
      item.failedAt = clock();
      throw error;
    })
    .finally(() => { item.pending = null; });
  entry.pending = task;
  return task;
}
