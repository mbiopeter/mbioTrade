"use client";

import { BookOpenCheck, CopyPlus, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Switch } from "@/components/ui/controls";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import { StrategyPresetChooser } from "@/features/strategies/StrategyPresetChooser";
import { DEFAULT_COMBOS } from "@/lib/defaults";
import { detectRegime, recommendComboId, STRATEGY_CATALOG } from "@/lib/strategies";
import type { StrategyCombo, StrategyConfig } from "@/lib/types";
import { useMarketFeed } from "@/lib/use-market";

export default function StrategiesPage() {
  const {
    combos,
    setCombos,
    activeComboId,
    setActiveComboId,
    activateCombo,
    activeCombo,
    preferences,
    hydrated,
  } = useApp();
  const { toast } = useToast();
  const feed = useMarketFeed(
    preferences.symbol,
    preferences.timeframe,
    preferences.marketClass,
    false,
  );
  const regime = detectRegime(feed.candles.slice(-600));

  const updateCombo = (nextCombo: StrategyCombo) => {
    setCombos(combos.map((combo) => (combo.id === nextCombo.id ? nextCombo : combo)));
  };

  const addCombo = () => {
    const general = DEFAULT_COMBOS.find((combo) => combo.id === "v14-general-pullback");
    if (!general) return;
    const nextCombo: StrategyCombo = {
      ...general,
      id: crypto.randomUUID(),
      name: "New combination",
      createdAt: Date.now(),
      strategies: general.strategies.map((strategy) => ({ ...strategy })),
    };
    activateCombo(nextCombo);
    toast({
      title: "New combination created",
      message:
        "Starts with General trend pullback. Browser entries are paused in Signals while you edit.",
      tone: "success",
    });
  };

  const duplicateCombo = () => {
    const nextCombo: StrategyCombo = {
      ...activeCombo,
      id: crypto.randomUUID(),
      name: `${activeCombo.name.slice(0, 55)} copy`,
      createdAt: Date.now(),
      strategies: activeCombo.strategies.map((strategy) => ({ ...strategy })),
    };
    activateCombo(nextCombo);
    toast({
      title: "Combination duplicated",
      message:
        "Entry methods and pair scope are preserved. Browser entries are paused in Signals while you edit.",
      tone: "success",
    });
  };

  const removeCombo = () => {
    if (combos.length <= 1) {
      return;
    }
    const remaining = combos.filter((combo) => combo.id !== activeCombo.id);
    setCombos(remaining);
    setActiveComboId(remaining[0].id);
  };

  const recommendCombo = () => {
    const recommendedId = recommendComboId(
      preferences.symbol,
      preferences.timeframe,
      regime,
      combos,
    );
    const recommended = combos.find((combo) => combo.id === recommendedId);
    if (!recommended) {
      return;
    }

    setActiveComboId(recommended.id);
    toast({
      title: "Recommended combination selected",
      message: `${recommended.name} · ${preferences.symbol} · ${regime} regime. Market, timeframe and risk settings are unchanged; use Apply preset to configure them.`,
      tone: "success",
    });
  };

  const updateStrategy = (strategyId: string, patch: Partial<StrategyConfig>) => {
    const existing = activeCombo.strategies.find(
      (strategy) => strategy.id === strategyId,
    );
    const strategies = existing
      ? activeCombo.strategies.map((strategy) =>
          strategy.id === strategyId ? { ...strategy, ...patch } : strategy,
        )
      : [
          ...activeCombo.strategies,
          { id: strategyId, enabled: false, weight: 1, ...patch },
        ];
    updateCombo({ ...activeCombo, strategies });
  };

  return (
    <>
      <PageHeader
        eyebrow="Strategy lab"
        title="Build and auto-select confluence"
        description={
          "Apply a configured trend setup, or keep building your own combination. " +
          "Auto recommend selects a method for the current market; use Apply preset to load its full settings."
        }
        actions={
          <div className="toolbar">
            <button
              type="button"
              className="btn secondary slim"
              onClick={recommendCombo}
            >
              <Sparkles size={16} />
              Auto recommend
            </button>
            <button
              type="button"
              className="btn secondary slim"
              onClick={duplicateCombo}
              disabled={!hydrated}
              title="Duplicate the current methods and pause browser entries in Signals"
            >
              <CopyPlus size={16} />
              Duplicate
            </button>
            <button
              type="button"
              className="btn primary slim"
              onClick={addCombo}
              disabled={!hydrated}
              title="Create a General trend pullback combination and pause browser entries in Signals"
            >
              <Plus size={16} />
              New combo
            </button>
          </div>
        }
      />

      <StrategyPresetChooser />

      <div className="recommend-strip card">
        <div>
          <span>Current market profile</span>
          <strong>
            {preferences.symbol} · {Math.round(preferences.timeframe / 60)}m · {regime}
          </strong>
        </div>
        <div>
          <span>Active combination</span>
          <strong>{activeCombo.name}</strong>
        </div>
        <button type="button" className="btn primary slim" onClick={recommendCombo}>
          <Sparkles size={15} />
          Recommend now
        </button>
      </div>

      <section className="strategy-layout">
        <aside className="card combo-list">
          <span className="section-kicker">Combinations</span>
          {combos.map((combo) => (
            <button
              type="button"
              key={combo.id}
              className={`combo-item ${combo.id === activeComboId ? "active" : ""}`}
              onClick={() => setActiveComboId(combo.id)}
            >
              <div>
                <strong>{combo.name}</strong>
                <small>
                  {combo.strategies.filter((strategy) => strategy.enabled).length}{" "}
                  strategies · {combo.minConfidence}% threshold
                </small>
              </div>
              <span>→</span>
            </button>
          ))}
        </aside>

        <div className="card builder">
          <div className="builder-head">
            <div>
              <span>Combination editor</span>
              <Input
                value={activeCombo.name}
                maxLength={60}
                onChange={(event) =>
                  updateCombo({ ...activeCombo, name: event.target.value })
                }
              />
            </div>
            <div className="builder-actions">
              <button
                type="button"
                className="icon-btn danger"
                onClick={removeCombo}
                disabled={combos.length <= 1}
                aria-label="Delete combination"
              >
                <Trash2 size={17} />
              </button>
              <button
                type="button"
                className="btn primary slim"
                onClick={() =>
                  toast({
                    title: "Combination saved",
                    message: "Changes are stored locally as you edit.",
                    tone: "success",
                  })
                }
              >
                <Save size={16} />
                Save
              </button>
            </div>
          </div>

          <div className="threshold-row">
            <label>
              <span>Minimum confidence</span>
              <Input
                type="number"
                min={50}
                max={99}
                value={activeCombo.minConfidence}
                onChange={(event) =>
                  updateCombo({
                    ...activeCombo,
                    minConfidence: Math.max(
                      50,
                      Math.min(99, Number(event.target.value) || 70),
                    ),
                  })
                }
              />
            </label>
            <label>
              <span>Minimum agreeing strategies</span>
              <Input
                type="number"
                min={1}
                max={10}
                value={activeCombo.minAgreement}
                onChange={(event) =>
                  updateCombo({
                    ...activeCombo,
                    minAgreement: Math.max(
                      1,
                      Math.min(10, Math.round(Number(event.target.value) || 2)),
                    ),
                  })
                }
              />
            </label>
          </div>

          <div className="strategy-catalog">
            {STRATEGY_CATALOG.map((metadata) => {
              const config = activeCombo.strategies.find(
                (strategy) => strategy.id === metadata.id,
              ) ?? { id: metadata.id, enabled: false, weight: 1 };

              return (
                <article
                  key={metadata.id}
                  className={`strategy-card ${config.enabled ? "enabled" : ""}`}
                >
                  <div className="strategy-card-top">
                    <div className="strategy-glyph">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <span>{metadata.family}</span>
                      <h3>{metadata.name}</h3>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onChange={(enabled) => updateStrategy(metadata.id, { enabled })}
                    />
                  </div>

                  <p>{metadata.description}</p>
                  <div className="strategy-doc">
                    <div>
                      <BookOpenCheck size={13} />
                      <span>
                        <b>How:</b> {metadata.how}
                      </span>
                    </div>
                    <div>
                      <b>Best fit:</b> {metadata.bestFor}
                    </div>
                    <div>
                      <b>Watch:</b> {metadata.watch}
                    </div>
                  </div>

                  <label className="weight-row mt-2">
                    <span>Vote weight</span>
                    <Input
                      type="number"
                      min={0.1}
                      max={5}
                      step={0.05}
                      value={config.weight}
                      disabled={!config.enabled}
                      onChange={(event) =>
                        updateStrategy(metadata.id, {
                          weight: Math.max(
                            0.1,
                            Math.min(5, Number(event.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </label>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
