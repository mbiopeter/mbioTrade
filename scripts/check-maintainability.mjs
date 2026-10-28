import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignored = new Set(["node_modules", ".next", "coverage"]);
const failures = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignored.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!sourceExtensions.has(extname(path))) continue;

    const display = relative(root, path);
    const text = readFileSync(path, "utf8");
    if (text.includes("\t")) {
      failures.push(`${display} contains tab indentation.`);
    }
    if (text.includes(": any") || text.includes(" as any")) {
      failures.push(`${display} contains an explicit any type.`);
    }
    if (/MbioTrade v8/.test(text)) {
      failures.push(`${display} contains a stale v8 user-facing reference.`);
    }
  }
}

walk(join(root, "src"));

if (failures.length) {
  console.error("Maintainability check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Maintainability checks passed.");
