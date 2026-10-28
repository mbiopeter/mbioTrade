import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const importPattern = /(?:from\s*|import\s*\()\s*["']([^"']+)["']/g;

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    return statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function candidates(basePath) {
  const extension = extname(basePath);
  const direct = extension
    ? [basePath]
    : [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.jsx`,
        `${basePath}.mjs`,
      ];

  return [
    ...direct,
    join(basePath, "index.ts"),
    join(basePath, "index.tsx"),
    join(basePath, "index.js"),
    join(basePath, "index.jsx"),
    join(basePath, "index.mjs"),
  ];
}

function resolveInternalImport(filePath, specifier) {
  if (specifier.startsWith("@/")) {
    return join(sourceRoot, specifier.slice(2));
  }

  if (specifier.startsWith(".")) {
    return resolve(dirname(filePath), specifier);
  }

  return null;
}

const unresolved = [];
const files = walk(sourceRoot).filter((filePath) =>
  sourceExtensions.has(extname(filePath)),
);

for (const filePath of files) {
  const source = readFileSync(filePath, "utf8");

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    const basePath = resolveInternalImport(filePath, specifier);

    if (!basePath) {
      continue;
    }

    if (!candidates(basePath).some((candidate) => existsSync(candidate))) {
      unresolved.push(`${filePath.replace(`${root}/`, "")}: ${specifier}`);
    }
  }
}

if (unresolved.length > 0) {
  console.error("Unresolved internal imports:\n");
  for (const item of unresolved) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Internal import check passed for ${files.length} source modules.`);
