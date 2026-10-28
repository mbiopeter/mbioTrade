import { NextResponse } from "next/server";
import {
  DERIV_APP_ID_ERROR,
  isValidDerivAppId,
  normalizeDerivAppId,
} from "@/lib/deriv-app-id";
import { derivErrorMessage, fetchDerivJson } from "@/lib/server/deriv-rest";
import { isRecord } from "@/lib/validation";
import { normalizeDerivAccounts } from "@/lib/server/deriv-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const token = String(body.token ?? "").trim();
    const appId = normalizeDerivAppId(body.appId);

    if (!isValidDerivAppId(appId)) {
      return NextResponse.json({ error: DERIV_APP_ID_ERROR }, { status: 400 });
    }
    if (token.length < 12 || token.length > 4096 || /\s/.test(token)) {
      return NextResponse.json(
        { error: "Enter a valid Deriv API key/token." },
        { status: 400 },
      );
    }

    const { response, payload } = await fetchDerivJson("/trading/v1/options/accounts", {
      token,
      appId,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: derivErrorMessage(payload, response.status) },
        { status: response.status },
      );
    }

    const accounts = normalizeDerivAccounts(payload);
    return NextResponse.json(
      { accounts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "Deriv request timed out."
          : error instanceof Error
            ? error.message
            : "Could not read Deriv accounts.",
      },
      { status: 502 },
    );
  }
}
