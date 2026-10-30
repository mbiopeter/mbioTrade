import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname,'..');
const necessary = [
  'src/app/page.tsx', 'src/app/error.tsx', 'src/app/layout.tsx',
  'src/app/globals.css', 'src/app/api/market/route.ts',
  'src/components/LiveChart.tsx', 'src/components/MarketDashboard.tsx',
  'src/components/ConnectionRetryToast.tsx',
  'src/lib/v22/market.ts', 'src/lib/v22/analysis.ts',
  'src/lib/v231/momentum.ts', 'src/lib/v231/gauge.ts',
  'src/lib/v26-signals.ts', 'src/lib/v26-history.ts', 'src/components/useSignalLedger.ts', 'src/components/useHistoricalCandles.ts', 'src/app/api/market/history/route.ts', 'next.config.ts',
];
const absent = necessary.filter(file => !existsSync(resolve(root,file)));
if (absent.length) {
  console.error('mbioTraders source files missing:',absent.join(', '));
  process.exit(1);
}
const boundary=readFileSync(resolve(root,'src/app/error.tsx'),'utf8').trimStart();
if (!boundary.startsWith('"use client";') && !boundary.startsWith("'use client';")) {
  console.error('src/app/error.tsx must begin with the use client directive.');
  process.exit(1);
}
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const lockPath=resolve(root,'package-lock.json');
if (existsSync(lockPath)) {
  const lock=JSON.parse(readFileSync(lockPath,'utf8'));
  if (pkg.name!==lock.name || pkg.version!==lock.version ||
      pkg.name!==lock.packages[''].name || pkg.version!==lock.packages[''].version ||
      pkg.dependencies['react-gauge-component']!==lock.packages[''].dependencies?.['react-gauge-component']) {
    console.error('package.json and package-lock.json are out of sync. Run npm install.');
    process.exit(1);
  }
}

console.log(`mbioTraders ${pkg.version}: ${necessary.length} required files present, App Router boundary valid. ${existsSync(lockPath) ? 'npm lock matches.' : 'Run npm install to create the new gauge dependency lockfile.'}`);
