"use server";

import { getCurrentActor } from "../actor";
import { revalidateThreadContextSheet } from "../cache";
import {
  buildThreadContextSheetUpsertPayload,
  type ThreadContextSheetUpdate,
} from "../thread-context-sheet";
import { supabase } from "../supabase";
import type { ThreadContextSheet } from "../types";

export async function upsertThreadContextSheet(input: {
  threadId: string;
  update: ThreadContextSheetUpdate;
}): Promise<void> {
  const actor = await getCurrentActor();
  await validateThread(input.threadId, actor.instance_id);

  const { data: existingSheet, error: existingError } = await supabase
    .from("thread_context_sheets")
    .select("*")
    .eq("thread_id", input.threadId)
    .eq("instance_id", actor.instance_id)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = buildThreadContextSheetUpsertPayload({
    instanceId: actor.instance_id,
    threadId: input.threadId,
    existingSheet: existingSheet as ThreadContextSheet | null,
    update: input.update,
  });

  const { error } = await supabase.from("thread_context_sheets").upsert(
    payload,
    { onConflict: "thread_id" }
  );
  if (error) throw error;
  revalidateThreadContextSheet(input.threadId);
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
