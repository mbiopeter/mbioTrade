"use client";

import Link from "next/link";
import {
  BarChart3,
  BookOpenCheck,
  Cloud,
  Crosshair,
  FlaskConical,
  KeyRound,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

type TutorialStep = {
  title: string;
  text: string;
  href: string;
  action: string;
};

type TutorialGuide = {
  label: string;
  icon: LucideIcon;
  steps: TutorialStep[];
};

const GUIDES = {
  start: {
    label: "Getting started",
    icon: BookOpenCheck,
    steps: [
      {
        title: "Choose Forex, Crypto or Gold",
        text: "Open Terminal and use the market buttons above the chart.",
        href: "/terminal",
        action: "Open terminal",
      },
      {
        title: "Choose a timeframe",
        text: "Use 1m, 5m, 15m, 30m, 1h, 4h or 1D. MbioTrade backfills approximately three months for the selected timeframe.",
        href: "/terminal",
        action: "Choose timeframe",
      },
      {
        title: "Use chart full screen",
        text: "Select the full-screen button in the chart header when you need maximum chart space. Navigation remains fixed-width.",
        href: "/terminal",
        action: "Open chart",
      },
    ],
  },
  account: {
    label: "Connect Deriv",
    icon: KeyRound,
    steps: [
      {
        title: "Create an App ID and API key",
        text: "Create a Deriv App ID and scoped API key/token. MbioTrade itself has no account or login requirement.",
        href: "/docs",
        action: "Read setup docs",
      },
      {
        title: "Discover accounts",
        text: "Enter both values in Settings, then select Discover accounts. MbioTrade loads the available account IDs automatically.",
        href: "/settings",
        action: "Connect Deriv",
      },
      {
        title: "Connection recovery is automatic",
        text: "If the network drops, MbioTrade reconnects, obtains a fresh authenticated URL and restores balance and transaction subscriptions.",
        href: "/profile",
        action: "View connection",
      },
    ],
  },
  strategy: {
    label: "Strategy selection",
    icon: Sparkles,
    steps: [
      {
        title: "Open Strategy Lab",
        text: "Every method includes How, Best fit and Watch notes.",
        href: "/strategies",
        action: "Open strategies",
      },
      {
        title: "Use Auto recommend",
        text: "MbioTrade evaluates the selected instrument, timeframe and detected regime, then selects a suitable saved combination.",
        href: "/strategies",
        action: "Recommend combo",
      },
      {
        title: "Replay before trusting it",
        text: "Use the accelerated replay and Trade Analysis page instead of assuming that a preset is profitable.",
        href: "/backtest",
        action: "Backtest",
      },
    ],
  },
  trade: {
    label: "Trade workflow",
    icon: Crosshair,
    steps: [
      {
        title: "Choose signal-based or manual entry",
        text: "Use a qualified strategy signal, or select Buy/Long or Sell/Short manually. Manual trading does not require a signal.",
        href: "/terminal",
        action: "Open trade ticket",
      },
      {
        title: "Review Entry, TP and SL",
        text: "Signals use the strategy plan. Manual entries use the live price and ATR risk settings and are clearly labeled with no strategy confidence.",
        href: "/terminal",
        action: "Review trade plan",
      },
      {
        title: "Understand Amount and Margin",
        text: "Trade amount is the Deriv stake. It defaults to $20.00 and must be at least $1.00. Margin remains MbioTrade's exposure budget.",
        href: "/settings",
        action: "Open risk settings",
      },
    ],
  },
  backtest: {
    label: "Backtesting",
    icon: FlaskConical,
    steps: [
      {
        title: "Load three-month history",
        text: "Choose market, instrument and timeframe, then wait for the history progress bar to complete.",
        href: "/backtest",
        action: "Open backtest",
      },
      {
        title: "Set replay assumptions",
        text: "Configure starting balance, trade amount, multiplier, ATR stop, reward ratio, hold bars and commission estimate.",
        href: "/backtest",
        action: "Configure replay",
      },
      {
        title: "Run accelerated replay",
        text: "The candle sequence is processed in memory instead of waiting for historical candle time.",
        href: "/backtest",
        action: "Run replay",
      },
    ],
  },
  analysis: {
    label: "Trade analysis",
    icon: BarChart3,
    steps: [
      {
        title: "Open Trade Analysis",
        text: "Review closed account performance, win rate, P/L, profit factor and drawdown.",
        href: "/analysis",
        action: "Open analysis",
      },
      {
        title: "Compare combinations",
        text: "The Strategies tab groups trades by the strategy combination that produced each signal.",
        href: "/analysis",
        action: "Compare strategies",
      },
      {
        title: "Review account activity",
        text: "The Activity tab stores connected buy and sell transaction events locally for later review.",
        href: "/analysis",
        action: "View activity",
      },
    ],
  },
  scanner: {
    label: "Scanner",
    icon: ScanSearch,
    steps: [
      {
        title: "Choose a market class",
        text: "Scanner supports Forex, Crypto and available Gold markets.",
        href: "/scanner",
        action: "Open scanner",
      },
      {
        title: "Add up to six markets",
        text: "Use the searchable picker, then scan the active combination across all selected markets.",
        href: "/scanner",
        action: "Build scan",
      },
    ],
  },
  sync: {
    label: "Backup and sync",
    icon: Cloud,
    steps: [
      {
        title: "Local sync is automatic",
        text: "Preferences, combinations, signals and journals use localStorage and synchronize across open MbioTrade tabs.",
        href: "/settings",
        action: "View sync settings",
      },
      {
        title: "Optional Google Drive",
        text: "Create a Google OAuth Web Client ID, connect Google, then use Sync now. The backup lives in Drive App Data.",
        href: "/docs",
        action: "Google setup guide",
      },
    ],
  },
} satisfies Record<string, TutorialGuide>;

type GuideId = keyof typeof GUIDES;

export default function TutorialsPage() {
  const [activeGuideId, setActiveGuideId] = useState<GuideId>("start");
  const guide = GUIDES[activeGuideId];
  const GuideIcon = guide.icon;

  return (
    <>
      <PageHeader
        eyebrow="Guided help"
        title="MbioTrade tutorials"
        description="Choose an action. Each guide links directly to the screen where that task is performed."
      />

      <div className="tutorial-tabs">
        {(Object.entries(GUIDES) as Array<[GuideId, TutorialGuide]>).map(
          ([id, item]) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={id}
                className={activeGuideId === id ? "active" : ""}
                onClick={() => setActiveGuideId(id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          },
        )}
      </div>

      <section className="tutorial-layout equal-grid">
        <div className="card tutorial-intro">
          <div className="tutorial-hero-icon">
            <GuideIcon size={24} />
          </div>
          <span>Step-by-step</span>
          <h2>{guide.label}</h2>
          <p>
            Follow the steps in order. Tutorials stay separate from the terminal so they
            never block live analysis.
          </p>
          <div className="inline-alert info">
            <ShieldCheck size={16} />
            Demo automation is available. Real-account monitoring can alert on
            transactions, while real-money orders require explicit confirmation.
          </div>
        </div>

        <div className="tutorial-steps">
          {guide.steps.map((step, index) => (
            <article key={step.title} className="card tutorial-step">
              <div className="step-no">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <Link href={step.href} className="btn secondary slim">
                  {step.action} →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
