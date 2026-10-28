# MbioTrade v14 maintainability guide

MbioTrade v14 separates application composition, domain logic, provider state, and
feature UI so changes remain local and reviewable.

## Module boundaries

- `src/app` contains routes, root composition, error boundaries, and API handlers.
- `src/features` contains page-specific feature components. Terminal and Settings are
  split into focused sections rather than one large component.
- `src/components` contains shared layout, chart, trading, and primitive UI pieces.
- `src/context` owns workspace, account, and notification state.
- `src/lib` contains pure trading logic, Deriv adapters, validation, storage,
  backtesting, and synchronization.
- `tests` validates the core behavior without needing a browser or broker session.

## Change workflow

Run these commands before committing a change:

```bash
npm run format
npm run quality
npm run build
```

`npm run quality` checks formatting, TypeScript, application structure, internal
imports, configuration invariants, and core behavior.

## Important invariants

- Browser credentials come from Settings; the optional worker uses server environment
  variables.
- Remembered API keys are stored separately in localStorage and never enter
  workspace/Google backups.
- Deriv is the authority for account positions. Cached journal records are metadata
  only.
- Demo and real accounts share execution and risk gates. Use one automation owner per
  account.
- New-order multiplier values are `100`, `200`, `300`, `500`, and `800`; default 100.
  Removed preferences pause execution during migration. Existing trade factors are preserved.
- Every entry must pass the shared confirmed trend gate. Configured pattern prerequisites
  cannot be bypassed by other votes. Live entry data excludes unfinished and stale bars.
- Trade amount rules belong in `src/lib/trade-amount.ts`; the default is `$20.00` and
  the minimum is `$1.00`.
- Legacy workspace data is sanitized before it enters the application state.
- Browser-only integrations must remain inside client components or adapters.
- Trading calculations should remain pure functions so live analysis and backtesting use
  the same rules.

## Adding a strategy

1. Add its metadata to `src/lib/strategy-engine/catalog.ts`.
2. Add its evaluator to `src/lib/strategy-engine/evaluate.ts` or `configured.ts`.
3. Add any configured preset metadata to `profiles.ts`, validation ID to
   `validation/common.ts`, and factory combination to `defaults.ts`.
4. Update `docs/STRATEGIES.md` and the detailed preset guide.
5. Test mirrored long/short entries, missing prerequisites, wrong market, trend rejection,
   candle timing and all applicable browser/worker/replay paths.

## Adding a route

Create a thin route component under `src/app`. Move complex UI into a feature folder and
move reusable calculations into `src/lib`. Avoid network requests and business
calculations directly inside JSX.
