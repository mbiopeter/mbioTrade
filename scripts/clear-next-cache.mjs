import { rmSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "./lib-router-guard.mjs";

rmSync(join(PROJECT_ROOT, ".next"), { recursive: true, force: true });
console.log("Removed the .next directory. The next development run will compile fresh.");
