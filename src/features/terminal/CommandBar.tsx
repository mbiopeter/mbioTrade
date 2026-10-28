"use client";

import { Expand, RefreshCw, Wifi } from "lucide-react";
import { StrategyComboPicker } from "@/components/trading/StrategyComboPicker";
import { Segmented } from "@/components/ui/controls";
import type { Preferences } from "@/lib/types";
import { MARKET_CLASS_OPTIONS, TIMEFRAME_OPTIONS } from "./config";

export type CommandBarProps = {
  preferences: Preferences;
  live: boolean;
  onPreferencesChange: (patch: Partial<Preferences>) => void;
  onReload: () => void;
  onFullscreen: () => void;
};

export function CommandBar({
  preferences,
  live,
  onPreferencesChange,
  onReload,
  onFullscreen,
}: CommandBarProps) {
  return (
    <div className="chart-commandbar card-flat">
      <div className="tf-strip v8-tf" aria-label="Chart timeframe">
        {TIMEFRAME_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            className={preferences.timeframe === option.value ? "active" : ""}
            onClick={() =>
              onPreferencesChange({ timeframe: option.value })
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      <Segmented
        value={preferences.marketClass}
        ariaLabel="Market type"
        options={MARKET_CLASS_OPTIONS}
        onChange={(marketClass) => onPreferencesChange({ marketClass })}
      />

      <StrategyComboPicker />

      <div className={`feed-status ${live ? "live" : ""}`}>
        <Wifi size={15} />
        {live ? "Live" : "Offline"}
      </div>

      <button
        type="button"
        className="icon-btn"
        onClick={onReload}
        title="Refresh candles"
        aria-label="Refresh candles"
      >
        <RefreshCw size={17} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onFullscreen}
        title="Full-screen chart"
        aria-label="Open full-screen chart"
      >
        <Expand size={17} />
      </button>
    </div>
  );
}
