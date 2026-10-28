"use client";

import { BellRing, Copy, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import type { Signal } from "@/lib/types";

function signalText(signal: Signal): string {
  return [
    `${signal.direction} ${signal.symbol}`,
    `Entry ${signal.entry}`,
    `TP ${signal.takeProfit}`,
    `SL ${signal.stopLoss}`,
    `Confidence ${signal.confidence}%`,
  ].join("\n");
}

export default function AlertsPage() {
  const { signals, clearSignals } = useApp();
  const { toast } = useToast();

  const copySignal = async (signal: Signal) => {
    try {
      await navigator.clipboard.writeText(signalText(signal));
      toast({ title: "Signal copied", tone: "success" });
    } catch {
      toast({
        title: "Could not copy signal",
        message: "Clipboard access is blocked by this browser.",
        tone: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Journal"
        title="Qualified signal history"
        description="Only signals that passed the active combination's agreement and confidence thresholds appear here."
        actions={
          <button
            type="button"
            className="btn secondary slim"
            onClick={clearSignals}
            disabled={!signals.length}
          >
            <Trash2 size={16} />
            Clear journal
          </button>
        }
      />

      {signals.length ? (
        <div className="signal-journal">
          {signals.map((signal) => (
            <article key={signal.id} className="card journal-card">
              <div className="journal-main">
                <span className={`dir large ${signal.direction.toLowerCase()}`}>
                  {signal.direction}
                </span>
                <div>
                  <h3>
                    {signal.symbol} · {signal.timeframe / 60}m
                  </h3>
                  <p>
                    {new Date(signal.createdAt).toLocaleString()} · {signal.regime}
                    {" "}regime · {signal.confidence}% confidence
                  </p>
                </div>
              </div>

              <div className="journal-levels">
                <span>
                  Entry <b>{signal.entry.toFixed(5)}</b>
                </span>
                <span>
                  TP <b>{signal.takeProfit.toFixed(5)}</b>
                </span>
                <span>
                  SL <b>{signal.stopLoss.toFixed(5)}</b>
                </span>
                <span>
                  R:R <b>1:{signal.riskReward.toFixed(1)}</b>
                </span>
              </div>

              <button
                type="button"
                className="icon-btn"
                title="Copy signal"
                onClick={() => void copySignal(signal)}
              >
                <Copy size={17} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="card empty-block">
          <BellRing size={26} />
          <strong>No qualified signals yet</strong>
          <span>
            Keep live market data running in the terminal. Qualified signals
            are saved locally after confluence passes your thresholds.
          </span>
        </div>
      )}
    </>
  );
}
