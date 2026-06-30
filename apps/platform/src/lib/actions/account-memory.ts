"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../actor";
import { revalidateAccountMemory } from "../cache";
import { supabase } from "../supabase";
import type {
  AccountMemoryCategory,
  AccountMemoryScope,
  AccountMemorySensitivity,
} from "../types";

export async function createAccountMemory(input: {
  category: AccountMemoryCategory;
  statement: string;
  scope?: AccountMemoryScope;
  sensitivityLabel?: AccountMemorySensitivity;
}): Promise<void> {
  const actor = await getCurrentActor();
  const statement = input.statement.trim();
  if (!statement) throw new Error("Memory statement is required");

  const { error } = await supabase.from("account_memory_records").insert({
    instance_id: actor.instance_id,
    category: input.category,
    statement,
    scope: input.scope ?? "account",
    sensitivity_label: input.sensitivityLabel ?? "normal",
    created_by_actor_id: actor.id,
    source_refs: [{ kind: "settings", actor_id: actor.id }],
  });
  if (error) throw error;

  revalidateAccountMemory(actor.instance_id);
  revalidatePath("/settings/memory");
}

export async function updateAccountMemory(input: {
  id: string;
  statement: string;
  category: AccountMemoryCategory;
  sensitivityLabel: AccountMemorySensitivity;
}): Promise<void> {
  const actor = await getCurrentActor();
  const statement = input.statement.trim();
  if (!statement) throw new Error("Memory statement is required");

  const { error } = await supabase
    .from("account_memory_records")
    .update({
      statement,
      category: input.category,
      sensitivity_label: input.sensitivityLabel,
      last_confirmed_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("instance_id", actor.instance_id);
  if (error) throw error;

  revalidateAccountMemory(actor.instance_id);
  revalidatePath("/settings/memory");
}

export async function retractAccountMemory(id: string): Promise<void> {
  const actor = await getCurrentActor();
  const { error } = await supabase
    .from("account_memory_records")
    .update({ status: "retracted", retracted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("instance_id", actor.instance_id);
  if (error) throw error;

  revalidateAccountMemory(actor.instance_id);
  revalidatePath("/settings/memory");
}
