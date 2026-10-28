import type { Candle, DemoTrade } from "./types";

const MIN_FORWARD_BARS = 10;
const MAX_FORWARD_BARS = 36;

export type ChartPositionLevels = {
  entry: number;
  takeProfit: number | null;
  stopLoss: number | null;
  takeProfitSource: "broker" | "local" | "estimate" | null;
  stopLossSource: "broker" | "local" | "estimate" | null;
  riskReward: number | null;
  excludesCommission: boolean;
};

function positiveNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * These levels are for drawing only: never copy them into a trade's local exit
 * plan. Prefer Deriv's current spot barriers. Cash limits can be inverted using
 * multiplier P/L = signed price return * stake * multiplier - commission, but
 * the resulting price is an estimate, not a broker-provided execution barrier.
 */
export function chartPositionLevels(
  position: DemoTrade | null | undefined,
): ChartPositionLevels | null {
  if (!position || position.status !== "open" || !positiveNumber(position.entry)) {
    return null;
  }

  const sign = position.direction === "UP" ? 1 : -1;
  const commissionKnown =
    typeof position.brokerCommission === "number" &&
    Number.isFinite(position.brokerCommission) &&
    position.brokerCommission >= 0;
  const commission = commissionKnown ? position.brokerCommission! : 0;
  const resolveLevel = (
    kind: "takeProfit" | "stopLoss",
    brokerPrice: number | undefined,
    cashAmount: number | undefined,
  ): { price: number | null; source: ChartPositionLevels["takeProfitSource"] } => {
    if (positiveNumber(brokerPrice)) return { price: brokerPrice, source: "broker" };
    // A known broker snapshot with an absent order means it is unset/removed.
    // A saved browser plan must not resurrect its old shaded target/risk zone.
    if (
      !position.brokerLimitsKnown &&
      position.localStops &&
      positiveNumber(position[kind])
    ) {
      return { price: position[kind], source: "local" };
    }
    if (
      !positiveNumber(cashAmount) ||
      !positiveNumber(position.stake) ||
      !positiveNumber(position.multiplier)
    ) {
      return { price: null, source: null };
    }
    const netProfit = kind === "takeProfit" ? cashAmount : -cashAmount;
    const notional = position.stake * position.multiplier;
    if (!Number.isFinite(notional)) return { price: null, source: null };
    const price = position.entry * (1 + (sign * (netProfit + commission)) / notional);
    return positiveNumber(price)
      ? { price, source: "estimate" }
      : { price: null, source: null };
  };
  const target = resolveLevel(
    "takeProfit",
    position.brokerTakeProfitPrice,
    position.brokerTakeProfit,
  );
  const stop = resolveLevel("stopLoss", position.brokerStopLossPrice, position.brokerStopLoss);
  const reward = target.price === null ? 0 : sign * (target.price - position.entry);
  const risk = stop.price === null ? 0 : sign * (position.entry - stop.price);

  return {
    entry: position.entry,
    takeProfit: target.price,
    stopLoss: stop.price,
    takeProfitSource: target.source,
    stopLossSource: stop.source,
    riskReward: reward > 0 && risk > 0 ? reward / risk : null,
    excludesCommission:
      !commissionKnown && (target.source === "estimate" || stop.source === "estimate"),
  };
}

/** Preserve the broker's actual opening time; do not display a fabricated date. */
export function positionOpenedAt(
  position: Pick<DemoTrade, "entryTime" | "openedAt">,
): number | null {
  if (positiveNumber(position.openedAt)) return position.openedAt;
  return positiveNumber(position.entryTime) ? position.entryTime * 1000 : null;
}

/**
 * Returns the chart candle that was active when the order opened. The value is
 * stable as new candles arrive, so horizontal scrolling never detaches the
 * position overlay from its original entry point.
 */
export function resolveEntryCandleTime(
  candles: Candle[],
  position: Pick<DemoTrade, "entryTime" | "openedAt">,
): number | null {
  if (candles.length === 0) {
    return null;
  }

  const openedAt = positionOpenedAt(position);
  if (openedAt === null) return null;

  const target = Math.floor(
    positiveNumber(position.entryTime) ? position.entryTime : openedAt / 1000,
  );
  let candidate = candles[0].time;

  for (const candle of candles) {
    if (candle.time > target) {
      break;
    }
    candidate = candle.time;
  }

  return candidate;
}

/** Clip the drawing to the plot without moving its true entry-time anchor. */
export function positionOverlayBounds(
  entryX: number,
  desiredRight: number,
  plotRight: number,
): { left: number; width: number; anchorOffset: number } | null {
  if (![entryX, desiredRight, plotRight].every(Number.isFinite)) return null;
  const left = Math.max(0, entryX);
  const right = Math.min(desiredRight, plotRight);
  if (right <= left) return null;
  return { left, width: right - left, anchorOffset: entryX - left };
}

export type PositionAnnotationLayout = {
  entry: number;
  takeProfit: number | null;
  stopLoss: number | null;
  pnlTop: number;
};

/** Move only text annotations when prices are too close for readable badges. */
export function positionAnnotationLayout(
  entryY: number,
  takeProfitY: number | null,
  stopLossY: number | null,
  plotHeight: number,
  pnlHeight = 112,
): PositionAnnotationLayout {
  type Key = "entry" | "takeProfit" | "stopLoss";
  const items: { key: Key; y: number }[] = [{ key: "entry", y: entryY }];
  if (takeProfitY !== null && Number.isFinite(takeProfitY)) {
    items.push({ key: "takeProfit", y: takeProfitY });
  }
  if (stopLossY !== null && Number.isFinite(stopLossY)) {
    items.push({ key: "stopLoss", y: stopLossY });
  }
  items.sort((a, b) => a.y - b.y);

  const halfBadge = 10;
  const step = 26;
  const gap = 10;
  // The existing market/chart-mode header occupies the first ~45 pixels.
  const top = 52;
  const bottom = Math.max(top + items.length * step + pnlHeight + gap, plotHeight - 12);
  const minCenter = top + halfBadge;
  const distribute = (maxCenter: number) => {
    const centers = items.map((item, index) =>
      Math.max(minCenter + index * step, Math.min(maxCenter, item.y)),
    );
    for (let index = 1; index < centers.length; index++) {
      centers[index] = Math.max(centers[index], centers[index - 1] + step);
    }
    centers[centers.length - 1] = Math.min(centers.at(-1)!, maxCenter);
    for (let index = centers.length - 2; index >= 0; index--) {
      centers[index] = Math.min(centers[index], centers[index + 1] - step);
    }
    return centers;
  };

  let centers = distribute(bottom - halfBadge);
  const candidates: number[] = [];
  const preferredTop = centers[items.findIndex((item) => item.key === "entry")] + 24;
  let cursor = top;
  for (const center of centers) {
    const end = center - halfBadge - gap;
    if (end - cursor >= pnlHeight) {
      candidates.push(Math.max(cursor, Math.min(preferredTop, end - pnlHeight)));
    }
    cursor = center + halfBadge + gap;
  }
  if (bottom - cursor >= pnlHeight) {
    candidates.push(Math.max(cursor, Math.min(preferredTop, bottom - pnlHeight)));
  }
  let pnlTop: number;
  if (candidates.length > 0) {
    pnlTop = candidates.sort((a, b) => Math.abs(a - preferredTop) - Math.abs(b - preferredTop))[0];
  } else {
    // If scattered badges leave no card-sized gap, reserve the bottom for P/L
    // and nudge badge text upward. The price lines and zones never move.
    pnlTop = bottom - pnlHeight;
    centers = distribute(pnlTop - gap - halfBadge);
  }
  const result: PositionAnnotationLayout = {
    entry: entryY,
    takeProfit: null,
    stopLoss: null,
    pnlTop,
  };
  items.forEach((item, index) => {
    result[item.key] = centers[index];
  });
  return result;
}

/**
 * Leaves more room to the right as a position remains open for more candles.
 * The cap prevents an excessive off-screen overlay on long-running positions.
 */
export function positionForwardBars(elapsedBars: number): number {
  return Math.min(
    MAX_FORWARD_BARS,
    Math.max(MIN_FORWARD_BARS, 10 + Math.floor(elapsedBars / 12)),
  );
}
