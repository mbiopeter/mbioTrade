import { setTimeout as delay } from "node:timers/promises";
import {
  DerivPublicClient,
  fetchCandlePage,
  subscribeTicks,
} from "../src/lib/deriv-public";
import { WorkerAccount } from "./account";
import { loadWorkerConfig } from "./config";
import { WorkerEngine, type WorkerLog } from "./engine";
import { WorkerNews } from "./market";

const log: WorkerLog = (event, detail) => {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...detail }));
};

async function main(): Promise<void> {
  const config = await loadWorkerConfig();
  if (process.argv.includes("--check")) {
    log("configuration_valid", {
      mode: config.mode,
      symbol: config.preferences.symbol,
      timeframe: config.preferences.timeframe,
      combo: config.combo.name,
      newsGuard: config.newsGuard,
      calendarConfigured: Boolean(config.calendarUrl),
      accountMode: config.credentials?.accountMode ?? null,
    });
    return;
  }
  const shutdown = new AbortController();
  const market = new DerivPublicClient();
  const account = config.credentials ? new WorkerAccount(config.credentials) : null;
  const engine = new WorkerEngine(config, account, log);
  const news = new WorkerNews(config.calendarUrl, config.newsGuard);
  let needsHistory = true;
  let connected = false;
  let historyAt = 0;
  let heartbeatAt = 0;
  let retryDelayMs = 2000;
  let lastTick: { epoch: number; quote: number } | null = null;
  const unsubscribeState = market.onConnectionState((state) => {
    connected = state === "connected";
    engine.setMarketConnected(connected);
    if (connected) needsHistory = true;
    log("market_connection", { state });
  });
  const stop = () => {
    engine.stop();
    shutdown.abort();
    account?.close();
    market.close();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  let unsubscribeTicks: (() => void) | null = null;

  try {
    log("worker_started", {
      mode: config.mode,
      symbol: config.preferences.symbol,
      timeframe: config.preferences.timeframe,
      combo: config.combo.name,
      accountMode: config.credentials?.accountMode ?? null,
    });
    const connectionWaiting = (error: unknown) => {
      if (shutdown.signal.aborted) return;
      const message = (error instanceof Error ? error.message : "Connection failed.")
        .replaceAll(config.credentials?.token || "\0", "[redacted]")
        .replace(/(?:wss|https):\/\/\S*otp=\S+/gi, "[redacted session URL]");
      log("connection_retrying", { message });
    };
    // Both clients retain their retry loops. A temporary startup outage must
    // not terminate the worker before those loops can recover.
    await market.connect().catch(connectionWaiting);
    if (shutdown.signal.aborted) return;
    await account?.connect().catch(connectionWaiting);
    if (shutdown.signal.aborted) return;
    try {
      unsubscribeTicks = await subscribeTicks(
        market,
        config.preferences.symbol,
        (tick) => {
          lastTick = tick;
          engine.tick(tick.epoch, tick.quote);
        },
      );
    } catch (error) {
      if (shutdown.signal.aborted) return;
      throw error;
    }

    while (!shutdown.signal.aborted) {
      try {
        if (connected && (needsHistory || Date.now() - historyAt >= 60_000)) {
          const candles = await fetchCandlePage(
            market,
            config.preferences.symbol,
            config.preferences.timeframe,
            { count: 601 },
          );
          engine.setHistory(candles);
          // A tick can arrive while the historical request is in flight.
          const tick = lastTick as { epoch: number; quote: number } | null;
          if (tick) engine.tick(tick.epoch, tick.quote);
          historyAt = Date.now();
          needsHistory = false;
        }
        await engine.step(await news.snapshot());
        retryDelayMs = 2000;
        if (Date.now() - heartbeatAt >= 60_000) {
          heartbeatAt = Date.now();
          log("heartbeat", {
            mode: config.mode,
            marketConnected: connected,
            accountConnected: account?.connected ?? false,
            lastAnalysisAt: engine.lastAnalysisAt,
            automaticPaused: engine.automaticPaused,
          });
        }
      } catch (error) {
        if (shutdown.signal.aborted) break;
        const rawMessage =
          error instanceof Error ? error.message : "Worker cycle failed.";
        // Never print a token or OTP-bearing URL, including an echoed error.
        const message = rawMessage
          .replaceAll(config.credentials?.token || "\0", "[redacted]")
          .replace(/(?:wss|https):\/\/\S*otp=\S+/gi, "[redacted session URL]");
        log("cycle_waiting", { message });
        retryDelayMs = Math.min(30_000, retryDelayMs * 2);
      }
      await delay(retryDelayMs, undefined, { signal: shutdown.signal }).catch(
        () => undefined,
      );
    }
  } finally {
    unsubscribeTicks?.();
    unsubscribeState();
    stop();
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    log("worker_stopped", {});
  }
}

void main().catch((error: unknown) => {
  // Startup errors are validated config/auth descriptions; no configuration object is logged.
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      event: "startup_failed",
      message: error instanceof Error ? error.message : "Could not start the worker.",
    }),
  );
  process.exitCode = 1;
});
