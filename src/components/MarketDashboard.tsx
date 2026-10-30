"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  BellOff,
  Check,
  ChartNoAxesCombined,
  Clock3,
  Download,
  ExternalLink,
  Info,
  RefreshCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Volume2,
} from "lucide-react";
import { LiveChart } from "@/components/LiveChart";
import { ConnectionRetryToast } from "@/components/ConnectionRetryToast";
import { useHistoricalCandles } from "@/components/useHistoricalCandles";
import { useSignalLedger } from "@/components/useSignalLedger";
import { LEDGER_KEY, parseLedger } from "@/lib/v26-signals";
import {
  exportSignalsCsv,
  formatSignalResult,
  signalPage,
} from "@/lib/signal-history";
import { StrengthGauge } from "@/components/StrengthGauge";
import { DashboardSkeletonCards } from "@/components/DashboardSkeleton";
import { ema } from "@/lib/indicators";
import { HIGHER_FRAMES, MOMENTUM_WINDOWS, type MomentumDays } from "@/lib/v231/momentum";
import { liveGaugeScore } from "@/lib/v231/gauge";
import { reconnectionDelay, HTTP_REFRESH_MS, HTTP_TIMEOUT_MS, STREAM_FIRST_TICK_TIMEOUT_MS, STREAM_STALE_TIMEOUT_MS } from "@/lib/reconnection";
import {
  FRAMES,
  FRAME_LABELS,
  INSTRUMENTS,
  type Frame,
  type MarketPayload,
  type MarketSymbol,
} from "@/lib/v22/market";
import {
  evaluateLiveFrame,
  inspectConfluence,
  type FrameAnalysis,
  type IndicatorVote,
} from "@/lib/v22/analysis";

type FeedState = {
  loading: boolean;
  error: string | null;
  payload: MarketPayload | null;
  checkedAt: number | null;
  quote: number | null;
  quoteAt: number | null;
  streaming: boolean;
  streamRetrying: boolean;
  requestSymbol: MarketSymbol | null;
};

const EMPTY: FeedState = {
  loading: true,
  error: null,
  payload: null,
  checkedAt: null,
  quote: null,
  quoteAt: null,
  streaming: false,
  streamRetrying: false,
  requestSymbol: null,
};

const EMPTY_DATA: MarketPayload = {
  symbol: "XAUUSD",
  provider: "deriv",
  providerName: "Data unavailable",
  sourceNote: "",
  fetchedAt: 0,
  frames: {},
  warnings: [],
  streamSymbol: null,
};

function price(value: number | null | undefined, precision: number) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(4);
}
function signedPrice(value: number | null | undefined, precision: number) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value > 0 ? "+" : ""}${value.toFixed(4)}`;
}
function percent(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
function time(value: number | null | undefined) {
  return value
    ? new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
    : "—";
}
function signalDateTime(value: number) {
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))} EAT`;
}

function dateTime(value: number) {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function statusClass(status: string) {
  return status === "BUY" || status === "UP" ? "up" : status === "SELL" || status === "DOWN" ? "down" : "flat";
}
function useBrowserSetting<T>(name: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(name);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {

    }
  }, [name]);
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(name, JSON.stringify(next));
      } catch {

      }
    },
    [name],
  );
  return [value, update];
}

function useMarket(symbol: MarketSymbol) {
  const [feed, setFeed] = useState<FeedState>(EMPTY);
  const generation = useRef(0);
  const requestNumber = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    const id = generation.current;
    const request = ++requestNumber.current;
    if (timer.current !== null) clearTimeout(timer.current);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setFeed((state) => ({
      ...state,
      loading: state.payload === null,
      requestSymbol: symbol,
    }));
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const details = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
        throw new Error(details?.detail ?? details?.error ?? `Market feed returned HTTP ${response.status}`);
      }
      const payload = await response.json() as MarketPayload;
      if (!payload.frames || payload.symbol !== symbol) throw new Error("Unexpected market response");
      if (!mounted.current || generation.current !== id || requestNumber.current !== request) return;
      failures.current = 0;
      setFeed((state) => ({
        ...state,
        loading: false,
        payload,
        error: null,
        checkedAt: Date.now(),
        requestSymbol: symbol,
        streamRetrying: payload.provider === "deriv" && state.payload?.provider === "deriv"
          ? state.streamRetrying
          : false,
        quote: state.payload?.symbol === symbol ? state.quote : null,
        quoteAt: state.payload?.symbol === symbol ? state.quoteAt : null,
      }));
      timer.current = setTimeout(() => void reload(), HTTP_REFRESH_MS);
    } catch (error) {
      if (!mounted.current || generation.current !== id || requestNumber.current !== request) return;
      const attempts = ++failures.current;


      setFeed((state) => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Market feed unavailable",
        requestSymbol: symbol,
        quote: null,
        quoteAt: null,
        streaming: false,
      }));
      timer.current = setTimeout(() => void reload(), reconnectionDelay(attempts));
    } finally {
      clearTimeout(timeout);
      if (abort.current === controller) abort.current = null;
    }
  }, [symbol]);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    failures.current = 0;
    setFeed(EMPTY);
    void reload();

    const restore = () => { if (mounted.current) void reload(); };
    const onVisible = () => { if (document.visibilityState === "visible") restore(); };
    window.addEventListener("online", restore);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      generation.current += 1;
      requestNumber.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
      abort.current?.abort();
      window.removeEventListener("online", restore);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  useEffect(() => {
    const stream = feed.payload?.provider === "deriv" ? feed.payload.streamSymbol : null;
    if (!stream) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let firstTickTimeout: ReturnType<typeof setTimeout> | null = null;
    let healthCheck: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;
    let lastTick = 0;

    const clearWatchdogs = () => {
      if (firstTickTimeout !== null) clearTimeout(firstTickTimeout);
      if (healthCheck !== null) clearInterval(healthCheck);
      firstTickTimeout = null;
      healthCheck = null;
    };
    const retryConnection = () => {
      if (closed || retry !== null) return;
      clearWatchdogs();
      const previous = socket;
      socket = null;
      try { previous?.close(); } catch {  }
      setFeed((state) => state.payload?.symbol === symbol
        ? { ...state, streaming: false, streamRetrying: true, quote: null, quoteAt: null }
        : state);
      retry = setTimeout(() => { retry = null; connect(); }, reconnectionDelay(++attempts));
    };
    function connect() {
      if (closed) return;
      let candidate: WebSocket;
      try { candidate = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public"); }
      catch { retryConnection(); return; }
      socket = candidate;
      lastTick = 0;
      candidate.onopen = () => {
        if (closed || candidate !== socket) return;
        try { candidate.send(JSON.stringify({ ticks: stream, subscribe: 1, req_id: 901 })); }
        catch { retryConnection(); return; }
        firstTickTimeout = setTimeout(() => {
          if (candidate === socket && !lastTick) retryConnection();
        }, STREAM_FIRST_TICK_TIMEOUT_MS);
        healthCheck = setInterval(() => {
          if (candidate === socket && lastTick && Date.now() - lastTick > STREAM_STALE_TIMEOUT_MS) retryConnection();
        }, 30_000);
      };
      candidate.onmessage = (event) => {
        if (candidate !== socket || closed) return;
        try {
          const value = JSON.parse(String(event.data)) as {
            msg_type?: string;
            tick?: { quote?: number | string; epoch?: number; symbol?: string };
            error?: unknown;
          };
          if (value.error) { retryConnection(); return; }
          if (value.msg_type !== "tick" || !value.tick || value.tick.symbol !== stream) return;
          const quote = Number(value.tick.quote);
          const epoch = Number(value.tick.epoch);
          if (!Number.isFinite(quote) || quote <= 0 || !Number.isFinite(epoch) || Math.abs(Date.now() / 1000 - epoch) > 120) return;
          lastTick = Date.now();
          attempts = 0; // Reset after actual data, not just the socket opening.
          if (firstTickTimeout !== null) { clearTimeout(firstTickTimeout); firstTickTimeout = null; }
          setFeed((state) => state.payload?.symbol === symbol
            ? { ...state, quote, quoteAt: epoch * 1000, streaming: true, streamRetrying: false }
            : state);
        } catch {  }
      };
      candidate.onclose = () => { if (candidate === socket) retryConnection(); };
      candidate.onerror = () => { if (candidate === socket) retryConnection(); };
    }
    connect();
    return () => {
      closed = true;
      if (retry !== null) clearTimeout(retry);
      clearWatchdogs();
      try { socket?.close(); } catch {  }
    };
  }, [symbol, feed.payload?.provider, feed.payload?.streamSymbol]);

  return { feed, reload };
}

function ConfidenceBar({ score }: { score: number }) {
  return (
    <div className="mbiotraders-confidence-bar">
      <div className="mbiotraders-confidence-fill" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
  );
}

type FrameTileProps = {
  analysis: FrameAnalysis;
  active: boolean;
  onClick: () => void;
  direction?: "BUY" | "SELL" | "NEUTRAL";
  changePct?: number | null;
};

function FrameTile({
  analysis,
  active,
  onClick,
  direction,
  changePct,
}: FrameTileProps) {
  const effective = direction ?? analysis.direction;
  const label =
    effective === "BUY" ? "Bullish" :
    effective === "SELL" ? "Bearish" : "Neutral";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`mbiotraders-frame-tile ${statusClass(effective)} ${active ? "selected" : ""}`}
    >
      <span className="mbiotraders-frame-time">{analysis.label}</span>
      <span className="mbiotraders-frame-dir">
        {effective === "BUY" ? (
          <TrendingUp size={22} />
        ) : effective === "SELL" ? (
          <TrendingDown size={22} />
        ) : (
          <Clock3 size={20} />
        )}
      </span>
      <span className="mbiotraders-frame-text">{label}</span>
      {changePct !== undefined && (
        <small className="mbiotraders-momentum-change">
          {changePct === null
            ? "Missing data"
            : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
        </small>
      )}
    </button>
  );
}

function IndicatorCard({ vote }: { vote: IndicatorVote }) {
  const direction = vote.vote > 0 ? "up" : vote.vote < 0 ? "down" : "flat";
  const label = vote.vote > 0 ? "Buy" : vote.vote < 0 ? "Sell" : "Neutral";

  return (
    <div className="mbiotraders-indicator-card" title={vote.description}>
      <div className="mbiotraders-mini-graphic" aria-hidden="true">
        <span />
      </div>
      <div className="mbiotraders-indicator-copy">
        <strong>{vote.name}</strong>
        <span className={`mbiotraders-pill ${direction}`}>{label}</span>
      </div>
    </div>
  );
}

function StatsCard({ signals }: { signals: { resultR: number | null }[] }) {
  const wins = signals.filter((signal) => (signal.resultR ?? 0) > 0);
  const losses = signals.filter((signal) => (signal.resultR ?? 0) < 0);
  const total = signals.length;
  const winRate = total ? Math.round((wins.length / total) * 100) : 0;
  const avgWin = wins.length ? wins.reduce((sum, item) => sum + (item.resultR ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((sum, item) => sum + (item.resultR ?? 0), 0) / losses.length : 0;
  const profitFactor = Math.abs(losses.reduce((sum, item) => sum + (item.resultR ?? 0), 0)) > 0
    ? wins.reduce((sum, item) => sum + (item.resultR ?? 0), 0) / Math.abs(losses.reduce((sum, item) => sum + (item.resultR ?? 0), 0))
    : wins.length ? wins.reduce((sum, item) => sum + (item.resultR ?? 0), 0) : 0;

  return (
    <div className="mbiotraders-stats-grid">
      <div className="mbiotraders-win-dial" style={{ background: `conic-gradient(#28e0a0 0 ${winRate}%, rgba(255,255,255,.06) ${winRate}% 100%)` }}>
        <div><strong>{total ? `${winRate}%` : "—"}</strong><span>Win Rate</span></div>
      </div>
      <div className="mbiotraders-stats-list">
        <div><span>Total Signals</span><strong>{total}</strong></div>
        <div><span>Winning</span><strong className="up">{wins.length}</strong></div>
        <div><span>Losing</span><strong className="down">{losses.length}</strong></div>
        <div><span>Avg R (Win)</span><strong className="up">{avgWin ? `+${avgWin.toFixed(1)}R` : "—"}</strong></div>
        <div><span>Avg R (Loss)</span><strong className="down">{avgLoss ? `${avgLoss.toFixed(1)}R` : "—"}</strong></div>
        <div><span>Profit Factor</span><strong>{profitFactor ? profitFactor.toFixed(2) : "—"}</strong></div>
      </div>
    </div>
  );
}

function beep(context: AudioContext) {


  const now = context.currentTime;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-14, now);
  limiter.ratio.setValueAtTime(8, now);
  limiter.attack.setValueAtTime(0.004, now);
  limiter.release.setValueAtTime(0.16, now);
  limiter.connect(context.destination);
  [740, 980, 1240].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.17;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.42, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
    oscillator.connect(gain).connect(limiter);
    oscillator.start(start);
    oscillator.stop(start + 0.20);
  });
}

export function MarketDashboard() {
  const [symbol, setSymbol] = useBrowserSetting<MarketSymbol>(
    "mbio-mbiotraders-symbol",
    "XAUUSD",
  );
  const [frame, setFrame] = useBrowserSetting<Frame>(
    "mbio-mbiotraders-frame",
    300,
  );
  const [audible, setAudible] = useBrowserSetting<boolean>(
    "mbio-mbiotraders-audio",
    false,
  );
  const [momentumDays, setMomentumDays] = useBrowserSetting<MomentumDays>(
    "mbio-mbiotraders-momentum-days-v26",
    7,
  );
  const [now, setNow] = useState(0);
  const [recentPage, setRecentPage] = useState(0);
  const [alerted, setAlerted] = useState<
    { id: string; symbol: MarketSymbol; time: number; status: string }[]
  >([]);
  const audio = useRef<AudioContext | null>(null);
  const previousSignal = useRef<string | null>(null);
  const initialized = useRef(false);
  const { feed, reload } = useMarket(symbol);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    initialized.current = false;
    previousSignal.current = null;
  }, [symbol]);

  const instrument =
    INSTRUMENTS.find((item) => item.symbol === symbol) ?? INSTRUMENTS[0];
  const payload = feed.payload?.symbol === symbol ? feed.payload : EMPTY_DATA;
  const safeMomentumDays = MOMENTUM_WINDOWS.includes(momentumDays) ? momentumDays : 7;
  const setup = useMemo(
    () => inspectConfluence(payload, now, safeMomentumDays),
    [payload, Math.floor(now / 10_000), safeMomentumDays],
  );
  const [needsOlder5, setNeedsOlder5] = useState(false);
  useEffect(() => {
    try {
      const saved = parseLedger(localStorage.getItem(LEDGER_KEY));
      setNeedsOlder5(Boolean(saved.active[symbol]));
    } catch {
      setNeedsOlder5(false);
    }
  }, [symbol]);
  const chartHistory = useHistoricalCandles({
    symbol,
    frame,
    payload: feed.payload?.symbol === symbol ? feed.payload : null,
  });
  const old5 = useHistoricalCandles({
    symbol,
    frame: 300,
    payload: feed.payload?.symbol === symbol ? feed.payload : null,
    enabled: frame !== 300 && needsOlder5,
  });
  const chartCandles = chartHistory.candles;
  const tracked5 =
    frame === 300
      ? chartHistory.candles
      : needsOlder5
        ? old5.candles
        : (payload.frames[300] ?? []);
  const tracker = useSignalLedger({
    symbol,
    provider: payload.provider,
    setup,
    now,
    isLive:
      !feed.error &&
      Boolean(feed.payload) &&
      now - payload.fetchedAt < 120_000,
    bars5: tracked5,
    bars15: payload.frames[900] ?? [],
    barsH1: payload.frames[3600] ?? [],
    historyLoading: frame === 300 ? chartHistory.loading : old5.loading,
  });
  useEffect(() => {
    setNeedsOlder5(Boolean(tracker.active));
  }, [tracker.active, symbol]);
  const activeSignal = tracker.active;
  const pendingSignal = tracker.pending;
  const latestSignals = tracker.historyAll;
  const displayedHistory = signalPage(latestSignals, recentPage);

  const downloadSignals = () => {
    if (!latestSignals.length) return;

    const csv = exportSignalsCsv(latestSignals);
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `mbiotraders-signals-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const quoteFresh = feed.quoteAt !== null && now - feed.quoteAt < 120_000;
  const selected = useMemo(() => {
    if (feed.streaming && quoteFresh && feed.quote !== null && feed.quoteAt !== null && payload.provider === "deriv") {
      return evaluateLiveFrame(chartCandles, frame, now, feed.quote, feed.quoteAt);
    }
    return setup.frames[frame];
  }, [chartCandles, frame, now, feed.streaming, feed.quote, feed.quoteAt, quoteFresh, payload.provider, setup.frames]);
  const emaCloses = useMemo(() => chartCandles.map(c => c.close), [chartCandles]);
  const ema50 = useMemo(() => ema(emaCloses, 50).at(-1) ?? null, [emaCloses]);
  const ema200 = useMemo(() => ema(emaCloses, 200).at(-1) ?? null, [emaCloses]);
  const last = chartCandles.at(-1) ?? null;
  const previous = chartCandles.at(-2) ?? null;
  const currentPrice = quoteFresh ? feed.quote : last?.close ?? null;
  const lastCompleted = useMemo(
    () =>
      chartCandles.findLast((candle) => (candle.time + frame) * 1000 <= now) ?? null,
    [chartCandles, frame, Math.floor(now / 10_000)],
  );
  const typicalRange = useMemo(() => {
    const bars = chartCandles.slice(-20);
    return bars.length ? bars.reduce((total, bar) => total + bar.high - bar.low, 0) / bars.length : 0;
  }, [chartCandles]);

  const gaugeScore = feed.streaming && quoteFresh
    ? liveGaugeScore(setup.frames[frame].score, feed.quote, lastCompleted?.close ?? null, typicalRange)
    : selected.score;
  const movement = last && previous ? last.close - previous.close : null;
  const movementPercent = last && previous && previous.close > 0 ? (movement! / previous.close) * 100 : null;
  const isLive =
    !feed.error &&
    Boolean(feed.payload) &&
    (payload.provider === "twelvedata"
      ? now - payload.fetchedAt < 120_000
      : quoteFresh || now - payload.fetchedAt < 120_000);
  const displayedSignal = activeSignal?.direction ?? "WAIT";

  const canAlert = isLive && activeSignal !== null && now - activeSignal.openedAt < 600000;
  useEffect(() => {
    if (!tracker.ready) return;
    if (!initialized.current) { initialized.current = true; previousSignal.current = activeSignal?.id ?? null; return; }
    if (!canAlert || !activeSignal || activeSignal.id === previousSignal.current) return;
    previousSignal.current = activeSignal.id;
    setAlerted(items => [{ id: activeSignal.id, symbol, time: activeSignal.openedAt, status: activeSignal.direction }, ...items].slice(0, 8));
    if (audible) void audio.current?.resume().then(() => { if (audio.current) beep(audio.current); });
  }, [canAlert, activeSignal?.id, activeSignal?.direction, activeSignal?.openedAt, symbol, audible, tracker.ready]);

  const enableAlert = async () => {
    if (!audible) {
      try {
        audio.current ??= new AudioContext();
        await audio.current.resume();
        beep(audio.current);
        setAudible(true);
      } catch {
        setAudible(false);
      }
    } else {
      setAudible(false);
    }
  };

  const frameDirection = (current: Frame) => HIGHER_FRAMES.includes(current as typeof HIGHER_FRAMES[number])
    ? setup.momentum.readings[current as typeof HIGHER_FRAMES[number]].direction
    : setup.frames[current].direction;
  const alignmentCount = FRAMES.filter((current) => setup.bias !== "NEUTRAL" && frameDirection(current) === setup.bias).length;
  const updated = feed.checkedAt ? dateTime(feed.checkedAt) : "—";
  const signalAge = activeSignal ? Math.max(0, Math.round((now - activeSignal.openedAt) / 60000)) : null;


  const keyLevels = useMemo(() => {
    if (!(payload.frames[300] ?? []).length || currentPrice === null) {
      return {
        resistance2: null,
        resistance1: null,
        currentPrice,
        support1: null,
        support2: null,
      };
    }
    const completed5 = (payload.frames[300] ?? []).filter(c => (c.time + 300) * 1000 <= now);
    const recent36 = completed5.slice(-36);
    const recent72 = completed5.slice(-72);
    const highs36 = recent36.map((bar) => bar.high);
    const highs72 = recent72.map((bar) => bar.high);
    const lows36 = recent36.map((bar) => bar.low);
    const lows72 = recent72.map((bar) => bar.low);
    return {
      resistance2: highs72.length ? Math.max(...highs72) : null,
      resistance1: highs36.length ? Math.max(...highs36) : null,
      currentPrice,
      support1: lows36.length ? Math.min(...lows36) : null,
      support2: lows72.length ? Math.min(...lows72) : null,
    };
  }, [payload, currentPrice, Math.floor(now / 300000)]);

  const recentForStats = latestSignals;
  const displayIndicators = useMemo(() => {
    const byName = (part: string) => selected.indicators.find(item => item.name.includes(part));
    const chosen = [
      byName("Price / EMA 50"),
      byName("ADX"),
      byName("Williams"),
      byName("RSI (14)"),
      byName("CCI"),
      byName("Awesome"),
      byName("MACD"),
      byName("Stochastic"),
      byName("Bull / Bear"),
    ];
    return chosen.filter((item): item is IndicatorVote => Boolean(item));
  }, [selected]);
  const tradingViewUrl = `https://www.tradingview.com/symbols/${symbol}/`;
  const sourceMatches = !activeSignal || activeSignal.provider === payload.provider;
  const activeReason = activeSignal
    ? "Active paper signal — indicator changes cannot cancel it. Only verified TP/SL can close it."
    : pendingSignal
      ? `Awaiting two confirmed 5m closes beyond ${price(pendingSignal.level, 4)} (${pendingSignal.direction === "BUY" ? "resistance" : "support"}).`
      : setup.reason;
  const floatingReturn =
    activeSignal && sourceMatches && currentPrice !== null
      ? ((activeSignal.direction === "BUY" ? 1 : -1) *
          (currentPrice - activeSignal.entry)) /
        Math.abs(activeSignal.entry - activeSignal.stop)
      : null;
  const signalTimeLabel = activeSignal
    ? `${time(activeSignal.openedAt)}${signalAge !== null ? ` (${signalAge} min ago)` : ""}`
    : "—";

  const retrying =
    feed.requestSymbol === symbol &&
    (feed.error !== null || feed.streamRetrying);

  return (
    <main className="mbiotraders-page">
      <header className="mbiotraders-topbar">
        <div className="mbiotraders-topbar-primary">
          <a
            className="mbiotraders-brand-link"
            href="https://mbiopeter.co.ke"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the mbioPeter portfolio"
          >
            <span className="mbiotraders-brand-icon" aria-hidden="true">
              <ChartNoAxesCombined size={23} strokeWidth={2.3} />
            </span>
            <span className="mbiotraders-brand-copy">
              <h1>mbio<span>Traders</span></h1>
              <small>Real-Time Market Signals</small>
            </span>
          </a>

          <div className="mbiotraders-topbar-context">
            <span className="mbiotraders-topbar-overline">MARKET INTELLIGENCE</span>
            <span className="mbiotraders-topbar-context-line">
              <strong>{symbol}</strong>
              <span aria-hidden="true">/</span>
              <span>{FRAME_LABELS[frame]} chart</span>
              <span className="mbiotraders-context-divider" aria-hidden="true" />
              <span>{safeMomentumDays}D trend momentum</span>
            </span>
          </div>

          <div className="mbiotraders-header-actions">
            <div className="mbiotraders-topbar-feed">
              <span className={`mbiotraders-live-dot ${isLive ? "" : "off"}`} />
              <div>
                <strong>{isLive ? "Market feed live" : "Awaiting market data"}</strong>
                <small>{feed.payload?.symbol === symbol ? payload.providerName : "Connecting to provider"}</small>
              </div>
            </div>
            <div className="mbiotraders-topbar-clock">
              <Clock3 size={13} aria-hidden="true" />
              <span>{now ? dateTime(now) : "—"} EAT</span>
            </div>
            <button
              type="button"
              className={`mbiotraders-alert-button ${audible ? "on" : ""}`}
              onClick={() => void enableAlert()}
              aria-pressed={audible}
            >
              {audible ? <Volume2 size={17} /> : <BellOff size={17} />}
              Alerts {audible ? "On" : "Off"}
            </button>
          </div>
        </div>

        <div className="mbiotraders-topbar-secondary">
          <div className="mbiotraders-toolbar-group markets">
            <span className="mbiotraders-toolbar-label">MARKETS</span>
            <div className="mbiotraders-symbol-tabs" aria-label="Instrument selection">
              {INSTRUMENTS.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  className={`mbiotraders-symbol-tab ${symbol === item.symbol ? "active" : ""}`}
                  onClick={() => setSymbol(item.symbol)}
                  aria-pressed={symbol === item.symbol}
                >
                  {item.symbol === "XAUUSD" ? (
                    <span className="mbiotraders-gold-mark">◆</span>
                  ) : (
                    <span className="mbiotraders-flag-mark">
                      {item.symbol === "EURUSD" ? "🇪🇺" :
                        item.symbol === "GBPUSD" ? "🇬🇧" :
                          item.symbol === "USDJPY" ? "🇯🇵" :
                            item.symbol === "AUDUSD" ? "🇦🇺" : "🇨🇦"}
                    </span>
                  )}
                  <span>{item.symbol}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mbiotraders-toolbar-group timeframes">
            <span className="mbiotraders-toolbar-label">TIMEFRAME</span>
            <div className="mbiotraders-timeframe-tabs" aria-label="Timeframe selection">
              {FRAMES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`mbiotraders-timeframe-tab ${frame === item ? "active" : ""}`}
                  onClick={() => setFrame(item)}
                  aria-pressed={frame === item}
                >
                  {FRAME_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <ConnectionRetryToast contextKey={symbol} retrying={retrying} />

      {(feed.loading || !feed.payload || feed.payload.symbol !== symbol)
        ? <DashboardSkeletonCards />
        : <section className="mbiotraders-grid">
          <section className="mbiotraders-card mbiotraders-chart-card">
            <div className="mbiotraders-card-head mbiotraders-chart-head">
              <div>
                <div className="mbiotraders-chart-title">{instrument.symbol} · {FRAME_LABELS[frame]} · FX</div>
                <div className="mbiotraders-chart-price-row">
                  <span className={`mbiotraders-live-dot large ${isLive ? "" : "off"}`} />
                  <span className="mbiotraders-price-label">O</span><strong>{price(last?.open ?? currentPrice, instrument.precision)}</strong>
                  <span className="mbiotraders-price-label">H</span><strong>{price(last?.high ?? currentPrice, instrument.precision)}</strong>
                  <span className="mbiotraders-price-label">L</span><strong>{price(last?.low ?? currentPrice, instrument.precision)}</strong>
                  <span className="mbiotraders-price-label">C</span><strong>{price(currentPrice, instrument.precision)}</strong>
                  <span className={movement !== null && movement > 0 ? "up" : movement !== null && movement < 0 ? "down" : ""}>
                    {signedPrice(movement, instrument.precision)} ({percent(movementPercent)})
                  </span>
                </div>
              </div>
              <button type="button" className="mbiotraders-refresh" onClick={() => void reload()} aria-label="Refresh">
                <RefreshCcw size={16} />
              </button>
            </div>
            <div className="mbiotraders-chart-overlays">
              <div>EMA 50 <span className="mbiotraders-ema-fast">{price(ema50, instrument.precision)}</span></div>
              <div>EMA 200 <span className="mbiotraders-ema-slow">{price(ema200, instrument.precision)}</span></div>
            </div>
            {chartCandles.length ? (
              <LiveChart
                candles={chartCandles}
                symbol={symbol}
                frame={frame}
                livePrice={quoteFresh ? feed.quote : null}
                liveAt={quoteFresh ? feed.quoteAt : null}
                signal={sourceMatches ? activeSignal : null}
                resistance={keyLevels.resistance1}
                support={keyLevels.support1}
              />
            ) : (
              <div className="mbiotraders-chart-empty">{feed.loading ? "Connecting to market data…" : "No completed candles available."}</div>
            )}
          </section>

          <section className="mbiotraders-card mbiotraders-gauge-card">
            <div className="mbiotraders-card-head"><h2>Overall Market Strength <Info size={14} /></h2></div>
            <StrengthGauge analysis={selected} score={gaugeScore} />
            <div className="mbiotraders-gauge-foot">
              {feed.streaming && quoteFresh
                ? "LIVE · forming candle"
                : "Confirmed bar indicators"} · {FRAME_LABELS[frame]}
            </div>
          </section>

          <section className="mbiotraders-card mbiotraders-signal-card">
            <div className="mbiotraders-card-head">
              <h2>Current Signal</h2>
              <span className={`mbiotraders-live-mini ${isLive ? "on" : ""}`}>{activeSignal ? "ACTIVE" : isLive ? "LIVE" : "WAIT"}</span>
            </div>
            <div className={`mbiotraders-big-signal ${statusClass(displayedSignal)}`}>
              {displayedSignal === "BUY" ? <TrendingUp size={22} /> : displayedSignal === "SELL" ? <TrendingDown size={22} /> : <Clock3 size={20} />}
              {displayedSignal}
            </div>
            <div className="mbiotraders-signal-section">
              <div className="mbiotraders-row-between">
                <span>{activeSignal ? "At activation" : "Confluence"}</span>
                <strong>{activeSignal?.confidence ?? setup.score}%</strong>
              </div>
              <ConfidenceBar score={activeSignal?.confidence ?? setup.score} />
            </div>
            <div className="mbiotraders-details-list compact">
              <div><span>Entry Zone</span><strong>{price(activeSignal?.entry, instrument.precision)}</strong></div>
              <div><span>Stop Loss</span><strong>{price(activeSignal?.stop, instrument.precision)}</strong></div>
              <div><span>Take Profit 1</span><strong>{price(activeSignal?.target, instrument.precision)}</strong></div>
              <div>
                <span>Floating return</span>
                <strong>{floatingReturn === null ? "—" : `${floatingReturn.toFixed(2)}R`}</strong>
              </div>
              <div><span>R:R Ratio</span><strong>1 : 2</strong></div>
              <div>
                <span>Signal Time</span>
                <strong>{signalTimeLabel}</strong>
              </div>
            </div>
            <div className="mbiotraders-tracking-note">{activeSignal
              ? tracker.warning
                ? "TRACKING · Verification pending"
                : "TRACKING until TP/SL"
              : pendingSignal
                ? "WAITING for level breakout"
                : "WAITING for qualifying signal"}</div>
          </section>

          <section className="mbiotraders-card mbiotraders-align-card">
            <div className="mbiotraders-card-head"><h2><Activity size={16} /> Multi-Timeframe Trend Alignment</h2>
              <div className="mbiotraders-momentum-tabs" aria-label="Higher-timeframe momentum lookback">
                {MOMENTUM_WINDOWS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={safeMomentumDays === days ? "active" : ""}
                    onClick={() => setMomentumDays(days)}
                    aria-pressed={safeMomentumDays === days}
                  >
                    {days}D
                  </button>
                ))}
              </div>
            </div>
            <div className="mbiotraders-align-content">
              <div className="mbiotraders-frame-grid">
                {FRAMES.map((item) => (
                  <FrameTile
                    key={item}
                    analysis={setup.frames[item]}
                    direction={frameDirection(item)}
                    changePct={
                      HIGHER_FRAMES.includes(item as (typeof HIGHER_FRAMES)[number])
                        ? setup.momentum.readings[
                            item as (typeof HIGHER_FRAMES)[number]
                          ].changePct
                        : undefined
                    }
                    active={frame === item}
                    onClick={() => setFrame(item)}
                  />
                ))}
              </div>
              <div className="mbiotraders-align-summary-box">
                <span className="mbiotraders-align-label">{safeMomentumDays}D Momentum <Info size={13} /></span>
                <strong>{alignmentCount}/6</strong>
                <small>Timeframes {setup.bias === "BUY" ? "Bullish" : setup.bias === "SELL" ? "Bearish" : "Mixed"}</small>
                <div className="mbiotraders-summary-bar"><span style={{ width: `${(alignmentCount / 6) * 100}%` }} /></div>
              </div>
            </div>
          </section>

          <section className="mbiotraders-card mbiotraders-setup-card">
            <div className="mbiotraders-card-head"><h2><ShieldCheck size={16} /> Signal Setup Details</h2></div>
            <div className="mbiotraders-checklist">
              {[setup.criteria[1], setup.criteria[4], setup.criteria[5], setup.criteria[2], setup.criteria[6]].map((criterion) => (
                <div key={criterion.name} className="mbiotraders-check-item" title={criterion.detail}>
                  <span className={`mbiotraders-check-icon ${criterion.ok ? "ok" : "pending"}`}>
                    {criterion.ok ? <Check size={13} /> : <Clock3 size={12} />}
                  </span>
                  <div className="mbiotraders-check-copy"><strong>{criterion.name}</strong></div>
                  <b className={criterion.ok ? "up" : "flat"}>
                    {criterion.ok
                      ? criterion.name.includes("trend")
                        ? setup.bias === "BUY"
                          ? "Bullish"
                          : setup.bias === "SELL"
                            ? "Bearish"
                            : "Yes"
                        : "Yes"
                      : "Wait"}
                  </b>
                </div>
              ))}
            </div>
            <div className="mbiotraders-conclusion">Conclusion <span>{activeReason}</span></div>
          </section>

          <section className="mbiotraders-card mbiotraders-levels-card">
            <div className="mbiotraders-card-head"><h2><Bell size={16} /> Key Levels</h2></div>
            <div className="mbiotraders-levels-list">
              <div><span className="down">Resistance 2</span><strong className="down">{price(keyLevels.resistance2, instrument.precision)}</strong></div>
              <div><span className="down">Resistance 1</span><strong className="down">{price(keyLevels.resistance1, instrument.precision)}</strong></div>
              <div><span>Current Price</span><strong>{price(keyLevels.currentPrice, instrument.precision)}</strong></div>
              <div><span className="up">Support 1</span><strong className="up">{price(keyLevels.support1, instrument.precision)}</strong></div>
              <div><span className="up">Support 2</span><strong className="up">{price(keyLevels.support2, instrument.precision)}</strong></div>
            </div>
          </section>

          <section className="mbiotraders-card mbiotraders-tech-card">
            <div className="mbiotraders-card-head mbiotraders-tech-head">
              <div>
                <h2>Technical Indicators</h2>
                <div className="mbiotraders-quick-summary">
                  <div><span>Moving average</span><b className="up">Buy ({selected.moving.buy})</b><b className="down">Sell ({selected.moving.sell})</b></div>
                  <div>
                    <span>Indicators</span>
                    <b className="up">Buy ({selected.oscillators.buy})</b>
                    <b className="down">Sell ({selected.oscillators.sell})</b>
                  </div>
                </div>
              </div>
            </div>
            <div className="mbiotraders-indicator-grid">
              {displayIndicators.map((vote) => <IndicatorCard key={vote.name} vote={vote} />)}
            </div>
          </section>

          <section className="mbiotraders-card mbiotraders-recent-card">
            <div className="mbiotraders-card-head mbiotraders-recent-head">
              <h2><Activity size={16} /> Recent Signals</h2>
              <button
                type="button"
                className="mbiotraders-export-button"
                onClick={downloadSignals}
                disabled={!latestSignals.length}
                title="Export all stored signals as CSV"
                aria-label="Export all recent signals as CSV"
              >
                <Download size={14} aria-hidden="true" /> Export CSV
              </button>
            </div>
            <div className="mbiotraders-recent-table">
              <div className="mbiotraders-table-head">
                <span>Time</span>
                <span>Direction</span>
                <span>Pair</span>
                <span>Result</span>
              </div>
              {displayedHistory.items.length ? displayedHistory.items.map((item) => (
                <div key={`${item.symbol}:${item.id}`} className="mbiotraders-table-row">
                  <span>{signalDateTime(item.openedAt)}</span>
                  <span className={statusClass(item.direction)}>{item.direction}</span>
                  <span className="mbiotraders-signal-pair">{item.symbol}</span>
                  <span className={item.status === "TP" ? "up" : "down"}>
                    {formatSignalResult(item)}
                  </span>
                </div>
              )) : (
                <div className="mbiotraders-empty-text">
                  No completed signals yet. The latest 100 outcomes across all pairs are saved in this browser.
                </div>
              )}
            </div>
            <div className="mbiotraders-recent-pagination" aria-label="Recent signals pagination">
              <span className="mbiotraders-recent-count">
                {displayedHistory.from}–{displayedHistory.to} of {displayedHistory.total}
              </span>
              <div className="mbiotraders-recent-page-controls">
                <button
                  type="button"
                  onClick={() => setRecentPage(displayedHistory.page - 1)}
                  disabled={displayedHistory.page === 0}
                  aria-label="Previous signals page"
                >
                  Previous
                </button>
                <span>Page {displayedHistory.page + 1} of {displayedHistory.pageCount}</span>
                <button
                  type="button"
                  onClick={() => setRecentPage(displayedHistory.page + 1)}
                  disabled={displayedHistory.page + 1 >= displayedHistory.pageCount}
                  aria-label="Next signals page"
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          <section className="mbiotraders-card mbiotraders-stats-card">
            <div className="mbiotraders-card-head"><h2>Market Statistics <small>(Last 100 Signals)</small></h2></div>
            <StatsCard signals={recentForStats} />
          </section>
        </section>}

    </main>
  );
}
