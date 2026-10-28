"use client";

import { SearchSelect } from "@/components/ui/controls";
import type { Candle, MarketSymbol, Preferences } from "@/lib/types";

export type MarketHeaderProps = {
  preferences: Preferences;
  symbols: MarketSymbol[];
  latest?: Candle;
  previous?: Candle;
  onSymbolChange: (symbol: string) => void;
};

function price(value: number | undefined): string {
  return Number.isFinite(value) ? Number(value).toFixed(5) : "—";
}

export function MarketHeader({
  preferences,
  symbols,
  latest,
  previous,
  onSymbolChange,
}: MarketHeaderProps) {
  const change = latest && previous ? latest.close - previous.close : 0;
  const changePercent = previous?.close
    ? (change / previous.close) * 100
    : 0;
  const changeClass = change >= 0 ? "positive" : "negative";

  return (
    <div className="market-header card-flat">
      <div className="instrument-picker">
        <SearchSelect
          value={preferences.symbol}
          searchPlaceholder="Filter instruments…"
          options={symbols.map((symbol) => ({
            value: symbol.symbol,
            label: symbol.name,
            meta: symbol.symbol,
          }))}
          onChange={onSymbolChange}
        />
      </div>

      <div className="market-quote">
        <strong>{price(latest?.close)}</strong>
        <span className={changeClass}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(5)} ({changePercent >= 0 ? "+" : ""}
          {changePercent.toFixed(2)}%)
        </span>
      </div>

      <div className="ohlc">
        <span>
          O <b>{price(latest?.open)}</b>
        </span>
        <span>
          H <b className="positive">{price(latest?.high)}</b>
        </span>
        <span>
          L <b className="negative">{price(latest?.low)}</b>
        </span>
        <span>
          C <b>{price(latest?.close)}</b>
        </span>
      </div>
    </div>
  );
}
