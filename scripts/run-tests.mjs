import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tests = readdirSync("tests")
  .filter((name) => name.endsWith(".test.ts") || name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...tests], {
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
