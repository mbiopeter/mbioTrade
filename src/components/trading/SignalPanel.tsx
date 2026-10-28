"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CirclePause,
  ShieldAlert,
  Target,
} from "lucide-react";
import type { Signal } from "@/lib/types";

export function SignalPanel({ signal }: { signal: Signal | null }) {
  if (!signal) {
    return (
      <div className="card signal-card empty-signal">
        <CirclePause size={24} />
        <div>
          <strong>No qualified entry</strong>
          <p>
            The selected strategy combination is waiting for enough agreement.
          </p>
        </div>
      </div>
    );
  }

  const isUp = signal.direction === "UP";

  return (
    <div className={`card signal-card ${isUp ? "up" : "down"}`}>
      <div className="signal-head">
        <div className="signal-icon">
          {isUp ? <ArrowUpRight /> : <ArrowDownRight />}
        </div>
        <div>
          <span>Qualified multiplier signal</span>
          <h3>
            {signal.direction} · {signal.confidence}% confidence
          </h3>
        </div>
        <span className="regime-pill">{signal.regime}</span>
      </div>

      <div className="signal-levels">
        <div>
          <span>Entry</span>
          <strong>{signal.entry.toFixed(5)}</strong>
        </div>
        <div>
          <span>Stop loss</span>
          <strong>{signal.stopLoss.toFixed(5)}</strong>
        </div>
        <div>
          <span>Take profit</span>
          <strong>{signal.takeProfit.toFixed(5)}</strong>
        </div>
        <div>
          <span>R:R</span>
          <strong>1:{signal.riskReward.toFixed(1)}</strong>
        </div>
      </div>

      <div className="signal-note">
        <ShieldAlert size={15} />
        <span>
          SL/TP are analytical underlying-price levels. Multiplier contract
          pricing and platform fees can differ.
        </span>
      </div>

      <div className="vote-list">
        {signal.votes.map((vote) => (
          <div key={vote.id} className="vote-row">
            <span className={`vote-dir ${vote.direction.toLowerCase()}`}>
              {vote.direction}
            </span>
            <div>
              <strong>{vote.name}</strong>
              <small>{vote.reason}</small>
            </div>
            <b>{Math.round(vote.score)}</b>
          </div>
        ))}
      </div>

      <div className="signal-foot">
        <span>
          <BellRing size={15} /> Alert includes entry, TP and SL
        </span>
        <span>
          <Target size={15} /> Confluence filtered
        </span>
      </div>
    </div>
  );
}
