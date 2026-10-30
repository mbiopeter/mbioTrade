"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { ema } from "@/lib/indicators";
import type { Candle } from "@/lib/types";
import type { TrackedSignal } from "@/lib/v26-signals";

type Props = {
  candles: Candle[];
  symbol: string;
  frame: number;
  livePrice: number | null;
  liveAt: number | null;
  support: number | null;
  resistance: number | null;
  signal: TrackedSignal | null;
};

type ZonePositions = {
  resistance: number | null;
  support: number | null;
};

type PositionCoordinates = {
  x: number;
  width: number;
  entry: number;
  stop: number;
  target: number;
};

export function LiveChart({
  candles,
  symbol,
  frame,
  livePrice,
  liveAt,
  signal,
  support,
  resistance,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const bars = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fast = useRef<ISeriesApi<"Line"> | null>(null);
  const slow = useRef<ISeriesApi<"Line"> | null>(null);
  const currentView = useRef("");
  const liveBar = useRef<Candle | null>(null);
  const candleEnd = useRef(0);
  const [zones, setZones] = useState<ZonePositions>({
    resistance: null,
    support: null,
  });
  const [position, setPosition] = useState<PositionCoordinates | null>(null);
  const zonesUpdater = useRef<() => void>(() => {});
  const positionUpdater = useRef<() => void>(() => {});
  const signalRef = useRef(signal);
  const dataRef = useRef(candles);
  const frameRef = useRef(frame);

  signalRef.current = signal;
  dataRef.current = candles;
  frameRef.current = frame;

  const updateZones = useCallback(() => {
    const series = bars.current;
    if (!series) return;

    const resistanceY = resistance === null
      ? null
      : series.priceToCoordinate(resistance);
    const supportY = support === null
      ? null
      : series.priceToCoordinate(support);

    setZones((previous) => {
      if (
        previous.resistance === resistanceY &&
        previous.support === supportY
      ) {
        return previous;
      }

      return { resistance: resistanceY, support: supportY };
    });
  }, [support, resistance]);

  zonesUpdater.current = updateZones;
  positionUpdater.current = () => {
    const series = bars.current;
    const instance = chart.current;
    const activeSignal = signalRef.current;
    const data = dataRef.current;

    if (!series || !instance || !activeSignal || data.length === 0) {
      setPosition(null);
      return;
    }

    const currentFrame = frameRef.current;
    const signalBarTime = Math.floor(
      activeSignal.openedAt / 1000 / currentFrame,
    ) * currentFrame;
    const openingBar = data.find((bar) => bar.time >= signalBarTime);

    if (!openingBar || openingBar.time > signalBarTime + currentFrame) {
      setPosition(null);
      return;
    }

    const timeScale = instance.timeScale();
    const startX = timeScale.timeToCoordinate(openingBar.time as UTCTimestamp);
    const endX = timeScale.timeToCoordinate(data.at(-1)!.time as UTCTimestamp);
    const entryY = series.priceToCoordinate(activeSignal.entry);
    const stopY = series.priceToCoordinate(activeSignal.stop);
    const targetY = series.priceToCoordinate(activeSignal.target);
    const coordinates = [startX, endX, entryY, stopY, targetY];

    if (coordinates.some((value) => value === null || !Number.isFinite(value))) {
      setPosition(null);
      return;
    }

    const canvasWidth = element.current?.clientWidth ?? 0;
    const left = Math.min(
      canvasWidth - 15,
      Math.max(-canvasWidth, Number(startX)),
    );
    const right = Math.min(
      canvasWidth - 10,
      Math.max(Number(endX) + 42, left + 100),
    );

    if (right <= 0 || left >= canvasWidth) {
      setPosition(null);
      return;
    }

    const next = {
      x: left,
      width: right - left,
      entry: Number(entryY),
      stop: Number(stopY),
      target: Number(targetY),
    };

    setPosition((previous) => {
      if (
        previous &&
        Math.abs(previous.x - next.x) < 0.2 &&
        Math.abs(previous.width - next.width) < 0.2 &&
        Math.abs(previous.entry - next.entry) < 0.2 &&
        Math.abs(previous.stop - next.stop) < 0.2 &&
        Math.abs(previous.target - next.target) < 0.2
      ) {
        return previous;
      }
      return next;
    });
  };

  useEffect(() => {
    const container = element.current;
    if (!container) return;

    const instance = createChart(container, {
      width: Math.max(1, container.clientWidth),
      height: Math.max(300, container.clientHeight),
      layout: {
        background: { type: ColorType.Solid, color: "#03111b" },
        textColor: "#a2b7c0",
        fontFamily: "DM Sans Variable, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(132,171,190,.09)" },
        horzLines: { color: "rgba(132,171,190,.09)" },
      },
      crosshair: {
        vertLine: { color: "#1d7469" },
        horzLine: { color: "#1d7469" },
      },
      rightPriceScale: {
        borderColor: "#1a3441",
        scaleMargins: { top: 0.20, bottom: 0.12 },
      },
      timeScale: {
        borderColor: "#1a3441",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: 9,
      },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const candlesticks = instance.addSeries(CandlestickSeries, {
      upColor: "#25dfa6",
      wickUpColor: "#25dfa6",
      downColor: "#fa6576",
      wickDownColor: "#fa6576",
      borderVisible: false,
      priceLineVisible: true,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    const fastLine = instance.addSeries(LineSeries, {
      color: "#3b96ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const slowLine = instance.addSeries(LineSeries, {
      color: "#eda52b",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chart.current = instance;
    bars.current = candlesticks;
    fast.current = fastLine;
    slow.current = slowLine;

    const refreshOverlay = () => {
      window.requestAnimationFrame(() => {
        zonesUpdater.current();
        positionUpdater.current();
      });
    };
    const resizeObserver = new ResizeObserver(() => {
      instance.resize(
        Math.max(1, container.clientWidth),
        Math.max(300, container.clientHeight),
      );
      refreshOverlay();
    });
    resizeObserver.observe(container);
    instance.timeScale().subscribeVisibleLogicalRangeChange(refreshOverlay);

    return () => {
      resizeObserver.disconnect();
      instance.timeScale().unsubscribeVisibleLogicalRangeChange(refreshOverlay);
      instance.remove();
      chart.current = null;
      bars.current = null;
      fast.current = null;
      slow.current = null;
      currentView.current = "";
      liveBar.current = null;
      candleEnd.current = 0;
    };
  }, []);

  useEffect(() => {
    const candlesticks = bars.current;
    const fastLine = fast.current;
    const slowLine = slow.current;
    const instance = chart.current;
    if (!candlesticks || !fastLine || !slowLine || !instance) return;

    liveBar.current = null;
    candleEnd.current = candles.at(-1)?.time ?? 0;

    if (candles.length === 0) {
      candlesticks.setData([]);
      fastLine.setData([]);
      slowLine.setData([]);
      setPosition(null);
      return;
    }

    const closes = candles.map((bar) => bar.close);
    const ema50 = ema(closes, 50);
    const ema200 = ema(closes, 200);
    const key = `${symbol}:${frame}`;
    const previousRange = currentView.current === key
      ? instance.timeScale().getVisibleRange()
      : null;

    candlesticks.setData(candles.map((bar) => ({
      ...bar,
      time: bar.time as UTCTimestamp,
    })));
    fastLine.setData(candles.map((bar, index) => ({
      time: bar.time as UTCTimestamp,
      value: ema50[index],
    })));
    slowLine.setData(candles.map((bar, index) => ({
      time: bar.time as UTCTimestamp,
      value: ema200[index],
    })));

    if (currentView.current !== key) {
      instance.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - 89),
        to: candles.length + 7,
      });
      currentView.current = key;
    } else if (previousRange) {
      try {
        instance.timeScale().setVisibleRange(previousRange);
      } catch {
      }
    }

    window.requestAnimationFrame(() => {
      updateZones();
      positionUpdater.current();
    });
  }, [candles, symbol, frame, updateZones]);

  useEffect(() => {
    const series = bars.current;
    if (
      !series ||
      livePrice === null ||
      liveAt === null ||
      !Number.isFinite(livePrice) ||
      livePrice <= 0
    ) {
      return;
    }

    const bucket = Math.floor(liveAt / 1000 / frame) * frame;
    if (bucket < candleEnd.current || bucket > candleEnd.current + frame * 4) return;

    const provided = bucket === candleEnd.current ? candles.at(-1) : null;
    const previous = liveBar.current?.time === bucket ? liveBar.current : provided;
    const next: Candle = previous
      ? {
          time: bucket,
          open: previous.open,
          high: Math.max(previous.high, livePrice),
          low: Math.min(previous.low, livePrice),
          close: livePrice,
        }
      : {
          time: bucket,
          open: livePrice,
          high: livePrice,
          low: livePrice,
          close: livePrice,
        };

    liveBar.current = next;
    try {
      series.update({ ...next, time: bucket as UTCTimestamp });
    } catch {
    }
    window.requestAnimationFrame(() => {
      updateZones();
      positionUpdater.current();
    });
  }, [livePrice, liveAt, frame, candles, updateZones]);

  useEffect(() => {
    if (!signal) setPosition(null);
    window.requestAnimationFrame(() => positionUpdater.current());
  }, [signal?.id, signal?.entry, signal?.stop, signal?.target, signal?.direction]);

  return (
    <div className="mbiotraders-chart-layer">
      <div
        className="mbiotraders-chart"
        ref={element}
        role="img"
        aria-label={`${symbol} ${frame / 60} minute candlestick chart with EMA 50/200 and optional live quote`}
      />
      {signal && position && (
        <div
          className="mbiotraders-position-overlay"
          aria-label={`${signal.direction} position risk and reward zones`}
        >
          <div
            className="mbiotraders-position-zone gain"
            style={{
              left: position.x,
              width: position.width,
              top: Math.min(position.entry, position.target),
              height: Math.abs(position.entry - position.target),
            }}
          >
            <span className="mbiotraders-position-tag gain">
              {signal.direction === "BUY" ? "LONG" : "SHORT"} · TP {signal.target.toFixed(4)}
            </span>
          </div>
          <div
            className="mbiotraders-position-zone risk"
            style={{
              left: position.x,
              width: position.width,
              top: Math.min(position.entry, position.stop),
              height: Math.abs(position.entry - position.stop),
            }}
          >
            <span className="mbiotraders-position-tag risk">
              SL {signal.stop.toFixed(4)}
            </span>
          </div>
          <span
            className="mbiotraders-position-entry-tag"
            style={{ left: position.x + 5, top: position.entry - 10 }}
          >
            Entry {signal.entry.toFixed(4)}
          </span>
        </div>
      )}
      {zones.resistance !== null && Number.isFinite(zones.resistance) && (
        <div
          className="mbiotraders-price-zone resistance"
          style={{ top: zones.resistance - 11 }}
        >
          Resistance Zone
        </div>
      )}
      {zones.support !== null && Number.isFinite(zones.support) && (
        <div
          className="mbiotraders-price-zone support"
          style={{ top: zones.support - 11 }}
        >
          Support Zone
        </div>
      )}
    </div>
  );
}
