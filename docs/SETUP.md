# MbioTrade v16 setup

## Install

Use Node.js 22.9 or later. Extract the ZIP, enter its `mbiotrade-v16` folder, then run:

```bash
npm ci
npm run doctor
npm run dev
```

If an earlier Next.js build was extracted into the same directory, run
`npm run dev:clean` to clear the old build output before starting. See
`docs/V16-STARTUP-REPAIR.md` for repairs and troubleshooting.

Visit `http://localhost:3000`. No environment file is required for the web app.

## Deriv account

Open Settings → Deriv connection. Enter the App ID from your Deriv application and the
scoped API key/token, discover accounts, select the exact Demo or Real Options account
and connect. Wait until the account positions are synchronized.

Remember API key is enabled by default for this browser and site origin. It survives
tab/browser restarts when persistent site storage is available. Disconnect keeps the
key; Forget saved key removes it and disconnects. The key is excluded from workspace
exports and Google Drive backups.

On a second device, authorize the same account. Its open positions and broker P/L are
retrieved directly from Deriv. You do not need to import the first device's trade
journal. Preferences and strategy labels can still be copied by JSON or Google backup.

## Manual and automatic modes

Settings → Trading behavior provides Signals, Manual and Automatic. The choice applies
equally to the connected Demo or Real account.

For a manual order, choose Buy/Long or Sell/Short in the Terminal ticket, set the trade
amount and multiplier, and use its execute button. When no matching strategy signal
exists, the ticket creates a manual plan from price and ATR. Both manual and automatic
entries must follow the confirmed EMA50/EMA200 trend and need 205 completed candles.
Select a v14 preset in Strategies to load its documented timeframe and pattern settings;
Apply pauses browser entries in Signals until you review and choose a trading mode.

Automatic mode submits qualified signals subject to the same account checks and risk
limits on both account types. No additional real-account confirmation is inserted. An
unavailable history/portfolio, stale market feed, enabled News Guard without current
data, active cooldown, exposure limit or loss limit can delay an order. The ticket
explains the current waiting state.

Trade amount defaults to 20 account-currency units, minimum 1. Available ticket
multipliers are 100, 200, 300, 500 and 800; new workspaces default to 100. Removed saved
choices below 100 migrate to 100 and Signals for review. Deriv decides whether
the selected market/account supports the multiplier and stop amounts.

## Edit an open position

In Terminal → Open trades or Portfolio, choose **Edit SL / TP**. Enter the positive
cash loss allowance and/or profit target in the contract's account currency. SL must
be below the stake and both fields use at most two decimals. Save sends only changed
fields, verifies them with Deriv and updates the chart and connected sessions.
Changing the global multiplier or ATR settings affects future entries, not this trade.

Review any conflict message if another device changed the same field. An uncertain
update is read back rather than silently resent. Before upgrading, reload/close old
browser tabs on every device and stop old workers; run v16 before editing protection.
The existing key and workspace remain compatible on the same site origin.

## Browser or background execution

Browser automation continues across page navigation but needs the browser open. Select
Background worker only when configuring a separate runner. It stops browser automation
and does not start a server automatically.

For Vercel hosting, select the Next.js preset and use `npm ci` / `npm run build`. The
project root is the extracted folder containing `package.json`. For continuous
processing without a database, see `BACKGROUND-WORKER.md` for Vercel Daemons and
standalone server instructions. Use one automatic owner per account, including during
deployment/restart.

## Backup

The existing Google Drive App Data integration remains optional. Create a browser OAuth
Web Client ID, allow your local/deployed origins, paste it in Sync settings, and
connect. JSON exports/imports are also available. Broker positions are always reconciled
from Deriv after a restore. The established Drive backup filename is retained so
existing v9 backups remain discoverable.

## Verify

```bash
npm run quality
npm run build
npm run worker:check
npm run worker:build
```

The default worker check is offline and read-only. Configure server credentials only in
the server's environment, following the worker guide.
