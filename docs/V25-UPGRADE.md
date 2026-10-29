# mbioTraders v25 — upgrade and checks

This release is based **on the uploaded modified v24 source**, not the earlier stock v24 ZIP. The dashboard layout, components, six instruments, timeframe selection, 3/5/7-day momentum, maintained gauge, SEO and skeleton loaders are retained.

## Improvements

1. **Automatic connection recovery:** HTTP market-history requests retry using a 2s, 4s, 8s, 16s then 30s (capped) schedule with a small jitter. Every successful request restores a normal 45-second refresh. The 23-second HTTP request timeout is also retried, as are error responses. The browser's online and visible events trigger immediate refreshes. Failed HTTP requests keep previously verified bars visible as **cached** data, while marking signals **WAIT** to avoid stale recommendations or audible alerts. This is not a guarantee of connectivity when the internet or provider remains down.
2. **Streaming reconnection:** Public Deriv tick WebSockets retry on failure, closure, subscription error, no first tick within 25 seconds, and no valid tick for 150 seconds. Automatic reconnection uses the same capped backoff. Streams cannot update when the browser is closed or suspended.
3. **Compact visual refinements:** Header and market selector are shorter. Text sizes were reduced gently without changing the layout's color, gauge, nine-card composition, or mobile layout.
4. **Louder chime:** The alert uses three notes peaking at a higher gain through an audio compressor. Browser audio still needs a user tap/click, and actual output volume depends on device and system settings.
5. **Portfolio link:** The mbioTraders title links to `https://mbiopeter.co.ke` in a new browser tab, including the loading layout.
6. **Stable styling names:** All CSS classes and animation identifiers now use a `mbiotraders-` prefix, with no release numbers. The saved browser settings keys remain unchanged so users keep their selections.

## Run

```bash
cd mbiotraders-v25
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Connect to the deployed site, enable alerts with a click, and verify that the browser automatically reconnects after temporarily disconnecting your network. Verify both the OHLC refresh and quote streaming in the browser Network tab.

## Validation record

- 36 automated checks passed, including the existing 29 checks and seven additional v25 checks.
- Global TypeScript/TSX syntax parser passed (20 source modules).
- Stylesheet parser passed (333 CSS rules, zero top-level parse errors).
- Doctor/lockfile synchronization passed.
- **Production build and live-provider testing were not completed in this environment because npm registry access failed** (`EAI_AGAIN`). These must be completed locally before deployment.

## Scope and limitations

This remains a **signals-only** application, with no broker order execution and no database or always-on server process. HTTP refreshes and sound alerts operate only while the browser page is active; browsers may throttle timers when backgrounded. Provider outages cannot be resolved by client-side retries alone. Indicator agreement scores are not an empirical probability of trading success.
