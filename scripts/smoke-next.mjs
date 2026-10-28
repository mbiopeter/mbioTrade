// Live Next.js dev-server smoke check. No browser credentials or trades are used.
// Run on a machine where npm ci succeeded: npm run smoke:dev
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { prepareAppRouter, PROJECT_ROOT } from "./lib-router-guard.mjs";

const nextCli = join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextCli)) {
  console.error("Next.js is not installed. Run npm ci before npm run smoke:dev.");
  process.exit(1);
}

function availableLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const routes = [
  "/terminal",
  "/strategies",
  "/portfolio",
  "/settings",
  "/scanner",
  "/backtest",
];
let child;
let exited = false;
let logs = "";

try {
  prepareAppRouter();
  const port = await availableLocalPort();
  if (!port) throw new Error("Could not allocate a local test port.");
  child = spawn(
    process.execPath,
    [nextCli, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.on("error", (error) => {
    exited = true;
    logs += `\nSpawn error: ${error.message}`;
  });
  child.on("exit", (code, signal) => {
    exited = true;
    logs += `\nServer exited: ${code ?? signal}`;
  });
  for (const output of [child.stdout, child.stderr]) {
    output?.on("data", (chunk) => {
      logs = (logs + chunk.toString()).slice(-16000);
    });
  }

  const deadline = Date.now() + 180000;
  for (const route of routes) {
    let lastFailure = "not ready";
    while (Date.now() < deadline && !exited) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}${route}`, {
          signal: AbortSignal.timeout(20000),
          headers: { "Cache-Control": "no-cache" },
        });
        const html = await response.text();
        if (
          response.ok &&
          !/(must be a Client Component|ModuleBuildError|Module build failed)/i.test(html)
        ) {
          console.log(`PASS ${route} (HTTP ${response.status})`);
          lastFailure = "";
          break;
        }
        lastFailure = `HTTP ${response.status}: ${html.slice(0, 300)}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }
      await sleep(1500);
    }
    if (lastFailure) {
      throw new Error(`${route} did not render correctly (${lastFailure}).`);
    }
  }
  console.log("Next.js webpack development route smoke check passed without a broker connection.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Recent server output:\n" + logs.slice(-8000));
  process.exitCode = 1;
} finally {
  if (child && !exited) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(5000),
    ]);
    if (!exited) child.kill("SIGKILL");
  }
}
