import { NextResponse } from "next/server";
import { getActors, getCurrentActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCurrentActor();
  const actors = await getActors(actor.instance_id);

  return NextResponse.json({ actors });
}
