import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const includedRoots = ["src", "scripts", "tests", "docs", "worker"];
const rootFiles = [
  "README.md",
  "CHANGELOG.md",
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "postcss.config.mjs",
  ".prettierrc.json",
  ".prettierignore",
];
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".json"]);

function walk(path) {
  if (statSync(path).isFile()) {
    return [path];
  }

  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}

const files = [
  ...includedRoots.flatMap((directory) => walk(join(root, directory))),
  ...rootFiles.map((file) => join(root, file)),
].filter(
  (file) => textExtensions.has(extname(file)) || file.endsWith(".prettierignore"),
);

const failures = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const display = relative(root, file);

  if (!source.endsWith("\n")) {
    failures.push(`${display}: missing final newline`);
  }

  for (const [index, line] of source.split("\n").entries()) {
    if (/\s+$/.test(line)) {
      failures.push(`${display}:${index + 1}: trailing whitespace`);
    }
    if (line.includes("\t")) {
      failures.push(`${display}:${index + 1}: tab character`);
    }
    if (/\.(?:ts|tsx|js|mjs|css)$/.test(file) && line.length > 180) {
      failures.push(`${display}:${index + 1}: line exceeds 180 characters`);
    }
  }
}

const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
if (css.split("{").length !== css.split("}").length) {
  failures.push("src/app/globals.css: unbalanced braces");
}

if (failures.length > 0) {
  console.error("Formatting guard failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Formatting guard passed for ${files.length} project files.`);
