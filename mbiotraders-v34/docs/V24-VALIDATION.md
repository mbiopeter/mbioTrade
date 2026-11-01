# v24 validation report

## Completed in the generation environment

- `node scripts/doctor.mjs`: PASS (source and App Router boundary checks).
- `node --experimental-strip-types --disable-warning=ExperimentalWarning --test tests/*.test.mjs`: **29/29 PASS**.
- TypeScript/TSX syntax parse: **19 files / zero syntax errors**.
- CSS stylesheet parsing: **zero top-level parse errors**.
- Confirmed these implementation files are unchanged from v23.1: `src/lib/v22/market.ts`, `src/lib/v22/analysis.ts`, `src/lib/v231/momentum.ts` and `src/components/LiveChart.tsx`.
- Release checks cover the `evaluateLiveFrame` import, external gauge usage, nine skeleton cards, metadata/sitemap/robots, branding, and no order execution.

## Not verified here

- `npm install`, `npm run check` and `npm run build`: inaccessible npm registry, so full package installation, TypeScript type checking and Next.js production compilation could not be run.
- Real Twelve Data/Deriv feeds, sound playback and live market chart/gauge were not tested with a live browser.
- Pixel-level visual matching must be checked after installing the external gauge library in a browser.

## First installation and Vercel

Run `npm install` to download the added gauge and create `package-lock.json`, **then** run `npm run check`, `npm run build` and `npm run dev`. For deployment, commit the generated lockfile with `package.json`. The v23.1 lockfile was deliberately removed because it did not contain the added gauge dependencies and would cause `npm ci` to reject the project.
