"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getCurrentActor, type CurrentActor } from "../actor";
import {
  revalidateInstanceFields,
  revalidateNode,
  revalidateWorkspaceBoard,
} from "../cache";
import {
  buildFieldValueChangeMetadata,
  normalizeEventValueLabels,
  recordWorkOSEvent,
} from "../events";

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

type FieldRow = {
  id: string;
  name: string;
  field_type: string;
};

type FieldValueRow = {
  value_text: string | null;
  value_date: string | null;
  option: { name: string | null } | Array<{ name: string | null }> | null;
};

type FieldOptionRow = {
  id: string;
  name: string;
};

async function getFieldRow(fieldId: string): Promise<FieldRow> {
  const { data, error } = await supabase
    .from("data_fields")
    .select("id,name,field_type")
    .eq("id", fieldId)
    .single();
  if (error) throw error;
  return data as FieldRow;
}

function fieldValueLabel(row: FieldValueRow): string | null {
  const option = Array.isArray(row.option) ? row.option[0] : row.option;
  return option?.name ?? row.value_text ?? row.value_date ?? null;
}

async function getValidOptionsForField(
  fieldId: string,
  optionIds: string[]
): Promise<FieldOptionRow[]> {
  if (optionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("data_field_options")
    .select("id,name")
    .eq("field_id", fieldId)
    .in("id", optionIds);
  if (error) throw error;

  const optionsById = new Map(
    (data ?? []).map((option) => [option.id, option as FieldOptionRow])
  );
  return optionIds
    .map((optionId) => optionsById.get(optionId) ?? null)
    .filter((option): option is FieldOptionRow => Boolean(option));
}

function sameStringList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Replace the value(s) for (node, field). For select-type fields, `optionIds`
 * is the new complete set — we delete existing rows and insert fresh. For
 * text/date, we upsert a single row.
 */
export async function setFieldValue(input: SetFieldValueInput): Promise<void> {
  const { nodeId, parentId, workspaceId, fieldId, fieldType } = input;
  const actor = await getCurrentActor();
  const fieldRow = await getFieldRow(fieldId);

  const { data: currentRows, error: currentErr } = await supabase
    .from("node_field_values")
    .select("value_text,value_date,option:data_field_options(name)")
    .eq("node_id", nodeId)
    .eq("field_id", fieldId)
    .order("position", { ascending: true });
  if (currentErr) throw currentErr;

  const previousValues = normalizeEventValueLabels(
    ((currentRows ?? []) as FieldValueRow[]).map(fieldValueLabel)
  );
  const validOptions =
    fieldType === "single_select" || fieldType === "multi_select"
      ? await getValidOptionsForField(fieldId, input.optionIds ?? [])
      : [];
  const nextValues =
    fieldType === "text"
      ? normalizeEventValueLabels([input.valueText ?? null])
      : fieldType === "date"
        ? normalizeEventValueLabels([input.valueDate ?? null])
        : normalizeEventValueLabels(validOptions.map((option) => option.name));

  if (sameStringList(previousValues, nextValues)) return;

  const { error: delErr } = await supabase
    .from("node_field_values")
    .delete()
    .eq("node_id", nodeId)
    .eq("field_id", fieldId);
  if (delErr) throw delErr;

  if (fieldType === "single_select" || fieldType === "multi_select") {
    if (validOptions.length > 0) {
      const rows = validOptions.map((option, idx) => ({
        node_id: nodeId,
        field_id: fieldId,
        option_id: option.id,
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

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId,
    actorId: actor.id,
    eventType: "field.value_changed",
    subjectType: "field",
    subjectId: fieldId,
    summary: `${actor.name} changed ${fieldRow.name}.`,
    metadata: buildFieldValueChangeMetadata({
      fieldId,
      fieldName: fieldRow.name,
      previousValues,
      nextValues,
    }),
  });

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

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId: input.workspaceId,
    nodeId: input.workspaceId,
    actorId: actor.id,
    eventType: "field.created",
    subjectType: "field",
    subjectId: field.id,
    summary: `${actor.name} created ${name}.`,
    metadata: {
      field_id: field.id,
      field_name: name,
      field_type: input.fieldType,
      option_names: input.options?.map((option) => option.name.trim()).filter(Boolean) ?? [],
    },
  });

  revalidateInstanceFields(actor.instance_id);
  revalidateWorkspaceBoard(input.workspaceId);
  revalidatePath(`/n/${input.workspaceId}`);
  return { id: field.id };
}

async function revalidateAfterFieldEdit(
  workspaceId: string,
  actor?: CurrentActor
) {
  const currentActor = actor ?? (await getCurrentActor());
  revalidateInstanceFields(currentActor.instance_id);
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
  const actor = await getCurrentActor();
  const fieldRow = await getFieldRow(fieldId);
  const { error } = await supabase
    .from("data_fields")
    .update({ name: trimmed })
    .eq("id", fieldId);
  if (error) throw error;
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: workspaceId,
    actorId: actor.id,
    eventType: "field.updated",
    subjectType: "field",
    subjectId: fieldId,
    summary: `${actor.name} updated ${trimmed}.`,
    metadata: {
      field_id: fieldId,
      previous_name: fieldRow.name,
      field_name: trimmed,
      patch_keys: ["name"],
    },
  });
  await revalidateAfterFieldEdit(workspaceId, actor);
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

  const actor = await getCurrentActor();
  const fieldRow = await getFieldRow(fieldId);
  const { error } = await supabase
    .from("data_fields")
    .update(update)
    .eq("id", fieldId);
  if (error) throw error;
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: workspaceId,
    actorId: actor.id,
    eventType: "field.updated",
    subjectType: "field",
    subjectId: fieldId,
    summary: `${actor.name} updated ${fieldRow.name}.`,
    metadata: {
      field_id: fieldId,
      field_name: (update.name as string | undefined) ?? fieldRow.name,
      field_type: fieldRow.field_type,
      patch_keys: Object.keys(update),
    },
  });
  await revalidateAfterFieldEdit(workspaceId, actor);
}

export async function deleteField(
  fieldId: string,
  workspaceId: string
): Promise<void> {
  const actor = await getCurrentActor();
  const fieldRow = await getFieldRow(fieldId);
  const { error } = await supabase
    .from("data_fields")
    .delete()
    .eq("id", fieldId);
  if (error) throw error;
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: workspaceId,
    actorId: actor.id,
    eventType: "field.deleted",
    subjectType: "field",
    subjectId: fieldId,
    summary: `${actor.name} deleted ${fieldRow.name}.`,
    metadata: {
      field_id: fieldId,
      field_name: fieldRow.name,
      field_type: fieldRow.field_type,
    },
  });
  await revalidateAfterFieldEdit(workspaceId, actor);
}

export async function addFieldOption(
  fieldId: string,
  workspaceId: string,
  name: string
): Promise<{ id: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Option name is required");
  const actor = await getCurrentActor();
  const fieldRow = await getFieldRow(fieldId);
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
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: workspaceId,
    actorId: actor.id,
    eventType: "field.option_created",
    subjectType: "field_option",
    subjectId: data.id,
    summary: `${actor.name} added ${trimmed} to ${fieldRow.name}.`,
    metadata: {
      field_id: fieldId,
      field_name: fieldRow.name,
      option_id: data.id,
      option_name: trimmed,
    },
  });
  await revalidateAfterFieldEdit(workspaceId, actor);
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

  const actor = await getCurrentActor();
  const { data: optionRow, error: optionErr } = await supabase
    .from("data_field_options")
    .select("id,name,field_id,data_fields(name)")
    .eq("id", optionId)
    .single();
  if (optionErr) throw optionErr;

  const { error } = await supabase
    .from("data_field_options")
    .update(update)
    .eq("id", optionId);
  if (error) throw error;
  const field = Array.isArray(optionRow.data_fields)
    ? optionRow.data_fields[0]
    : optionRow.data_fields;
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: workspaceId,
    actorId: actor.id,
    eventType: "field.option_updated",
    subjectType: "field_option",
    subjectId: optionId,
    summary: `${actor.name} updated ${update.name ?? optionRow.name}.`,
    metadata: {
      field_id: optionRow.field_id,
      field_name: field?.name,
      option_id: optionId,
      previous_name: optionRow.name,
      option_name: update.name ?? optionRow.name,
      patch_keys: Object.keys(update),
    },
  });
  await revalidateAfterFieldEdit(workspaceId, actor);
}

export async function deleteFieldOption(
  optionId: string,
  workspaceId: string
): Promise<void> {
  const actor = await getCurrentActor();
  const { data: optionRow, error: optionErr } = await supabase
    .from("data_field_options")
    .select("id,name,field_id,data_fields(name)")
    .eq("id", optionId)
    .single();
  if (optionErr) throw optionErr;
  const { error } = await supabase
    .from("data_field_options")
    .delete()
    .eq("id", optionId);
  if (error) throw error;
  const field = Array.isArray(optionRow.data_fields)
    ? optionRow.data_fields[0]
    : optionRow.data_fields;
  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: workspaceId,
    actorId: actor.id,
    eventType: "field.option_deleted",
    subjectType: "field_option",
    subjectId: optionId,
    summary: `${actor.name} deleted ${optionRow.name}.`,
    metadata: {
      field_id: optionRow.field_id,
      field_name: field?.name,
      option_id: optionId,
      option_name: optionRow.name,
    },
  });
  await revalidateAfterFieldEdit(workspaceId, actor);
}

export async function reorderFieldOptions(
  fieldId: string,
  workspaceId: string,
  orderedIds: string[]
): Promise<void> {
  const actor = await getCurrentActor();
  const fieldRow = await getFieldRow(fieldId);
  const results = await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from("data_field_options")
        .update({ position: idx })
        .eq("id", id)
        .eq("field_id", fieldId)
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  await recordWorkOSEvent({
    instanceId: actor.instance_id,
    workspaceId,
    nodeId: workspaceId,
    actorId: actor.id,
    eventType: "field.option_reordered",
    subjectType: "field",
    subjectId: fieldId,
    summary: `${actor.name} reordered options for ${fieldRow.name}.`,
    metadata: {
      field_id: fieldId,
      field_name: fieldRow.name,
      ordered_ids: orderedIds,
    },
  });
  await revalidateAfterFieldEdit(workspaceId, actor);
}
