import Link from "next/link";
import {
  BookOpen,
  Cloud,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DERIV_APP_ID_EXAMPLE } from "@/lib/deriv-app-id";

export default function DocumentationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Documentation"
        title="MbioTrade v14 setup guide"
        description="Connect your Deriv account to synchronize positions across devices and use the same trading modes on demo and real accounts."
      />

      <div className="docs-grid equal-grid">
        <section className="card doc-card">
          <div className="doc-icon">
            <Zap />
          </div>
          <h2>1. Start without a login</h2>
          <p>
            MbioTrade has no registration screen. Open the application and use public
            Forex, Crypto and supported Gold candles, strategies, scanning and
            backtesting immediately.
          </p>
          <p>
            A Deriv connection is required only for account balance, portfolio data and
            broker-linked multiplier execution on demo or real accounts.
          </p>
        </section>

        <section className="card doc-card">
          <div className="doc-icon">
            <KeyRound />
          </div>
          <h2>2. Connect Deriv</h2>
          <ol>
            <li>Create or obtain a Deriv App ID.</li>
            <li>Create a scoped API key/token and treat it like a password.</li>
            <li>
              Open <Link href="/settings">Settings → Deriv connection</Link>.
            </li>
            <li>Enter both values and select Discover accounts.</li>
            <li>Choose the returned Demo or Real account, then connect.</li>
          </ol>
          <p>
            The App ID must contain letters and numbers, for example{" "}
            <code>{DERIV_APP_ID_EXAMPLE}</code>. It is read only from Settings; the
            optional background worker has separate server configuration.
          </p>
          <a
            className="text-link"
            href="https://developers.deriv.com/docs/intro/authentication/"
            target="_blank"
            rel="noreferrer"
          >
            Official Deriv authentication guide <ExternalLink size={13} />
          </a>
        </section>

        <section className="card doc-card">
          <div className="doc-icon">
            <TerminalSquare />
          </div>
          <h2>3. Run the project</h2>
          <pre>
            <code>{`npm install\nnpm run setup\nnpm run dev`}</code>
          </pre>
          <p>
            Open <b>http://localhost:3000</b>. The root route enters the terminal
            directly.
          </p>
          <p>
            Deploy the Next.js app on Vercel. For analysis after the browser closes,
            configure the optional worker using the included
            <code> docs/BACKGROUND-WORKER.md</code> guide.
          </p>
          <p>
            Use <code>npm run quality</code> during development and{" "}
            <code>npm run build:ready</code> before deployment.
          </p>
        </section>

        <section className="card doc-card">
          <div className="doc-icon">
            <ShieldCheck />
          </div>
          <h2>4. Valid multiplier values</h2>
          <p>The trade ticket permits only:</p>
          <pre>
            <code>100, 200, 300, 500, 800</code>
          </pre>
          <p>
            New workspaces default to <b>100×</b>. Removed saved values below 100 become
            100× and Signals mode for review. Existing positions retain their original
            size. The broker quote confirms availability and required amounts.
          </p>
        </section>

        <section className="card doc-card">
          <div className="doc-icon">
            <ShieldCheck />
          </div>
          <h2>5. Trading terminology and modes</h2>
          <ul>
            <li>
              <b>Trade amount:</b> the monetary stake sent with the Deriv multiplier
              proposal. The default is $20.00 and the minimum is $1.00.
            </li>
            <li>
              <b>Margin:</b> MbioTrade exposure budget, not conventional CFD margin.
            </li>
            <li>
              <b>Signals:</b> analysis and notifications only.
            </li>
            <li>
              <b>Manual:</b> choose Buy or Sell on the connected demo or real account. A
              pattern signal is not required, but the direction must follow the
              confirmed trend.
            </li>
            <li>
              <b>Automatic:</b> qualified entries execute on the connected account
              within your risk limits, without a per-trade confirmation.
            </li>
            <li>
              <b>Execution owner:</b> use one browser or one background worker per
              account. Other devices can monitor and close positions.
            </li>
          </ul>
        </section>

        <section className="card doc-card">
          <div className="doc-icon">
            <Sparkles />
          </div>
          <h2>6. Strategies</h2>
          <p>
            Apply a configured setup for EURUSD, GBPUSD, USDJPY, AUDUSD or XAUUSD, or
            use General Trend Pullback on your selected market. Each card explains its
            exact entry conditions, chart, ATR stop and reward/risk defaults.
          </p>
          <p>
            Every strategy follows the confirmed EMA50/EMA200 trend using at least 205
            completed candles. Apply pauses browser entries in Signals for review and
            preserves your stake and account limits. Existing combinations remain
            editable.
          </p>
          <p>
            The methods draw on established trend/continuation concepts. Their exact
            intraday settings have not been verified profitable on Deriv. The included
            <code> docs/V14-STRATEGY-GUIDE.md</code> explains the rules and evidence
            limits.
          </p>
          <Link className="text-link" href="/strategies">
            Open Strategy Lab →
          </Link>
        </section>

        <section className="card doc-card">
          <div className="doc-icon">
            <Cloud />
          </div>
          <h2>7. Local and Google sync</h2>
          <ol>
            <li>
              Deriv restores current positions and confirms closures. Local storage
              keeps preferences, combinations and journal notes.
            </li>
            <li>Create a Google OAuth Web Client ID for cloud backup.</li>
            <li>Add localhost and the deployed origin to allowed origins.</li>
            <li>Paste the Client ID in Settings and select Sync now.</li>
          </ol>
          <p>
            Google Drive App Data stores a validated workspace snapshot. Deriv API keys
            are excluded. Remember API key stores the key on this browser only. Use
            Forget saved key to remove it.
          </p>
        </section>

        <section className="card doc-card">
          <div className="doc-icon">
            <BookOpen />
          </div>
          <h2>8. Three-month replay</h2>
          <p>
            Recent candles render first, then MbioTrade backfills toward about 92 days.
            Backtesting processes the loaded sequence in memory rather than waiting for
            historical candle time.
          </p>
          <p>
            OHLC replay cannot reconstruct every historical proposal quote, spread, fee
            or slippage condition. Results are analytical estimates, not broker
            statements.
          </p>
        </section>
      </div>
    </>
  );
}
