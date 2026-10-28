import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkRouterSources,
  isClientComponent,
  prepareAppRouter,
  PROJECT_ROOT,
} from "../scripts/lib-router-guard.mjs";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "mbiotrade-v16-router-test-"));
  const app = join(root, "src", "app");
  mkdirSync(join(app, "terminal"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"mbiotrade","version":"16.0.0"}\n');
  writeFileSync(join(app, "layout.tsx"), "export default function RootLayout() { return null; }\n");
  writeFileSync(join(app, "providers.tsx"), '"use client";\nexport function Providers(){return null;}\n');
  writeFileSync(join(app, "terminal/page.tsx"), "export default function Terminal(){return null;}\n");
  writeFileSync(join(app, "page.tsx"), "export default function Index(){return null;}\n");
  return root;
}

async function withFixture(fn) {
  const root = createFixture();
  try { await fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("release includes a valid App Router client boundary", () => {
  const source = readFileSync(join(PROJECT_ROOT, "src/app/error.tsx"), "utf8");
  assert.equal(isClientComponent(source), true);
  assert.deepEqual(checkRouterSources(PROJECT_ROOT), []);
});

test("blank local error.tsx is repaired before webpack starts", async () => {
  await withFixture((root) => {
    const file = join(root, "src/app/error.tsx");
    writeFileSync(file, "\n  \n");
    const result = prepareAppRouter(root);
    assert.equal(result.repaired, true);
    assert.equal(isClientComponent(readFileSync(file, "utf8")), true);
    assert.ok(readFileSync(file, "utf8").includes("export default function ErrorPage"));
    assert.deepEqual(checkRouterSources(root), []);
  });
});

test("a missing error boundary is restored", async () => {
  await withFixture((root) => {
    const result = prepareAppRouter(root);
    assert.equal(result.repaired, true);
    assert.ok(existsSync(join(root, "src/app/error.tsx")));
  });
});

test("directive missing or placed after imports is moved to the top without removing component", async () => {
  await withFixture((root) => {
    const file = join(root, "src/app/error.tsx");
    writeFileSync(file, 'import React from "react";\n"use client";\nexport default function ErrorPage(){return <h1>Custom</h1>;}\n');
    const result = prepareAppRouter(root);
    assert.equal(result.repaired, true);
    const source = readFileSync(file, "utf8");
    assert.equal(isClientComponent(source), true);
    assert.ok(source.includes("<h1>Custom</h1>"));
    assert.equal(source.match(/"use client"/g)?.length, 1);
  });
});

test("invalid nonempty boundary fails loudly without being overwritten", async () => {
  await withFixture((root) => {
    const file = join(root, "src/app/error.tsx");
    const invalid = '"use server";\nexport const something = 42;\n';
    writeFileSync(file, invalid);
    assert.throws(() => prepareAppRouter(root), /preflight failed/i);
    assert.equal(readFileSync(file, "utf8"), invalid);
  });
});

test("empty terminal page fails before Next can return a 500", async () => {
  await withFixture((root) => {
    prepareAppRouter(root);
    writeFileSync(join(root, "src/app/terminal/page.tsx"), "");
    assert.throws(() => prepareAppRouter(root), /terminal\/page.tsx is empty/);
  });
});

test("stale v14 Next output is cleared once and the v16 cache is retained on recheck", async () => {
  await withFixture((root) => {
    const next = join(root, ".next");
    mkdirSync(next);
    writeFileSync(join(next, "old-build.txt"), "legacy cache");
    const first = prepareAppRouter(root);
    assert.equal(first.cacheCleared, true);
    assert.equal(existsSync(join(next, "old-build.txt")), false);
    assert.equal(readFileSync(join(next, ".mbiotrade-source-version"), "utf8"), "16.0.0\n");
    const second = prepareAppRouter(root);
    assert.equal(second.cacheCleared, false);
    assert.equal(second.repaired, false);
  });
});
