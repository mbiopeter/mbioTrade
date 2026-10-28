import { REQUEST_TIMEOUT_MS } from "../app-config";
import { isRecord } from "../validation";

const DERIV_REST_BASE = "https://api.derivws.com";

export type DerivRestCredentials = {
  token: string;
  appId: string;
};

function headers({ token, appId }: DerivRestCredentials): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Deriv-App-ID": appId,
  };
}

export function derivErrorMessage(payload: unknown, status: number): string {
  if (!isRecord(payload)) {
    return `Deriv returned ${status}.`;
  }

  if (Array.isArray(payload.errors)) {
    const first = payload.errors.find(isRecord);
    if (first && typeof first.message === "string") {
      return first.message;
    }
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return `Deriv returned ${status}.`;
}

export async function fetchDerivJson(
  path: string,
  credentials: DerivRestCredentials,
  init: RequestInit = {},
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${DERIV_REST_BASE}${path}`, {
      ...init,
      headers: {
        ...headers(credentials),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    return { response, payload };
  } finally {
    clearTimeout(timeoutId);
  }
}
