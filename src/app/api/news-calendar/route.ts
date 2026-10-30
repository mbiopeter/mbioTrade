import { NextResponse } from "next/server";
import { fetchNewsSnapshot } from "@/lib/news-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  try {
    const snapshot = await fetchNewsSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "High-impact news calendar unavailable; new signals are paused." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
