"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getCurrentActor } from "../actor";
import {
  revalidateInstanceFields,
  revalidateNode,
  revalidateWorkspaceBoard,
} from "../cache";

export interface SetFieldValueInput {
  nodeId: string;
  parentId: string | null;
  workspaceId: string;
  fieldId: string;
  fieldType: "single_select" | "multi_select" | "text" | "date";
  optionIds?: string[];
  valueText?: string | null;
  valueDate?: string | null;
}

/**
 * Replace the value(s) for (node, field). For select-type fields, `optionIds`
 * is the new complete set — we delete existing rows and insert fresh. For
 * text/date, we upsert a single row.
 */
export async function setFieldValue(input: SetFieldValueInput): Promise<void> {
  const { nodeId, parentId, workspaceId, fieldId, fieldType } = input;

  const { error: delErr } = await supabase
    .from("node_field_values")
    .delete()
    .eq("node_id", nodeId)
    .eq("field_id", fieldId);
  if (delErr) throw delErr;

  if (fieldType === "single_select" || fieldType === "multi_select") {
    const optionIds = input.optionIds ?? [];
    if (optionIds.length > 0) {
      const rows = optionIds.map((optionId, idx) => ({
        node_id: nodeId,
        field_id: fieldId,
        option_id: optionId,
        position: idx,
      }));
      const { error: insErr } = await supabase
        .from("node_field_values")
        .insert(rows);
      if (insErr) throw insErr;
    }
  } else if (fieldType === "text") {
    const text = (input.valueText ?? "").trim();
    if (text.length > 0) {
      const { error: insErr } = await supabase.from("node_field_values").insert({
        node_id: nodeId,
        field_id: fieldId,
        value_text: text,
        position: 0,
      });
      if (insErr) throw insErr;
    }
  } else if (fieldType === "date") {
    const date = input.valueDate ?? null;
    if (date) {
      const { error: insErr } = await supabase.from("node_field_values").insert({
        node_id: nodeId,
        field_id: fieldId,
        value_date: date,
        position: 0,
      });
      if (insErr) throw insErr;
    }
  }

  revalidateNode(nodeId, parentId);
  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

export interface CreateFieldInput {
  workspaceId: string;
  name: string;
  fieldType: "single_select" | "multi_select" | "text" | "date";
  color?: string;
  description?: string | null;
  locked?: boolean;
  options?: Array<{ name: string }>;
}

export interface CreateFieldResult {
  id: string;
}

export async function createField(
  input: CreateFieldInput
): Promise<CreateFieldResult> {
  const name = input.name.trim();
  if (!name) throw new Error("Field name is required");
  const actor = await getCurrentActor();

  const { data: maxRow, error: maxErr } = await supabase
    .from("data_fields")
    .select("position")
    .eq("instance_id", actor.instance_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const position = (maxRow?.position ?? -1) + 1;

  const { data: field, error: fErr } = await supabase
    .from("data_fields")
    .insert({
      instance_id: actor.instance_id,
      name,
      field_type: input.fieldType,
      color: input.color ?? "badge-1",
      description: input.description ?? null,
      locked: input.locked ?? false,
      position,
    })
    .select("id")
    .single();
  if (fErr) throw fErr;

  if (
    (input.fieldType === "single_select" || input.fieldType === "multi_select") &&
    input.options &&
    input.options.length > 0
  ) {
    const rows = input.options.map((o, idx) => ({
      field_id: field.id,
      name: o.name.trim(),
      position: idx,
    }));
    const { error: oErr } = await supabase
      .from("data_field_options")
      .insert(rows);
    if (oErr) throw oErr;
  }

  revalidateInstanceFields(actor.instance_id);
  revalidateWorkspaceBoard(input.workspaceId);
  revalidatePath(`/n/${input.workspaceId}`);
  return { id: field.id };
}

async function revalidateAfterFieldEdit(workspaceId: string) {
  const actor = await getCurrentActor();
  revalidateInstanceFields(actor.instance_id);
  revalidateWorkspaceBoard(workspaceId);
  revalidatePath(`/n/${workspaceId}`);
}

export async function renameField(
  fieldId: string,
  workspaceId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Field name is required");
  const { error } = await supabase
    .from("data_fields")
    .update({ name: trimmed })
    .eq("id", fieldId);
  if (error) throw error;
  await revalidateAfterFieldEdit(workspaceId);
}

export async function updateField(
  fieldId: string,
  workspaceId: string,
  patch: { name?: string; description?: string | null; color?: string; locked?: boolean }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Field name is required");
    update.name = trimmed;
  }
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.locked !== undefined) update.locked = patch.locked;
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("data_fields")
    .update(update)
    .eq("id", fieldId);
  if (error) throw error;
  await revalidateAfterFieldEdit(workspaceId);
}

export async function deleteField(
  fieldId: string,
  workspaceId: string
): Promise<void> {
  const { error } = await supabase
    .from("data_fields")
    .delete()
    .eq("id", fieldId);
  if (error) throw error;
  await revalidateAfterFieldEdit(workspaceId);
}

export async function addFieldOption(
  fieldId: string,
  workspaceId: string,
  name: string
): Promise<{ id: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Option name is required");
  const { data: maxRow, error: maxErr } = await supabase
    .from("data_field_options")
    .select("position")
    .eq("field_id", fieldId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const position = (maxRow?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("data_field_options")
    .insert({ field_id: fieldId, name: trimmed, position })
    .select("id")
    .single();
  if (error) throw error;
  await revalidateAfterFieldEdit(workspaceId);
  return { id: data.id };
}

export async function updateFieldOption(
  optionId: string,
  workspaceId: string,
  patch: { name?: string }
): Promise<void> {
  const update: Record<string, string> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Option name is required");
    update.name = trimmed;
  }
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("data_field_options")
    .update(update)
    .eq("id", optionId);
  if (error) throw error;
  await revalidateAfterFieldEdit(workspaceId);
}

export async function deleteFieldOption(
  optionId: string,
  workspaceId: string
): Promise<void> {
  const { error } = await supabase
    .from("data_field_options")
    .delete()
    .eq("id", optionId);
  if (error) throw error;
  await revalidateAfterFieldEdit(workspaceId);
}

export async function reorderFieldOptions(
  fieldId: string,
  workspaceId: string,
  orderedIds: string[]
): Promise<void> {
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from("data_field_options")
        .update({ position: idx })
        .eq("id", id)
        .eq("field_id", fieldId)
    )
  );
  await revalidateAfterFieldEdit(workspaceId);
}
