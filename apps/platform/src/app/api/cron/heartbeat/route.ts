import { NextResponse, type NextRequest } from "next/server";
import { getCronAuthorizationStatus } from "@/lib/heartbeat";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authStatus = getCronAuthorizationStatus(
    req.headers.get("authorization")
  );

  if (authStatus === "misconfigured") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  if (authStatus === "unauthorized") {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 }
    );
  }

  const { error } = await supabase.from("nodes").select("id").limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
  });
}
