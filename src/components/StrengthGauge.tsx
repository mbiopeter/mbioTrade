"use client";

import dynamic from "next/dynamic";
import type { FrameAnalysis } from "@/lib/v22/analysis";

// Third-party maintained gauge: pointer, colored arcs, and animation are
// implemented by react-gauge-component, not by bespoke SVG path code.
// The library uses SVG browser measurements; disable server rendering.
const GaugeComponent = dynamic(() => import("react-gauge-component"), {
  ssr: false,
  loading: () => <div className="mbiotraders-gauge-skeleton" role="status" aria-label="Loading market strength gauge" />,
});

const SEGMENTS = [
  { limit: -60, color: "#f55061" },
  { limit: -20, color: "#f69a7f" },
  { limit: 20, color: "#d1d8c6" },
  { limit: 60, color: "#91da73" },
  { limit: 100, color: "#2ce386" },
] as const;

function rating(score: number) {
  if (score >= 58) return "Strong Buy";
  if (score >= 18) return "Buy";
  if (score <= -58) return "Strong Sell";
  if (score <= -18) return "Sell";
  return "Neutral";
}

export function StrengthGauge({ analysis, score }: { analysis: FrameAnalysis; score: number }) {
  const value = Number.isFinite(score) ? Math.max(-100, Math.min(100, score)) : 0;
  const direction = value >= 18 ? "up" : value <= -18 ? "down" : "flat";
  return (
    <div className="mbiotraders-gauge-wrap" role="group" aria-label="Live indicator-strength gauge">
      <div className="mbiotraders-gauge-widget" role="meter" aria-label="Directional technical-indicator consensus" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-valuetext={`${rating(value)}; directional score ${Math.round(value)} of minus 100 to 100`}>
        <GaugeComponent
          id="mbiotraders-market-strength"
          type="semicircle"
          value={value}
          minValue={-100}
          maxValue={100}
          arc={{
            padding: 0.017,
            width: 0.17,
            cornerRadius: 8,
            subArcs: [...SEGMENTS],
          }}
          pointer={{
            type: "needle",
            color: "#e7f2ed",
            baseColor: "#30d68e",
            length: 0.73,
            width: 8,
            elastic: false,
            animate: true,
            animationDuration: 450,
          }}
          labels={{
            valueLabel: { hide: true },
            tickLabels: { hideMinMax: true },
          }}
          marginInPercent={{ top: 0.08, right: 0.055, bottom: 0, left: 0.055 }}
        />
        <div className="mbiotraders-gauge-labels" aria-hidden="true"><span>Strong Sell</span><span>Strong Buy</span></div>
      </div>
      <div className={`mbiotraders-gauge-badge ${direction}`}>{rating(value)}</div>
      <div className="mbiotraders-gauge-counts">
        <div><span>Sell</span><strong className="down">{analysis.moving.sell + analysis.oscillators.sell}</strong></div>
        <div><span>Neutral</span><strong>{analysis.moving.neutral + analysis.oscillators.neutral}</strong></div>
        <div><span>Buy</span><strong className="up">{analysis.moving.buy + analysis.oscillators.buy}</strong></div>
      </div>
    </div>
  );
}
