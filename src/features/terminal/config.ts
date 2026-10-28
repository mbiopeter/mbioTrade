import type { MarketClass, Timeframe } from "@/lib/types";

export type TicketTab = "ticket" | "open" | "market";

export const TIMEFRAME_OPTIONS: Array<{
  value: Timeframe;
  label: string;
}> = [
  { value: 60, label: "1m" },
  { value: 300, label: "5m" },
  { value: 900, label: "15m" },
  { value: 1800, label: "30m" },
  { value: 3600, label: "1h" },
  { value: 14400, label: "4h" },
  { value: 86400, label: "D" },
];

export const MARKET_CLASS_OPTIONS: Array<{
  value: MarketClass;
  label: string;
}> = [
  { value: "forex", label: "Forex" },
  { value: "cryptocurrency", label: "Crypto" },
  { value: "metals", label: "Gold" },
];

export function timeframeLabel(timeframe: Timeframe): string {
  return (
    TIMEFRAME_OPTIONS.find((option) => option.value === timeframe)?.label ??
    String(timeframe)
  );
}
