import { NextRequest, NextResponse } from "next/server";
import { resolveSymbol } from "@/lib/v22/market";
import { fetchMarketShared, MARKET_FAILURE_RETRY_MS } from "@/lib/server-market-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const symbol = resolveSymbol(request.nextUrl.searchParams.get("symbol"));
  if (!symbol) return NextResponse.json({error:"Unsupported market"},{status:400});
  try {
    const result= await fetchMarketShared(symbol.symbol);
    return NextResponse.json(result,{
      headers:{"Cache-Control":"public, s-maxage=20"},
    });
  } catch(error) {
    return NextResponse.json({
      error:"Live market data is unavailable. Signals and sounds are paused until valid data returns.",
      detail:error instanceof Error?error.message:"Unknown provider error",
    },{status:503,headers:{"Cache-Control":"no-store","Retry-After":String(MARKET_FAILURE_RETRY_MS / 1000)}});
  }
}
