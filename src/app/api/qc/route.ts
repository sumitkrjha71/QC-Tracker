// ============================================================================
//  GET /api/qc?segment=all|enterprise|smb|embed
//  QC Time Tracker payload: per-product (image / 360 / video), last 7 days.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { buildQcTracker } from "@/lib/qc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const segment = req.nextUrl.searchParams.get("segment") || "all";
    const data = await buildQcTracker(new Date(), segment);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
