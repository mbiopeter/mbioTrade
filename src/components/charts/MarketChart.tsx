"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  type AutoscaleInfo,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import {
  chartPositionLevels,
  positionAnnotationLayout,
  positionForwardBars,
  positionOpenedAt,
  positionOverlayBounds,
  resolveEntryCandleTime,
} from "@/lib/chart-position";
import type { Candle, DemoTrade } from "@/lib/types";

export type MarketChartProps = {
  candles: Candle[];
  position?: DemoTrade | null;
  currentPrice?: number | null;
  livePnl?: number | null;
  currency?: string;
  dataKey?: string;
  accent?: string;
};

type PositionOverlay = {
  tradeId: string;
  dataKey: string;
  entryY: number;
  takeProfitY: number | null;
  stopLossY: number | null;
  left: number;
  width: number;
  anchorOffset: number;
  entryLabel: string;
  plotHeight: number;
} | null;

type DataMetadata = {
  key: string;
  firstTime: number;
  lastTime: number;
  length: number;
};

const POSITION_MIN_WIDTH_PX = 150;
function chartData(candle: Candle) {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function estimateBarSpacing(chart: IChartApi, candles: Candle[]): number {
  const latest = candles.at(-1);
  const previous = candles.at(-2);
  if (!latest || !previous) {
    return 8;
  }

  const latestX = chart.timeScale().timeToCoordinate(latest.time as UTCTimestamp);
  const previousX = chart.timeScale().timeToCoordinate(previous.time as UTCTimestamp);
  if (latestX === null || previousX === null) {
    return 8;
  }

  return Math.max(3, Math.abs(latestX - previousX));
}

function entryTimeLabel(openedAt: number): string {
  return new Date(openedAt).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function signedMoney(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

export function MarketChart({
  candles,
  position,
  currentPrice,
  livePnl,
  currency = "USD",
  dataKey = "market",
  accent = "#20e58b",
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const dataMetadataRef = useRef<DataMetadata | null>(null);
  const scheduleOverlayRef = useRef<((reserveSpace?: boolean) => void) | null>(null);
  const preservePositionSpaceRef = useRef(true);
  const reserveSpaceRef = useRef(true);
  const pnlRef = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<PositionOverlay>(null);
  const [pnlHeight, setPnlHeight] = useState(112);
  const levels = chartPositionLevels(position);
  const entryPrice = levels?.entry;
  const takeProfitPrice = levels?.takeProfit;
  const stopLossPrice = levels?.stopLoss;
  const activePositionId = levels ? position?.id : undefined;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8da39e",
      },
      grid: {
        vertLines: { color: "rgba(130,150,145,.07)" },
        horzLines: { color: "rgba(130,150,145,.07)" },
      },
      rightPriceScale: {
        borderColor: "rgba(130,150,145,.16)",
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "rgba(130,150,145,.16)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
      crosshair: {
        vertLine: { color: "rgba(32,229,139,.22)" },
        horzLine: { color: "rgba(32,229,139,.22)" },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: accent,
      downColor: "#ef6570",
      borderVisible: false,
      wickUpColor: accent,
      wickDownColor: "#ef6570",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => {
      // Finish the canvas resize now; the overlay is measured after the chart's
      // following layout/auto-scale frames, never inside a size-change callback.
      chart.resize(container.clientWidth, Math.max(390, container.clientHeight || 520), true);
      scheduleOverlayRef.current?.(true);
    });
    resizeObserver.observe(container);
    const preserveUserView = () => {
      preservePositionSpaceRef.current = false;
      scheduleOverlayRef.current?.();
    };
    container.addEventListener("pointerdown", preserveUserView, { passive: true });
    container.addEventListener("wheel", preserveUserView, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", preserveUserView);
      container.removeEventListener("wheel", preserveUserView);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      dataMetadataRef.current = null;
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.applyOptions({
      upColor: accent,
      wickUpColor: accent,
    });
  }, [accent]);

  useEffect(() => {
    seriesRef.current?.applyOptions({
      // Restored positions must show the entire target/risk drawing, including
      // broker barriers outside the recent candle range.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (!info?.priceRange || entryPrice === undefined) return info;
        const prices = [entryPrice, takeProfitPrice, stopLossPrice].filter(
          (price): price is number => typeof price === "number" && Number.isFinite(price),
        );
        return {
          ...info,
          priceRange: {
            minValue: Math.min(info.priceRange.minValue, ...prices),
            maxValue: Math.max(info.priceRange.maxValue, ...prices),
          },
        };
      },
    });
    scheduleOverlayRef.current?.();
  }, [entryPrice, takeProfitPrice, stopLossPrice]);

  useEffect(() => {
    // Reserve actual screen space for a newly restored or opened position.
    // A layout change may reassert this padding until the user pans or zooms.
    // Quote and protection updates never reset a deliberately selected view.
    preservePositionSpaceRef.current = true;
    reserveSpaceRef.current = true;
    chartRef.current?.timeScale().applyOptions({
      rightOffset: 8,
      rightOffsetPixels: activePositionId ? POSITION_MIN_WIDTH_PX + 24 : undefined,
    });
    scheduleOverlayRef.current?.(true);
  }, [activePositionId, dataKey]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || candles.length === 0) {
      return;
    }

    const firstTime = candles[0].time;
    const lastCandle = candles[candles.length - 1];
    const previous = dataMetadataRef.current;
    const isSimpleLiveUpdate = Boolean(
      previous &&
      previous.key === dataKey &&
      previous.firstTime === firstTime &&
      (candles.length === previous.length || candles.length === previous.length + 1) &&
      lastCandle.time >= previous.lastTime,
    );

    if (isSimpleLiveUpdate) {
      series.update(chartData(lastCandle));
    } else {
      series.setData(candles.map(chartData));
    }

    const shouldFitContent = !previous || previous.key !== dataKey;
    dataMetadataRef.current = {
      key: dataKey,
      firstTime,
      lastTime: lastCandle.time,
      length: candles.length,
    };

    if (shouldFitContent) {
      chart.timeScale().fitContent();
    }
  }, [candles, dataKey]);

  useEffect(() => {
    const refreshOverlay = () => {
      const container = containerRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      const positionLevels = chartPositionLevels(position);

      if (!container || !chart || !series || !position || !positionLevels) {
        setOverlay(null);
        return;
      }

      const entryCandleTime = resolveEntryCandleTime(candles, position);
      const openedAt = positionOpenedAt(position);
      if (entryCandleTime === null || openedAt === null) {
        setOverlay(null);
        return;
      }

      const entryY = series.priceToCoordinate(positionLevels.entry);
      const takeProfitY =
        positionLevels.takeProfit === null
          ? null
          : series.priceToCoordinate(positionLevels.takeProfit);
      const stopLossY =
        positionLevels.stopLoss === null
          ? null
          : series.priceToCoordinate(positionLevels.stopLoss);
      const entryX = chart
        .timeScale()
        .timeToCoordinate(entryCandleTime as UTCTimestamp);
      const latestCandle = candles.at(-1);
      const latestX = latestCandle
        ? chart.timeScale().timeToCoordinate(latestCandle.time as UTCTimestamp)
        : null;

      if (entryY === null || !Number.isFinite(entryY) || entryX === null) {
        setOverlay(null);
        return;
      }

      const spacing = estimateBarSpacing(chart, candles);
      const previousCandle = candles.at(-2);
      const candleInterval = latestCandle
        ? Math.max(1, latestCandle.time - (previousCandle?.time ?? entryCandleTime))
        : 1;
      const elapsedBars = latestCandle
        ? Math.max(
            1,
            Math.round((latestCandle.time - entryCandleTime) / candleInterval),
          )
        : 1;
      const forwardBars = positionForwardBars(elapsedBars);
      const desiredRight = Math.max(
        entryX + POSITION_MIN_WIDTH_PX,
        (latestX ?? entryX) + spacing * forwardBars,
      );
      const plotRight = Math.max(0, chart.timeScale().width());
      const bounds = positionOverlayBounds(entryX, desiredRight, plotRight);

      if (!bounds) {
        setOverlay(null);
        return;
      }

      setOverlay({
        tradeId: position.id,
        dataKey,
        entryY,
        takeProfitY,
        stopLossY,
        ...bounds,
        entryLabel: entryTimeLabel(openedAt),
        plotHeight: chart.panes()[0]?.getHeight() ?? Math.max(0, container.clientHeight - chart.timeScale().height()),
      });
    };

    const chart = chartRef.current;
    let frame = 0;
    let settleFrame = 0;
    let revision = 0;
    const scheduleOverlay = (reserve = false) => {
      revision += 1;
      reserveSpaceRef.current ||= reserve;
      if (frame || settleFrame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const layoutRevision = revision;
        // The chart publishes size/range changes during its own draw. A second
        // frame waits for time-scale invalidations and price auto-scaling too.
        settleFrame = requestAnimationFrame(() => {
          settleFrame = 0;
          const shouldReserve = reserveSpaceRef.current;
          reserveSpaceRef.current = false;
          if (shouldReserve && preservePositionSpaceRef.current && position && chartPositionLevels(position) && chart) {
            const timeScale = chart.timeScale();
            const spacing = timeScale.options().barSpacing;
            const rightSpace = timeScale.scrollPosition() * spacing;
            if (timeScale.getVisibleLogicalRange() && Number.isFinite(rightSpace) && rightSpace < POSITION_MIN_WIDTH_PX + 23) {
              // Reapply in pixels after bar spacing and plot width have settled.
              // Never do this on every tick or after a user's chart interaction.
              timeScale.applyOptions({ rightOffsetPixels: POSITION_MIN_WIDTH_PX + 24 });
              scheduleOverlay();
              return;
            }
          }
          refreshOverlay();
          // An update can arrive between the two frames. Read once more after
          // its paint instead of leaving coordinates from the preceding scale.
          if (revision !== layoutRevision) scheduleOverlay();
        });
      });
    };
    const scheduleRangeRefresh = () => scheduleOverlay();
    const scheduleSizeRefresh = () => scheduleOverlay(true);
    scheduleOverlayRef.current = scheduleOverlay;
    scheduleOverlay();
    chart?.timeScale().subscribeVisibleLogicalRangeChange(scheduleRangeRefresh);
    chart?.timeScale().subscribeSizeChange(scheduleSizeRefresh);
    window.addEventListener("resize", scheduleSizeRefresh);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
      if (scheduleOverlayRef.current === scheduleOverlay) scheduleOverlayRef.current = null;
      chart?.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleRangeRefresh);
      chart?.timeScale().unsubscribeSizeChange(scheduleSizeRefresh);
      window.removeEventListener("resize", scheduleSizeRefresh);
    };
  }, [candles, position, dataKey]);

  useEffect(() => {
    const card = pnlRef.current;
    if (!card) return;
    const measure = () => setPnlHeight(Math.ceil(card.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [overlay?.tradeId, overlay?.dataKey]);

  const annotations = overlay
    ? positionAnnotationLayout(
        overlay.entryY,
        overlay.takeProfitY,
        overlay.stopLossY,
        overlay.plotHeight,
        pnlHeight,
      )
    : null;

  const targetTop =
    overlay && overlay.takeProfitY !== null
      ? Math.min(overlay.entryY, overlay.takeProfitY)
      : 0;
  const targetHeight =
    overlay && overlay.takeProfitY !== null
      ? Math.abs(overlay.entryY - overlay.takeProfitY)
      : 0;
  const riskTop =
    overlay && overlay.stopLossY !== null
      ? Math.min(overlay.entryY, overlay.stopLossY)
      : 0;
  const riskHeight =
    overlay && overlay.stopLossY !== null
      ? Math.abs(overlay.entryY - overlay.stopLossY)
      : 0;
  const estimated =
    levels?.takeProfitSource === "estimate" || levels?.stopLossSource === "estimate";
  const unavailable = [
    levels?.takeProfit === null ? "TP" : null,
    levels?.stopLoss === null ? "SL" : null,
  ].filter(Boolean);
  const levelDescription = (source: string | null) =>
    source === "estimate"
      ? `Estimated price from Deriv's monetary limit, entry, stake and multiplier${
          levels?.excludesCommission ? "; commission is unavailable and excluded" : ", including commission"
        }. Display only; Deriv manages the actual order.`
      : source === "broker"
        ? "Current spot-price barrier reported by Deriv."
        : "Original chart-price level saved with this trade.";

  return (
    <div className="market-chart-wrap">
      <div ref={containerRef} className="market-chart" />

      {overlay &&
        position &&
        levels &&
        annotations &&
        overlay.tradeId === position.id &&
        overlay.dataKey === dataKey && (
          <div
            className={`tv-position ${position.direction === "UP" ? "long" : "short"}`}
            style={{ left: overlay.left, width: overlay.width, height: overlay.plotHeight, bottom: "auto" }}
            aria-label={`${position.direction} position opened ${overlay.entryLabel}`}
          >
            <div className="tv-entry-anchor" style={{ left: overlay.anchorOffset }}>
              <span>{overlay.entryLabel}</span>
            </div>
            {overlay.takeProfitY !== null && (
              <div
                className="tv-zone target"
                style={{ top: targetTop, height: targetHeight }}
                data-level-source={levels.takeProfitSource}
              />
            )}
            {overlay.stopLossY !== null && (
              <div
                className="tv-zone risk"
                style={{ top: riskTop, height: riskHeight }}
                data-level-source={levels.stopLossSource}
              />
            )}
            <svg
              className="tv-price-leaders"
              aria-hidden="true"
              style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
              width={overlay.width}
              height={overlay.plotHeight}
            >
              {[
                { key: "entry", actual: overlay.entryY, label: annotations.entry, color: "#c9d9d3" },
                { key: "tp", actual: overlay.takeProfitY, label: annotations.takeProfit, color: "#61dda0" },
                { key: "sl", actual: overlay.stopLossY, label: annotations.stopLoss, color: "#ff7883" },
              ].map(({ key, actual, label, color }) =>
                actual !== null && label !== null && Math.abs(actual - label) > 1 ? (
                  <polyline
                    key={key}
                    points={`${overlay.width - 5},${actual} ${overlay.width + 4},${actual} ${overlay.width + 4},${label} ${overlay.width - 5},${label}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    strokeOpacity={0.7}
                  />
                ) : null,
              )}
            </svg>
            <div className="tv-entry" style={{ top: overlay.entryY }}>
              <span
                style={{
                  top: annotations.entry - overlay.entryY,
                  transform: "translateY(-50%)",
                  whiteSpace: "nowrap",
                }}
              >
                {position.direction === "UP" ? "LONG" : "SHORT"} · Entry{" "}
                {position.entry.toFixed(5)}
              </span>
            </div>
            {overlay.takeProfitY !== null && levels.takeProfit !== null && (
              <div
                className="tv-label tp"
                style={{ top: annotations.takeProfit!, whiteSpace: "nowrap" }}
                title={levelDescription(levels.takeProfitSource)}
                data-level-source={levels.takeProfitSource}
              >
                TP {levels.takeProfitSource === "estimate" ? "≈ " : ""}
                {levels.takeProfit.toFixed(5)}
              </div>
            )}
            {overlay.stopLossY !== null && levels.stopLoss !== null && (
              <div
                className="tv-label sl"
                style={{ top: annotations.stopLoss!, whiteSpace: "nowrap" }}
                title={levelDescription(levels.stopLossSource)}
                data-level-source={levels.stopLossSource}
              >
                SL {levels.stopLossSource === "estimate" ? "≈ " : ""}
                {levels.stopLoss.toFixed(5)}
              </div>
            )}
            <div
              ref={pnlRef}
              className={`tv-live-pnl ${(livePnl ?? 0) >= 0 ? "positive" : "negative"}`}
              style={{ top: annotations.pnlTop }}
            >
              <span>Live P/L</span>
              <strong>
                {livePnl === null || livePnl === undefined
                  ? "Waiting…"
                  : signedMoney(livePnl, currency)}
              </strong>
              {currentPrice !== null && currentPrice !== undefined && (
                <small>@ {currentPrice.toFixed(5)}</small>
              )}
              {levels.riskReward !== null && (
                <small>Risk/reward 1:{levels.riskReward.toFixed(2)}</small>
              )}
              {estimated && (
                <small className="tv-level-note">
                  {levels.excludesCommission ? "Estimated levels · before fees" : "Estimated levels"}
                </small>
              )}
              {unavailable.length > 0 && (
                <small className="tv-level-note">{unavailable.join(" / ")} unavailable</small>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
