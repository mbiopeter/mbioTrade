# Background analysis and trading

The web application deploys to Vercel as a normal Next.js application. The optional
worker runs the same strategy engine on a server, so closing every browser does not stop
its analysis. It uses Deriv for positions, balance, transaction history, and contract
protection. It does not require a database.

The worker is a separate process and starts in **signals mode**. Selecting **Background
worker** in the app pauses browser automatic entries and local automatic exits; it does
not start a server or copy settings to one. Deliberate manual orders and closes remain
available.

## What is shared

| Behavior                                                                     | Background worker                                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Strategy combination, symbol, timeframe, amount, multiplier, and risk limits | Read from a v10–v14 workspace export                                                                                         |
| Market data and analysis                                                     | Live Deriv ticks, refreshed candle history, and the same strategy functions as the app                                   |
| Demo and real automatic orders                                               | The same execution and risk code; the selected account determines which balance is used                                  |
| Existing positions, exposure, daily realized P/L                             | Fetched from Deriv before every new entry                                                                                |
| Stop loss and take profit                                                    | Sent to Deriv as monetary contract limits; local chart-price exits additionally apply while this worker retains the plan |
| Trades opened by the worker                                                  | Appear in the app when it connects to the same Deriv account                                                             |
| Signals and worker health                                                    | Structured console logs; worker signal logs are not copied into the browser's local alert journal                        |

Workspace settings are loaded at startup. Export changed settings and restart the worker
to apply them. A workspace's saved trade journal does not become broker truth.

## Run locally or on an always-on Node host

Use Node.js 22.9 or later. Run these commands from the project directory:

```bash
npm ci
cp .env.worker.example .env.worker
npm run worker:check
npm run worker
```

The included example analyzes `frxEURUSD` with General Trend Pullback on H1. It
contains no credentials and sends no orders. The `--check` command validates
configuration without making network requests or placing trades. Confirm that the
configured symbol is available for your account and region.

For your own settings:

1. Configure the symbol, timeframe, active strategy combination, and risk controls in
   the app.
2. In Trading Behavior, choose **Background worker** as the automatic execution
   location. Set the trading mode to **Automatic** if you want the worker to place
   orders.
3. Export the workspace through Settings and save it as `worker/workspace.json` on the
   worker host.
4. Set `MBIOTRADE_WORKSPACE_FILE=worker/workspace.json` in `.env.worker` or the host's
   private environment settings.
5. If the combination uses News Guard, set
   `MBIOTRADE_CALENDAR_URL=https://YOUR-APP.vercel.app/api/news-calendar`. This endpoint
   runs on the server and does not require an open browser. It must be accessible to the
   worker. Deployment protection may require a separately accessible calendar endpoint.
6. Validate and start the worker. Keep the process running under your host's process
   supervisor, with automatic restarts after crashes.

To enable automatic execution, configure:

```dotenv
MBIOTRADE_WORKER_MODE=automatic
MBIOTRADE_WORKSPACE_FILE=worker/workspace.json
DERIV_APP_ID=YOUR_APP_ID
DERIV_API_TOKEN=YOUR_TOKEN
DERIV_ACCOUNT_ID=YOUR_ACCOUNT_ID
DERIV_ACCOUNT_MODE=demo
```

For a real account, change the account ID and `DERIV_ACCOUNT_MODE=real`, using a token
authorized for that account. There is no additional real-only confirmation or
assisted-order path. The app's exported workspace must also have
`executionMode: "automatic"` and `automationExecutor: "worker"`; otherwise startup stops
with a configuration error. No secret belongs in a `NEXT_PUBLIC_` variable or a
committed file.

The worker needs permission to read the account and to trade. It obtains an
authenticated WebSocket URL through Deriv's OTP endpoint using the supplied token and
app ID. See the
[Deriv integration workflow](https://developers.deriv.com/docs/workflows/) and
[open-position portfolio API](https://developers.deriv.com/docs/account/portfolio/).

## Host the app and worker together on Vercel

As checked on 28 October 2026, Vercel documents **Daemons** in public beta for
continuously running container processes. Daemons can run alongside an existing
application. Their storage is temporary, which fits this worker because it reconstructs
account state from Deriv. Ordinary Next.js Function invocations still have a maximum
duration, so putting an endless loop in an API route is not sufficient. See
[Vercel Daemons](https://vercel.com/docs/daemons),
[daemon limits](https://vercel.com/docs/daemons/limits), and
[Function duration](https://vercel.com/docs/functions/configuring-functions/duration).

The archive includes an opt-in configuration in `worker/vercel.daemon.example.json`. To
use it:

1. Deploy the normal Next.js app and verify its browser functionality.
2. Save your v10–v14 workspace configuration as `worker/workspace.json`. Ensure it contains
   no secrets before adding it to the deployment source.
3. Copy `worker/vercel.daemon.example.json` to the project root as `vercel.json`. If you
   already have a configuration, merge only its `daemons` property.
4. Set the private worker environment variables on the Vercel production project. Start
   with `MBIOTRADE_WORKER_MODE=signals`.
5. Deploy to production. Inspect the daemon's logs for `worker_started`,
   `market_connection`, `signal`, and `heartbeat` events.
6. After confirming the configuration, enable automatic execution with the settings
   above and redeploy using the single-runner procedure below.

`Dockerfile.worker` is at the project root because the worker shares files under
`src/lib`. Vercel uses the Dockerfile's directory as the container build context. The
multi-stage build compiles only the worker's dependency tree; its final image needs
Node.js and compiled JavaScript, with no browser, Next.js server, or database. See the
[daemon configuration reference](https://vercel.com/docs/daemons/config-reference).

The example uses one instance in one region and a 30-second shutdown grace period. Do
not scale this trading worker horizontally. Daemons currently run in production only,
have plan quotas, and may be stopped when a quota is reached. Review the current Vercel
limits for your plan before relying on continuous operation. This ZIP includes
deployment configuration; no Vercel deployment has been performed or verified with your
account.

You can test the same container locally if Docker is installed:

```bash
docker build -f Dockerfile.worker -t mbiotrade-worker .
docker run --rm --env-file .env.worker mbiotrade-worker
```

Vercel's normal `vercel dev` does not run daemons. You can use `npm run worker`
alongside the local app. An always-on Node/container host is also supported if you do
not use the Vercel beta.

## One automatic execution owner per account

Run one automatic worker for an account and select **Background worker** on every
browser/device connected to that account. Other devices may monitor or perform
deliberate manual actions. Separate independent browser sessions or worker instances
cannot acquire a shared distributed execution lock without an additional coordination
service; Deriv's portfolio API is not a cross-process lock.

For automatic worker updates, stop the old runner and confirm it has stopped before
starting the new version. On Vercel, scale the daemon to zero and verify the old
instance has exited, deploy the update, then restore exactly one instance. Scaling
overrides can persist across deployments; follow
[Managing Daemons](https://vercel.com/docs/daemons/managing-daemons). This avoids
overlap during a rolling deployment.

Every worker startup skips the candle that was already active and waits at least 60
seconds before considering automatic entries. It then reconciles Deriv immediately
before each order. These checks reduce duplicate orders after restarts; they do not make
multiple concurrent runners safe. For a daily timeframe, skipping the active candle can
mean waiting until the next day.

## Failure and restart behavior

- A dropped connection reconnects through the shared Deriv WebSocket client. New orders
  wait for fresh ticks, restored history, and a connected account.
- The worker counts all open Deriv contracts in the risk budget, including positions
  opened elsewhere. Unknown exposure or incomplete profit history blocks new automatic
  orders.
- The daily loss limit uses Deriv's realized P/L for the current UTC day. Account
  history also covers the previous 24 hours for cooldown checks.
- When News Guard is enabled, a missing or stale calendar blocks new entries. A
  successful calendar response may be reused for up to ten minutes during a brief
  outage.
- If a buy fails or its response is lost, the worker pauses new entries and never
  automatically repeats the buy. Check the account on Deriv, then restart when its state
  is understood. The same rule applies to demo and real.
- A termination signal stops new work and closes connections. Already-open contracts
  stay on Deriv with their accepted monetary limits. On restart, their current state is
  loaded from Deriv.
- Monetary contract limits remain at Deriv when the worker/browser closes. Exact
  chart-price exit monitoring needs an active execution process with the original plan;
  those local annotations are not stored at Deriv.
- Settings, logs, and the worker's in-memory attempt markers are not durable account
  records. Positions and outcomes come from Deriv. Worker logs are available through the
  host's logging service.

## Offline validation included

```bash
npm run worker:check
npm run worker:build
node --import tsx tests/worker.test.ts
```

The worker tests cover demo/real execution parity, startup duplication guards,
simultaneous ticks, disconnected and stale feeds, incomplete broker history, external
positions, daily risk limits, unavailable news, uncertain buy responses, shutdown during
reconciliation, and symbol-specific exits. They use mocked data and do not place Deriv
orders. Live execution, account permissions, market availability, broker limits, and the
Vercel daemon deployment still need verification in the user's environment.

## v12 connection and funding behavior

Initial network connection failures and later interruptions retry with bounded delays.
SIGINT/SIGTERM still cancel pending retries and stop the process. Invalid configuration
must be corrected before startup; a bad credential may keep producing a visible retry
error until corrected and the worker is restarted.

The worker uses the same broker quote and fresh-balance checks as the browser. A known
funding or preflight rejection is logged with its reason and required amount where
available, without issuing a buy. An uncertain response after a submitted buy still
pauses automatic entries for review; recovery does not replay that purchase.

## v14 strategy, multiplier and protection behavior

Export the active v14 preset or custom combination from Settings. The worker shares the
same universal trend gate and complete configured patterns as the browser. It keeps 601
raw bars so analysis can use 600 completed bars when the newest bar is still forming.
A signal uses its confirmed candle ID for attempt deduplication. The first tick of a new
forming bar cannot replay the preceding signal. Broker-journal signal metadata supplies
an additional duplicate guard while available in this worker session.

The worker accepts 100, 200, 300, 500 and 800 as configured multiplier choices. Deriv still
confirms account/market availability. Removed saved settings are invalid for automatic
startup: review them in the browser, explicitly choose Automatic/Background worker,
export a new workspace, then restart. Browser preset edits do not hot-load a running
worker. New default presets enable News Guard, so automatic worker startup also requires
MBIOTRADE_CALENDAR_URL pointing to the app's /api/news-calendar endpoint.

The shipped analysis-only example uses General Trend Pullback with News Guard disabled
so its offline configuration check does not need credentials or a calendar. Review and
export your intended settings before enabling automatic execution.

Broker protection edited from the website is reconciled on the worker. A stale local
price-exit plan is not used after a broker protection change. Trend waiting does not
prevent existing-position protection or explicit close operations.

Stop the older runner and reload or close older browser tabs on every device before
using v14. An already running older binary cannot acquire new execution checks merely
because another client has upgraded. Keep one automatic owner per account.
