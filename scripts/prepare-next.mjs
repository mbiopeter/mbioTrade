import { prepareAppRouter } from "./lib-router-guard.mjs";

const checkOnly = process.argv.includes("--check");
try {
  const result = prepareAppRouter(undefined, {
    repair: !checkOnly,
    clearCache: !checkOnly,
  });
  if (result.repairDescription) console.log(`[MbioTrade v16] ${result.repairDescription}`);
  if (result.cacheCleared) console.log("[MbioTrade v16] Cleared stale .next compilation cache.");
  console.log("[MbioTrade v16] Next.js App Router preflight passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
