"use client";

import { Bell, SlidersHorizontal } from "lucide-react";
import { Field, Input, Segmented } from "@/components/ui/controls";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import { ACCEPTED_MULTIPLIERS } from "@/lib/multipliers";
import type { ExecutionMode, RiskSettings } from "@/lib/types";
import { TradeAmountSetting } from "./TradeAmountSetting";

const EXECUTION_OPTIONS = [
  { value: "signals" as ExecutionMode, label: "Signals" },
  { value: "manual" as ExecutionMode, label: "Manual" },
  { value: "automatic" as ExecutionMode, label: "Automatic" },
];

export function TradingBehaviorSection() {
  const { preferences, updatePreferences } = useApp();
  const { toast } = useToast();

  const updateRisk = (patch: Partial<RiskSettings>) => {
    updatePreferences({ risk: { ...preferences.risk, ...patch } });
  };

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") {
      toast({
        title: "Browser notifications are unavailable",
        tone: "error",
      });
      return;
    }

    const permission = await Notification.requestPermission();
    toast({
      title:
        permission === "granted"
          ? "Trade alerts enabled"
          : "Notification permission not granted",
      tone: permission === "granted" ? "success" : "info",
    });
  };

  return (
    <section className="card settings-section">
      <div className="settings-title">
        <div className="settings-icon">
          <SlidersHorizontal />
        </div>
        <div>
          <h2>Trading behavior</h2>
          <p>
            Manual and automatic trading use the same settings on the connected demo or
            real account.
          </p>
        </div>
      </div>

      <Field label="Execution mode">
        <Segmented
          value={preferences.executionMode}
          ariaLabel="Execution mode"
          options={EXECUTION_OPTIONS}
          onChange={(executionMode) => updatePreferences({ executionMode })}
        />
      </Field>

      <p className="accepted-note">
        Automatic mode places qualified trades on the selected account without asking
        for manual confirmation. Every new entry follows the confirmed trend, including
        manual tickets. Signals mode sends no new orders.
      </p>

      <Field label="Automatic execution runs on">
        <Segmented
          value={preferences.automationExecutor}
          ariaLabel="Automatic execution location"
          options={[
            { value: "browser" as const, label: "This browser" },
            { value: "worker" as const, label: "Background worker" },
          ]}
          onChange={(automationExecutor) => updatePreferences({ automationExecutor })}
        />
      </Field>
      <p className="accepted-note">
        {preferences.automationExecutor === "worker"
          ? "Browser automatic entries and price exits are paused. Configure and start the worker separately. Use one automatic runner per account."
          : "Keep the app open for browser analysis and price exits. Run automatic trading on one device per Deriv account; other devices can monitor or trade manually."}
      </p>

      <Field label="Multiplier">
        <div className="multiplier-grid settings-multipliers">
          {ACCEPTED_MULTIPLIERS.map((value) => (
            <button
              type="button"
              key={value}
              className={preferences.risk.multiplier === value ? "active" : ""}
              aria-pressed={preferences.risk.multiplier === value}
              onClick={() => updateRisk({ multiplier: value })}
            >
              {value}×
            </button>
          ))}
        </div>
      </Field>

      <p className="accepted-note">
        Selectable values: <b>{ACCEPTED_MULTIPLIERS.join(", ")}</b>. The minimum and
        new-workspace default are 100×. Availability and minimum amounts depend on the
        Deriv market and account; the quote must confirm them.
      </p>
      <p className="accepted-note">
        Saved choices removed in v14 are changed to 100× with Signals mode enabled.
        Review the increased exposure and choose an execution mode before placing
        another trade. Existing open positions keep their broker multiplier.
      </p>
      <p className="accepted-note">
        At your selected amount, a 0.1% price movement represents about{" "}
        <b>
          {(preferences.risk.stake * preferences.risk.multiplier * 0.001).toFixed(2)}
        </b>{" "}
        account-currency units before fees. This controls multiplier exposure, not a CFD
        lot size, and does not change an already-open position.
      </p>

      <div className="form-grid two">
        <TradeAmountSetting
          value={preferences.risk.stake}
          onChange={(stake) => updateRisk({ stake })}
        />

        <Field label="Margin / exposure limit">
          <Input
            type="number"
            min={1}
            value={preferences.risk.marginBudget}
            onChange={(event) =>
              updateRisk({
                marginBudget: Math.max(1, Number(event.target.value) || 75),
              })
            }
          />
        </Field>

        <Field label="Daily loss cap (UTC)">
          <Input
            type="number"
            min={1}
            value={preferences.risk.maxDailyDemoLoss}
            onChange={(event) =>
              updateRisk({
                maxDailyDemoLoss: Math.max(1, Number(event.target.value) || 25),
              })
            }
          />
        </Field>

        <Field label="ATR stop distance">
          <Input
            type="number"
            min={0.25}
            max={8}
            step={0.05}
            value={preferences.risk.atrStop}
            onChange={(event) =>
              updateRisk({
                atrStop: Math.max(0.25, Math.min(8, Number(event.target.value) || 1.5)),
              })
            }
          />
        </Field>

        <Field label="Risk / reward">
          <Input
            type="number"
            min={0.5}
            max={8}
            step={0.1}
            value={preferences.risk.riskReward}
            onChange={(event) =>
              updateRisk({
                riskReward: Math.max(0.5, Math.min(8, Number(event.target.value) || 2)),
              })
            }
          />
        </Field>

        <Field label="Maximum open trades">
          <Input
            type="number"
            min={1}
            max={10}
            step={1}
            value={preferences.risk.maxOpenDemoTrades}
            onChange={(event) =>
              updateRisk({
                maxOpenDemoTrades: Math.max(
                  1,
                  Math.min(10, Math.round(Number(event.target.value) || 1)),
                ),
              })
            }
          />
        </Field>

        <Field label="Trade cooldown (minutes)">
          <Input
            type="number"
            min={0}
            max={1440}
            step={1}
            value={preferences.risk.cooldownMinutes}
            onChange={(event) =>
              updateRisk({
                cooldownMinutes: Math.max(
                  0,
                  Math.min(1440, Math.round(Number(event.target.value) || 0)),
                ),
              })
            }
          />
        </Field>
      </div>

      <div className="setting-line">
        <div>
          <strong>Browser trade alerts</strong>
          <span>Signal, account open and account close notifications.</span>
        </div>
        <button
          type="button"
          className="btn secondary slim"
          onClick={() => void requestNotifications()}
        >
          <Bell size={15} />
          Enable
        </button>
      </div>
    </section>
  );
}
