import { readFile } from "node:fs/promises";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import {
  isRecord,
  sanitizeWorkspace,
  validateCredentials,
} from "../src/lib/validation";
import type { DerivCredentials, Preferences, StrategyCombo } from "../src/lib/types";

export type WorkerConfig = {
  mode: "signals" | "automatic";
  preferences: Preferences;
  combo: StrategyCombo;
  credentials: DerivCredentials | null;
  calendarUrl: string | null;
  newsGuard: boolean;
};

type Environment = Record<string, string | undefined>;

function calendarUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "MBIOTRADE_CALENDAR_URL must use HTTPS (HTTP is allowed for localhost). ",
    );
  }
  return url.toString();
}

/** Only settings and strategies are read; exported journals never authorize trades. */
export function parseWorkerConfig(raw: unknown, env: Environment): WorkerConfig {
  if (!isRecord(raw) || !isRecord(raw.preferences)) {
    throw new Error("The worker needs a workspace JSON containing preferences.");
  }
  const mode = env.MBIOTRADE_WORKER_MODE?.trim() || "signals";
  if (mode !== "signals" && mode !== "automatic") {
    throw new Error("MBIOTRADE_WORKER_MODE must be signals or automatic.");
  }
  const workspace = sanitizeWorkspace(raw, DEFAULT_PREFERENCES, DEFAULT_COMBOS);
  const preferences = workspace.preferences;
  const combo = workspace.combos.find((item) => item.id === workspace.activeComboId);
  if (!combo)
    throw new Error("Select an active strategy combination in the workspace.");
  const newsGuard = combo.strategies.some(
    (item) => item.enabled && item.id === "news-guard",
  );
  const url = calendarUrl(env.MBIOTRADE_CALENDAR_URL);
  let credentials: DerivCredentials | null = null;

  if (mode === "automatic") {
    if (
      preferences.executionMode !== "automatic" ||
      preferences.automationExecutor !== "worker"
    ) {
      throw new Error(
        "Export a workspace with Automatic trading and Background worker selected before enabling worker execution.",
      );
    }
    // Do not silently turn an invalid live trading amount or limit into a default.
    const rawRisk = isRecord(raw.preferences.risk) ? raw.preferences.risk : {};
    for (const key of Object.keys(preferences.risk) as Array<
      keyof Preferences["risk"]
    >) {
      if (typeof rawRisk[key] !== "number" || rawRisk[key] !== preferences.risk[key]) {
        throw new Error(
          `The workspace has an invalid or missing risk setting: ${key}. Export the settings again.`,
        );
      }
    }
    if (
      raw.preferences.symbol !== preferences.symbol ||
      raw.preferences.timeframe !== preferences.timeframe ||
      raw.activeComboId !== workspace.activeComboId
    ) {
      throw new Error(
        "The worker's symbol, timeframe, or selected combination is invalid.",
      );
    }
    const checked = validateCredentials({
      token: env.DERIV_API_TOKEN ?? "",
      appId: env.DERIV_APP_ID ?? "",
      accountId: env.DERIV_ACCOUNT_ID ?? "",
      accountMode: env.DERIV_ACCOUNT_MODE as DerivCredentials["accountMode"],
      rememberSession: false,
    });
    if (!checked.ok) throw new Error(checked.error);
    credentials = checked.value;
    if (newsGuard && !url) {
      throw new Error(
        "The selected strategy uses News Guard. Set MBIOTRADE_CALENDAR_URL to your app's /api/news-calendar URL.",
      );
    }
  }

  return { mode, preferences, combo, credentials, calendarUrl: url, newsGuard };
}

export async function loadWorkerConfig(
  env: Environment = process.env,
): Promise<WorkerConfig> {
  const path = env.MBIOTRADE_WORKSPACE_FILE || "worker/workspace.example.json";
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseWorkerConfig(raw, env);
}
