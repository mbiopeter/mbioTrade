# MbioTrade v16 — App Router startup repair and validation

Release: **v16.0.0**, based directly on v14 (v15 intentionally skipped at the user's
request). The 18 original trading regression test files and all six market strategies
remain. The maintenance edits are limited to the Next.js error boundary, preflight,
package metadata/install-script policy, tests and documentation.

## What caused the reported error

Next.js App Router requires `src/app/error.tsx` to be a **Client Component**. The
reported webpack diagnostic showed an empty line 1 for that file, even though the
published v14 source archive contains a valid first-line `"use client";` directive.
This points to an empty/invalid local file at compilation time or a stale development
cache, rather than to the strategy code. A `.next` cache problem cannot be proven from
the log alone.

V16 keeps a valid boundary and checks source files **before** Next starts:

- When `error.tsx` is missing or blank, restore the verified bundled template.
- When the first statement lacks `"use client"` but the default exported component
  still exists, move the directive to the start without replacing the component.
- If a nonempty file is otherwise invalid, fail with a clear message so accidental
  edits are not overwritten.
- Check other App Router entrypoints for empty source, check the client providers
  and invalidate stale `.next` output on the first v16 startup.
- `npm run doctor` verifies without changing anything. `npm run dev:clean` deliberately
  removes `.next` and starts fresh.

`npm warn install-scripts` for `esbuild@0.28.2` is a separate npm script-approval
notice; it is not the reported Next.js HTTP 500 error. V16 permits only the pinned
esbuild install script in `package.json` (`allowScripts`). This is safer than approving
all dependency scripts. Newer npm may still show informational funding messages.

## Clean installation (Ubuntu, WSL, Linux)

Extract `mbiotrade-v16.zip` to a fresh directory. In that directory:

```bash
node --version
npm --version
npm ci
npm run doctor
npm run dev
```

Open `http://localhost:3000/terminal` once Next reports **Ready**.
Try `http://localhost:3000/strategies`, `/portfolio`, `/settings`, and `/backtest`.
Check that each page loads without an HTTP 500. The main pages should also be tested
on a mobile-width display. No Deriv token is needed to verify initial navigation.

For a suspicious old cache, **stop the development server first**, then run:

```bash
npm run dev:clean
```

To inspect the actual local file if the original error recurs:

```bash
sed -n '1,20p' src/app/error.tsx
npm run doctor
```

`"use client";` must be the first statement in the printed file. A blank file suggests
an interrupted extraction or an edited working tree. If the source is corrupt,
re-extract the ZIP. Do not copy `node_modules` or `.next` from an older release.

## Testing / production checks on a machine with npm access

```bash
npm run quality
npm run build
npm run worker:build
npm run worker:check
npm run smoke:dev
npm run dev
```

With the dev server running, confirm `/terminal`, `/strategies`, `/portfolio`,
`/settings`, `/scanner`, `/alerts` and the 404 screen load. All broker-connected flows
should first be tested on Deriv Demo. No tested strategy guarantees a profit.

## Checks actually performed while packaging v16

- Static configuration, App Router invariants, maintainability/import resolution and
  formatting checks passed.
- All **18 existing TypeScript regression test files** and the added Node.js App Router
  repair test file completed successfully under Node 22 with the globally available
  TypeScript transpiler: **92 checks passed, none failed**.
- An independent Node.js guard test reproduced and repaired an empty error file, a
  missing file and a misplaced directive. It also verified detection of invalid files,
  empty terminal entrypoints and cache invalidation/idempotence.
- The entire v14 trading source tree and worker were compared byte-for-byte with v16,
  except the intended error-boundary, checks, docs, release metadata and test updates.
- Production Next.js compilation and the running browser UI **could not be repeated**
  in the packaging environment because outbound npm registry DNS was unavailable.
  The commands above allow this final verification on the target development machine.
- No live Deriv account was connected, and no orders were placed.

## Deployment and saved settings

The existing Next.js/Vercel application and optional Node worker design are retained.
No worker trading logic, order payload or strategy inputs have changed. The same
browser origin (for example `http://localhost:3000`) keeps earlier saved local
preferences and remembered credentials; a different domain or hostname uses separate
browser storage. To avoid dual automatic execution, close older app tabs and restart
only one worker per Deriv account when upgrading.
