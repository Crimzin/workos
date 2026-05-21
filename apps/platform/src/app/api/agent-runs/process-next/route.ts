import { NextRequest, NextResponse } from "next/server";
import { processNextQueuedAgentRun } from "@/lib/agents/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.AGENT_WORKER_TOKEN;
  if (!token) return true;

  return req.headers.get("authorization") === `Bearer ${token}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await processNextQueuedAgentRun();
  if (!run) {
    return NextResponse.json({ processed: false });
  }

  return NextResponse.json({
    processed: true,
    run_id: run.id,
    provider_key: run.provider_key,
  });
}
