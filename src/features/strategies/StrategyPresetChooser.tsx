"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Compass, TrendingUp } from "lucide-react";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import { profileForCombo, STRATEGY_PROFILES } from "@/lib/strategies";

function timeframeLabel(seconds: number): string {
  if (seconds >= 86400) return `D${seconds / 86400}`;
  if (seconds >= 3600) return `H${seconds / 3600}`;
  return `M${seconds / 60}`;
}

export function StrategyPresetChooser() {
  const { activeCombo, preferences, applyStrategyPreset, hydrated } = useApp();
  const { toast } = useToast();
  const [notice, setNotice] = useState("");
  const selectedProfile = profileForCombo(activeCombo);
  const pairMismatch =
    selectedProfile?.symbol && selectedProfile.symbol !== preferences.symbol;

  const apply = (id: string) => {
    const profile = STRATEGY_PROFILES.find((candidate) => candidate.id === id);
    if (!profile) return;
    const result = applyStrategyPreset(id);
    if (!result) return;
    const message =
      `${profile.name} applied. Browser entries are paused in Signals. Review the settings, then select Manual or Automatic. ` +
      "For a separate worker, export the updated workspace and restart it with that configuration." +
      (result.preservedCustomCopy
        ? " Your edited preset was preserved as a saved copy."
        : "");
    setNotice(message);
    toast({ title: "Preset applied", message, tone: "success" });
  };

  return (
    <section className="strategy-presets card" aria-labelledby="strategy-presets-title">
      <div className="strategy-presets-heading">
        <div>
          <span className="section-kicker">Configured for v14</span>
          <h2 id="strategy-presets-title">Five markets. One direction: the trend.</h2>
          <p>
            Choose a pair setup or use the general pullback method on your current
            market.
          </p>
        </div>
        <span className="strategy-presets-trend-badge">
          <TrendingUp size={15} /> Trend filter always on
        </span>
      </div>

      <div className="strategy-presets-rule">
        <Compass size={18} aria-hidden="true" />
        <p>
          <strong>Every combination follows the confirmed trend.</strong> Long entries
          require the close above EMA50 above EMA200; shorts require the reverse. Both
          EMA slopes and their ATR-based separation must confirm the direction. Analysis
          waits when the trend is unclear or fewer than 205 completed candles are
          available.
        </p>
      </div>

      <p className="strategy-presets-evidence">
        These are established trend methods. These exact pair settings have not been
        verified profitable in this app.{" "}
        <a
          href="https://www.aqr.com/insights/research/journal-article/a-century-of-evidence-on-trend-following-investing"
          target="_blank"
          rel="noreferrer"
        >
          Read the research background <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      </p>

      <div className="strategy-presets-effects" id="preset-apply-effects">
        <strong>When you apply a preset</strong>
        <p>
          It sets the market, timeframe, entry rules, confidence threshold, ATR stop and
          reward-to-risk ratio shown below, and pauses browser entries in <b>Signals</b>
          . General keeps your current market. Stake, multiplier, account limits and
          credentials stay as configured; open positions keep their current protection.
        </p>
        <p>
          An edited built-in preset is preserved as a saved copy before its factory
          rules are restored. Applying does not start, stop or update a separate worker;
          export the new configuration and restart that worker to use it.
        </p>
      </div>

      <div className="strategy-preset-grid">
        {STRATEGY_PROFILES.map((profile) => {
          const marketLabel = profile.symbol?.replace(/^frx/, "") ?? "General";
          const selected = selectedProfile?.id === profile.id;
          return (
            <article
              className={`strategy-preset-card ${selected ? "selected" : ""}`}
              key={profile.id}
              data-preset-id={profile.id}
            >
              <div className="strategy-preset-card-top">
                <span className="strategy-preset-market">{marketLabel}</span>
                {selected && (
                  <span className="strategy-preset-selected">
                    <Check size={12} /> Selected method
                  </span>
                )}
              </div>
              <h3>{profile.name}</h3>
              <p className="strategy-preset-summary">{profile.summary}</p>
              <dl className="strategy-preset-metrics">
                <div>
                  <dt>Recommended chart</dt>
                  <dd>{timeframeLabel(profile.timeframe)}</dd>
                </div>
                <div>
                  <dt>ATR stop</dt>
                  <dd>{profile.atrStop} × ATR</dd>
                </div>
                <div>
                  <dt>Reward / risk</dt>
                  <dd>{profile.riskReward}:1</dd>
                </div>
              </dl>
              <p className="strategy-preset-threshold">
                {profile.minConfidence}% minimum confidence · 1 complete setup required
              </p>
              <details className="strategy-preset-rules">
                <summary>Entry conditions</summary>
                <ol>
                  {profile.entryRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ol>
              </details>
              <button
                type="button"
                className={`btn ${selected ? "secondary" : "primary"} slim`}
                aria-label={`Apply ${profile.symbol ? marketLabel : "general"} preset`}
                aria-describedby="preset-apply-effects"
                onClick={() => apply(profile.id)}
                disabled={!hydrated}
              >
                Apply {marketLabel === "General" ? "general" : marketLabel} preset{" "}
                <ArrowUpRight size={14} />
              </button>
            </article>
          );
        })}
      </div>
      {notice && (
        <div className="strategy-presets-notice inline-alert success" role="status">
          {notice}
        </div>
      )}
      {pairMismatch && (
        <p className="strategy-presets-mismatch">
          The selected method is scoped to {selectedProfile.symbol?.replace(/^frx/, "")}
          , while your market is {preferences.symbol}. Its entries will wait. Apply its
          preset to switch to that market, or choose General for your current market.
        </p>
      )}
    </section>
  );
}
