import { NextRequest, NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/actor";
import { searchNodeMentionCandidates } from "@/lib/nodes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await getCurrentActor();
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const nodes = await searchNodeMentionCandidates(actor.instance_id, query, 12);

  return NextResponse.json({ nodes });
}
