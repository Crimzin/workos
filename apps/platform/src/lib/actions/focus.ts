"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateFocusHome } from "../cache";
import { insertFocusMessage, validateFocusSessionForActor } from "../focus";

export async function createFocusReply(
  focusSessionId: string,
  body: string
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  const actor = await getCurrentActor();
  const session = await validateFocusSessionForActor({
    sessionId: focusSessionId,
    instanceId: actor.instance_id,
    actorId: actor.id,
  });
  await insertFocusMessage({
    instanceId: session.instance_id,
    sessionId: session.id,
    actorId: actor.id,
    role: "user",
    messageKind: "reply",
    body: trimmed,
  });

  await insertFocusMessage({
    instanceId: session.instance_id,
    sessionId: session.id,
    actorId: null,
    role: "workos",
    messageKind: "status",
    body: "Got it. I saved that correction for this Focus plan. The next slice will teach me to revise the plan from your reply.",
    metadata: { deterministic_foundation_reply: true },
  });

  revalidateFocusHome(actor.instance_id, actor.id);
  revalidatePath("/focus");
}
