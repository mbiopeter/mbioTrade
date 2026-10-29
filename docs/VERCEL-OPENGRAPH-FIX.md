# Vercel /opengraph-image prerender error — fixed

The v25 build could fail during static generation of `/opengraph-image` after successful compilation and TypeScript checking:

```
Expected <div> to have explicit "display: flex", "display: contents", or "display: none" if it has more than one child node.
```

## Cause

The dynamic `src/app/opengraph-image.tsx` uses Next.js ImageResponse/Satori, which requires an explicit display layout for an element containing both a text node (`mbio`) and a nested span (`Traders`). The original logo wrapper lacked `display`.

## Fix

The logo wrapper now has `display: "flex"` and `alignItems: "baseline"`, retaining the same color, font sizing, and social card layout. Two regression checks under `tests/opengraph-build.test.mjs` guard this path.

## Deploy

1. Replace the project source with this fixed ZIP (or apply the one-line change in `src/app/opengraph-image.tsx`).
2. Run `npm ci`, `npm test`, and `npm run build` locally.
3. Commit and push the corrected file to your Git repository and redeploy on Vercel.
4. Visit `https://traders.mbiopeter.co.ke/opengraph-image` after deployment to confirm the generated social preview renders successfully.

The `npm warn Unknown env config "cache-dir"` message is not the cause of this failure. It can be addressed separately by removing the unsupported setting from any `.npmrc` or external npm environment configuration. Don't remove `npm` cache settings without checking their source.

Set `NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke` in your Vercel Production environment for the correct canonical and sitemap URLs. Keep all secrets such as `TWELVE_DATA_API_KEY` server-side.

No signal engine, chart, indicator, layout, or market data code has been modified.
