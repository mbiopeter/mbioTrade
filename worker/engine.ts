import { localExitReached, signalAlreadyTraded } from "../src/lib/execution";
import { assertOrderBalance, OrderFundingError } from "../src/lib/order-funding";
import { canAutoTrade, collectAccountOpenTrades } from "../src/lib/risk";
import { generateSignal, hasNewsRisk } from "../src/lib/strategies";
import {
  confirmedMarketCandles,
  isConfirmedHistoryCurrent,
  MAX_ANALYSIS_CANDLES,
} from "../src/lib/strategy-engine/candles";
import type { Candle, Signal } from "../src/lib/types";
import type { BrokerSnapshot, WorkerAccountPort } from "./account";
import type { WorkerConfig } from "./config";
import { appendTick, type NewsSnapshot } from "./market";

export type WorkerLog = (event: string, detail: Record<string, unknown>) => void;

/** Serial event loop shared by the CLI and deterministic, offline tests. */
export class WorkerEngine {
  private candles: Candle[] = [];
  private marketConnected = false;
  private lastTickAt = 0;
  private lastTickEpoch = 0;
  private historyReady = false;
  private stopped = false;
  private busy = false;
  private snapshot: BrokerSnapshot | null = null;
  private lastBrokerSync = 0;
  private lastLoggedSignal = "";
  private lastWaitReason = "";
  private attempted = new Set<string>();
  private attemptedCandle = -1;
  private readonly startupCandle: number;
  private readonly startupReadyAt: number;
  private readonly pendingExits = new Map<number, number>();
  automaticPaused: string | null = null;
  lastAnalysisAt = 0;

  constructor(
    private readonly config: WorkerConfig,
    private readonly account: WorkerAccountPort | null,
    private readonly log: WorkerLog,
    private readonly now: () => number = Date.now,
    private readonly makeSignal: typeof generateSignal = generateSignal,
  ) {
    this.startupCandle =
      Math.floor(now() / 1000 / config.preferences.timeframe) *
      config.preferences.timeframe;
    this.startupReadyAt = now() + 60_000;
  }

  setMarketConnected(connected: boolean): void {
    this.marketConnected = connected;
    if (!connected) {
      this.historyReady = false;
      this.lastTickAt = 0;
    }
  }

  setHistory(candles: Candle[]): void {
    this.candles = candles.slice(-(MAX_ANALYSIS_CANDLES + 1));
    this.historyReady = this.candles.length >= 60;
  }

  tick(epoch: number, quote: number): void {
    if (
      !Number.isFinite(epoch) ||
      !Number.isFinite(quote) ||
      quote <= 0 ||
      epoch < this.lastTickEpoch
    )
      return;
    this.candles = appendTick(
      this.candles,
      epoch,
      quote,
      this.config.preferences.timeframe,
    );
    this.lastTickEpoch = epoch;
    this.lastTickAt = this.now();
  }

  stop(): void {
    this.stopped = true;
  }

  private freshMarket(): boolean {
    const now = this.now();
    return (
      this.marketConnected &&
      this.historyReady &&
      this.lastTickAt > 0 &&
      now - this.lastTickAt < 120_000 &&
      Math.abs(now - this.lastTickEpoch * 1000) < 120_000
    );
  }

  private wait(reason: string): void {
    if (this.lastWaitReason === reason) return;
    this.lastWaitReason = reason;
    this.log("waiting", { reason });
  }

  private signal(news: NewsSnapshot): Signal | null {
    const { preferences, combo } = this.config;
    const confirmed = confirmedMarketCandles(
      this.candles,
      preferences.timeframe,
      this.now(),
    );
    if (!isConfirmedHistoryCurrent(confirmed, preferences.timeframe, this.now()))
      return null;
    return this.makeSignal(
      confirmed,
      preferences.symbol,
      preferences.timeframe,
      combo,
      preferences.risk.atrStop,
      preferences.risk.riskReward,
      news.events,
    );
  }

  private entryBlock(snapshot: BrokerSnapshot, signal: Signal): string | null {
    if (!snapshot.complete)
      return "Deriv history is incomplete; automatic entries are paused.";
    if (signalAlreadyTraded(snapshot.trades, signal))
      return "This completed-candle signal already has a recorded order.";
    const risk = this.config.preferences.risk;
    const gate = canAutoTrade(
      signal,
      collectAccountOpenTrades(snapshot.trades, snapshot.portfolio),
      snapshot.trades,
      risk.maxOpenDemoTrades,
      risk.marginBudget,
      risk.stake,
      risk.maxDailyDemoLoss,
      risk.cooldownMinutes,
      {
        realizedPnl: snapshot.dailyRealizedPnl,
        latestTradeAt: snapshot.latestTradeAt,
        now: this.now(),
      },
    );
    if (!gate.ok) return gate.reason || "The risk limits block this entry.";
    try {
      assertOrderBalance(risk.stake, snapshot.balance, snapshot.currency);
    } catch (error) {
      return error instanceof Error ? error.message : "Deriv balance is unavailable.";
    }
    return null;
  }

  async step(news: NewsSnapshot): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      if (!this.freshMarket())
        return this.wait("Waiting for fresh Deriv ticks and candle history.");
      const { preferences, mode } = this.config;
      if (
        mode === "automatic" &&
        this.account?.connected &&
        (!this.snapshot || this.now() - this.lastBrokerSync >= 30_000)
      ) {
        this.snapshot = await this.account.refresh();
        this.lastBrokerSync = this.now();
      }
      if (this.stopped) return;
      if (!this.freshMarket())
        return this.wait("Waiting for a fresh price after account synchronization.");

      // Only positions this process opened have local chart stop metadata.
      // Broker-installed cash stops protect all positions after a restart.
      if (mode === "automatic" && this.account?.connected && this.snapshot) {
        for (const trade of this.snapshot.trades) {
          const id = trade.contractId;
          if (
            !id ||
            !localExitReached(
              trade,
              preferences.symbol,
              this.candles.at(-1)?.close ?? NaN,
            ) ||
            this.now() - (this.pendingExits.get(id) ?? -Infinity) < 30_000
          )
            continue;
          this.pendingExits.set(id, this.now());
          try {
            await this.account.sell(trade, {
              symbol: preferences.symbol,
              price: this.candles.at(-1)?.close ?? NaN,
            });
            this.lastBrokerSync = 0;
            this.log("close_requested", { contractId: id, symbol: trade.symbol });
          } catch {
            this.log("close_waiting", {
              contractId: id,
              reason: "Deriv will be reconciled before another close attempt.",
            });
            this.lastBrokerSync = 0;
          }
          if (this.stopped) return;
        }
      }

      if (this.config.newsGuard && !news.ready)
        return this.wait("News Guard is waiting for a current calendar.");
      this.lastAnalysisAt = this.now();
      const signal = this.signal(news);
      if (!signal) return this.wait("Analyzing; no qualified signal.");
      if (signal.id !== this.lastLoggedSignal) {
        this.lastLoggedSignal = signal.id;
        this.log("signal", {
          id: signal.id,
          symbol: signal.symbol,
          direction: signal.direction,
          confidence: signal.confidence,
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          combo: this.config.combo.name,
        });
      }
      if (mode !== "automatic") return;
      if (this.automaticPaused) return this.wait(this.automaticPaused);
      if (!this.account?.connected)
        return this.wait("Waiting for the connected Deriv account.");
      const candle = this.candles.at(-1)?.time ?? 0;
      if (candle <= this.startupCandle || this.now() < this.startupReadyAt) {
        return this.wait(
          "Startup: automatic entries begin on a new candle after the initial 60 seconds.",
        );
      }
      const confirmedCandle =
        confirmedMarketCandles(this.candles, preferences.timeframe, this.now()).at(-1)
          ?.time ?? 0;
      if (this.attemptedCandle !== confirmedCandle) {
        this.attemptedCandle = confirmedCandle;
        this.attempted.clear();
      }
      if (this.attempted.has(signal.id)) return;
      if (
        this.config.newsGuard &&
        hasNewsRisk(signal.symbol, news.events, this.now())
      ) {
        return this.wait("A high-impact event blocks this entry.");
      }

      // Known risk blocks use the periodic broker snapshot instead of polling
      // portfolio/history on every tick. Eligible buys still reconcile again.
      const existingBlock = this.snapshot
        ? this.entryBlock(this.snapshot, signal)
        : null;
      if (existingBlock) return this.wait(existingBlock);

      // Every entry rechecks the broker, including orders opened on another device.
      const snapshot = await this.account.refresh();
      this.snapshot = snapshot;
      this.lastBrokerSync = this.now();
      if (this.stopped || !this.freshMarket() || !this.account.connected) return;
      const current = this.signal(news);
      if (!current || current.id !== signal.id) return;
      const finalBlock = this.entryBlock(snapshot, current);
      if (finalBlock) return this.wait(finalBlock);
      const risk = preferences.risk;

      this.attempted.add(current.id);
      let abortedBeforeBuy = false;
      try {
        const trade = await this.account.buy(
          current,
          risk.stake,
          risk.multiplier,
          snapshot.currency,
          () => {
            if (
              this.stopped ||
              !this.account?.connected ||
              !this.freshMarket() ||
              (this.config.newsGuard &&
                (!news.ready ||
                  hasNewsRisk(current.symbol, news.events, this.now()))) ||
              this.signal(news)?.id !== current.id
            ) {
              abortedBeforeBuy = true;
              throw new Error(
                "Worker state or market data changed before the buy was sent.",
              );
            }
          },
        );
        this.lastBrokerSync = 0;
        this.lastWaitReason = "";
        this.log("trade_opened", {
          contractId: trade.contractId,
          symbol: trade.symbol,
          accountMode: this.config.credentials?.accountMode,
          stake: trade.stake,
        });
      } catch (error) {
        if (error instanceof OrderFundingError) {
          this.lastBrokerSync = 0;
          this.wait(error.message);
          return;
        }
        if (abortedBeforeBuy) {
          this.wait(
            "The unsent order was discarded because the worker or market state changed.",
          );
          return;
        }
        // A lost buy response is ambiguous. Never automatically replay it, even
        // if a different signal appears, until an operator checks Deriv and restarts.
        this.automaticPaused =
          "Order failed or its result is uncertain. Check Deriv and restart the worker before resuming entries.";
        this.lastBrokerSync = 0;
        this.wait(this.automaticPaused);
      }
    } finally {
      this.busy = false;
    }
  }
}
