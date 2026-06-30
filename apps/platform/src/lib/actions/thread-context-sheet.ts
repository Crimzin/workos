"use server";

import { getCurrentActor } from "../actor";
import { revalidateThreadContextSheet } from "../cache";
import {
  buildThreadContextSheetMarkdown,
  type ThreadContextSheetUpdate,
} from "../thread-context-sheet";
import { supabase } from "../supabase";

export async function upsertThreadContextSheet(input: {
  threadId: string;
  update: ThreadContextSheetUpdate;
}): Promise<void> {
  const actor = await getCurrentActor();
  const activeWorking = input.update.activeWorking ?? [];
  const shortTerm = input.update.shortTerm ?? [];
  const longTerm = input.update.longTerm ?? [];
  const markdown = buildThreadContextSheetMarkdown({
    active_working: activeWorking,
    short_term: shortTerm,
    long_term: longTerm,
  });

  const { error } = await supabase.from("thread_context_sheets").upsert(
    {
      instance_id: actor.instance_id,
      thread_id: input.threadId,
      active_working: activeWorking,
      short_term: shortTerm,
      long_term: longTerm,
      markdown,
      metadata: input.update.metadata ?? {},
    },
    { onConflict: "thread_id" }
  );
  if (error) throw error;
  revalidateThreadContextSheet(input.threadId);
}
