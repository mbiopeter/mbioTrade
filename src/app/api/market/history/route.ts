import { NextRequest, NextResponse } from "next/server";
import { isFrame, resolveSymbol } from "@/lib/v22/market";
import { derivPage, twelvePage } from "@/lib/v26-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const instrument = resolveSymbol(params.get("symbol"));
  const frame = Number(params.get("frame"));
  const before = Number(params.get("before"));
  const provider = params.get("provider");

  const invalid =
    !instrument ||
    !isFrame(frame) ||
    !Number.isSafeInteger(before) ||
    before < 0 ||
    before > Date.now() / 1000 + 86_400 ||
    (provider !== "deriv" && provider !== "twelvedata");

  if (invalid || !instrument) {
    return NextResponse.json(
      { error: "Invalid history request" },
      { status: 400 },
    );
  }

  try {
    const candles =
      provider === "twelvedata"
        ? await twelvePage(
            instrument.symbol,
            frame,
            before,
            process.env.TWELVE_DATA_API_KEY ?? "",
          )
        : await derivPage(instrument.symbol, frame, before);

    return NextResponse.json(
      {
        symbol: instrument.symbol,
        frame,
        provider,
        candles,
        exhausted: candles.length < 50,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "History unavailable",
        detail: error instanceof Error ? error.message : "Provider error",
      },
      { status: 503 },
    );
  }
}
