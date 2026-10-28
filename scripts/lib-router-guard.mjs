// MbioTrade App Router preflight. Uses Node built-ins only, so it can run
// immediately after npm ci and before any Next/SWC loader has started.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const templateFile = join(scriptDirectory, "templates", "error.tsx.tpl");
export const PROJECT_ROOT = resolve(scriptDirectory, "..");
const ERROR_FILE = "src/app/error.tsx";

export function isClientComponent(source) {
  return /^\s*["']use client["'];?(?:\r?\n|$)/.test(source.replace(/^\uFEFF/, ""));
}

function hasDefaultErrorExport(source) {
  return /\bexport\s+default\s+function\s+[A-Za-z_$][\w$]*\s*\(/.test(source);
}

export function checkRouterSources(root) {
  const issues = [];
  const app = join(root, "src", "app");
  if (!existsSync(app)) return ["src/app directory is missing."];

  function walk(path) {
    for (const file of readdirSync(path)) {
      const full = join(path, file);
      if (statSync(full).isDirectory()) walk(full);
      else if (/(?:page|layout|error|loading|not-found|route)\.(?:ts|tsx|js|jsx)$/.test(file)) {
        if (!readFileSync(full, "utf8").trim()) {
          issues.push(`${relative(root, full)} is empty.`);
        }
      }
    }
  }
  walk(app);

  for (const file of ["src/app/error.tsx", "src/app/layout.tsx", "src/app/providers.tsx", "src/app/terminal/page.tsx"]) {
    if (!existsSync(join(root, file))) issues.push(`${file} is missing.`);
  }

  for (const file of [ERROR_FILE, "src/app/providers.tsx"]) {
    const absolute = join(root, file);
    if (!existsSync(absolute)) continue;
    if (!isClientComponent(readFileSync(absolute, "utf8"))) {
      issues.push(`${file} must start with the \"use client\" directive.`);
    }
  }
  const errorPath = join(root, ERROR_FILE);
  if (existsSync(errorPath) && !hasDefaultErrorExport(readFileSync(errorPath, "utf8"))) {
    issues.push(`${ERROR_FILE} must default-export the error boundary function.`);
  }
  return issues;
}

export function prepareAppRouter(root = PROJECT_ROOT, { repair = true, clearCache = true } = {}) {
  root = resolve(root);
  const errorPath = join(root, ERROR_FILE);
  let repaired = false;
  let repairDescription = null;
  const current = existsSync(errorPath) ? readFileSync(errorPath, "utf8") : "";

  if ((!current.trim() || !existsSync(errorPath)) && repair) {
    const template = readFileSync(templateFile, "utf8");
    if (!isClientComponent(template) || !hasDefaultErrorExport(template)) {
      throw new Error("Bundled Next.js error-boundary template is invalid.");
    }
    mkdirSync(dirname(errorPath), { recursive: true });
    writeFileSync(errorPath, template);
    repaired = true;
    repairDescription = "Restored the missing/empty src/app/error.tsx from the bundled client-boundary template.";
  } else if (current.trim() && !isClientComponent(current) && repair && hasDefaultErrorExport(current)) {
    // Repair only the directive, preserving the developer's component body.
    // A misplaced directive below an import would not be recognized by Next.
    const withoutMisplacedDirective = current
      .replace(/^[ \t]*["']use client["'];?[ \t]*(?:\r?\n|$)/gm, "")
      .replace(/^\uFEFF/, "")
      .trimStart();
    writeFileSync(errorPath, `"use client";\n\n${withoutMisplacedDirective}`);
    repaired = true;
    repairDescription = "Moved the error-boundary \"use client\" directive to the first statement.";
  }

  const issues = checkRouterSources(root);
  if (issues.length) {
    throw new Error(`MbioTrade App Router preflight failed:\n- ${issues.join("\n- ")}\nRe-extract the v16 ZIP if files were altered or truncated.`);
  }

  let cacheCleared = false;
  if (clearCache) {
    const next = join(root, ".next");
    const stamp = join(next, ".mbiotrade-source-version");
    const pkg = join(root, "package.json");
    const release = existsSync(pkg) ? JSON.parse(readFileSync(pkg, "utf8")).version : "16.0.0";
    const oldRelease = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : null;
    if (existsSync(next) && (repaired || oldRelease !== release)) {
      rmSync(next, { recursive: true, force: true });
      cacheCleared = true;
    }
    mkdirSync(next, { recursive: true });
    writeFileSync(stamp, `${release}\n`);
  }
  return { repaired, repairDescription, cacheCleared };
}
