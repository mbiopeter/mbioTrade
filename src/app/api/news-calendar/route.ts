import { NextResponse } from "next/server";
import { fetchNewsSnapshot, isFreshNewsSnapshot, type NewsSnapshot } from "@/lib/news-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

let lastVerified: NewsSnapshot | null = null;
let pending: Promise<NewsSnapshot> | null = null;

function response(snapshot: NewsSnapshot) {
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}

export async function GET() {
  const now = Date.now();
  if (isFreshNewsSnapshot(lastVerified, now, 90_000)) {
    return response(lastVerified!);
  }
  try {
    if (!pending) {
      pending = fetchNewsSnapshot().finally(() => { pending = null; });
    }
    const snapshot = await pending;
    lastVerified = snapshot;
    return response(snapshot);
  } catch {
    if (isFreshNewsSnapshot(lastVerified, Date.now())) {
      return response(lastVerified!);
    }
    return NextResponse.json(
      { error: "High-impact news calendar unavailable; new signals are paused." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
