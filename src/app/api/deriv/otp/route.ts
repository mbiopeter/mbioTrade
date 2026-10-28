import { NextResponse } from "next/server";
import {
  DERIV_APP_ID_ERROR,
  isValidDerivAppId,
  normalizeDerivAppId,
} from "@/lib/deriv-app-id";
import { derivErrorMessage, fetchDerivJson } from "@/lib/server/deriv-rest";
import { isRecord } from "@/lib/validation";
import { isDerivAccountUrl } from "@/lib/server/deriv-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function websocketUrl(payload: unknown): string {
  if (!isRecord(payload)) {
    return "";
  }

  if (isRecord(payload.data) && typeof payload.data.url === "string") {
    return payload.data.url;
  }

  return typeof payload.url === "string" ? payload.url : "";
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const token = String(body.token ?? "").trim();
    const accountId = String(body.accountId ?? "").trim();
    const appId = normalizeDerivAppId(body.appId);
    const mode = body.mode === "demo" ? "demo" : body.mode === "real" ? "real" : null;

    if (!isValidDerivAppId(appId)) {
      return NextResponse.json({ error: DERIV_APP_ID_ERROR }, { status: 400 });
    }

    const validConnectionDetails =
      token.length >= 12 &&
      token.length <= 4096 &&
      !/\s/.test(token) &&
      /^[A-Za-z0-9_-]{2,64}$/.test(accountId) &&
      mode !== null;
    if (!validConnectionDetails) {
      return NextResponse.json(
        { error: "Invalid Deriv connection details." },
        { status: 400 },
      );
    }

    const { response, payload } = await fetchDerivJson(
      `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
      { token, appId },
      { method: "POST" },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: derivErrorMessage(payload, response.status) },
        { status: response.status },
      );
    }

    const url = websocketUrl(payload);
    if (!mode || !isDerivAccountUrl(url, mode)) {
      return NextResponse.json(
        {
          error: `The selected account did not return a ${mode} WebSocket endpoint.`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "Deriv request timed out."
          : error instanceof Error
            ? error.message
            : "Could not create Deriv account session.",
      },
      { status: 502 },
    );
  }
}
