"use server";

import { getCurrentActor } from "../actor";
import { revalidateThreadContextSheet } from "../cache";
import {
  type ThreadContextSheetUpdate,
  upsertThreadContextSheetRecord,
} from "../thread-context-sheet";
import { supabase } from "../supabase";

export async function upsertThreadContextSheet(input: {
  threadId: string;
  update: ThreadContextSheetUpdate;
}): Promise<void> {
  const actor = await getCurrentActor();
  await validateThread(input.threadId, actor.instance_id);

  const didUpsert = await upsertThreadContextSheetRecord({
    instanceId: actor.instance_id,
    threadId: input.threadId,
    update: input.update,
  });

  if (didUpsert) revalidateThreadContextSheet(input.threadId);
}

async function validateThread(
  threadId: string,
  instanceId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("nodes")
    .select("id")
    .eq("id", threadId)
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Thread not found");
}
