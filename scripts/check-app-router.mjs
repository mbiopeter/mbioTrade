import { readFileSync } from "node:fs";
import { checkRouterSources, PROJECT_ROOT } from "./lib-router-guard.mjs";

const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const providers = readFileSync(new URL("../src/app/providers.tsx", import.meta.url), "utf8");
const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

const failures = [...checkRouterSources(PROJECT_ROOT)];

if (!/export\s+default\s+function\s+RootLayout/.test(layout)) {
  failures.push("src/app/layout.tsx must default-export RootLayout.");
}
if (!/<html[\s>]/.test(layout) || !/<body[\s>]/.test(layout)) {
  failures.push("The root layout must render both <html> and <body>.");
}
if (!/import\s+\{\s*Providers\s*\}\s+from\s+["']\.\/providers["']/.test(layout)) {
  failures.push("The root layout must use the dedicated Providers boundary.");
}
if (!/^"use client";/m.test(providers)) {
  failures.push("src/app/providers.tsx must be a Client Component.");
}
if (/experimental\s*:\s*\{[^}]*typedRoutes/s.test(config)) {
  failures.push("typedRoutes must not be nested under experimental.");
}

if (failures.length) {
  console.error("App Router configuration check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("App Router layout/configuration check passed.");
