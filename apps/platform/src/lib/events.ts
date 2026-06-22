import type { WorkOSEventType } from "./types";

export interface WorkOSEventInput {
  instanceId: string;
  workspaceId?: string | null;
  nodeId?: string | null;
  actorId?: string | null;
  eventType: WorkOSEventType;
  subjectType: string;
  subjectId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export interface WorkOSEventInsert {
  instance_id: string;
  workspace_id: string | null;
  node_id: string | null;
  actor_id: string | null;
  event_type: WorkOSEventType;
  subject_type: string;
  subject_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  occurred_at?: string;
}

export interface FieldValueChangeMetadataInput {
  fieldId: string;
  fieldName?: string;
  previousValues: string[];
  nextValues: string[];
}

export interface FieldValueChangeMetadata {
  field_id: string;
  field_name?: string;
  previous_values: string[];
  next_values: string[];
}

export function buildWorkOSEventInsert(
  input: WorkOSEventInput
): WorkOSEventInsert {
  return {
    instance_id: input.instanceId,
    workspace_id: input.workspaceId ?? null,
    node_id: input.nodeId ?? null,
    actor_id: input.actorId ?? null,
    event_type: input.eventType,
    subject_type: input.subjectType,
    subject_id: input.subjectId ?? null,
    summary: input.summary ?? null,
    metadata: input.metadata ?? {},
    ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
  };
}

export async function recordWorkOSEvent(
  input: WorkOSEventInput
): Promise<void> {
  const { supabase } = await import("./supabase");
  const { error } = await supabase
    .from("workos_events")
    .insert(buildWorkOSEventInsert(input));

  if (error) throw error;
}

export function buildFieldValueChangeMetadata(
  input: FieldValueChangeMetadataInput
): FieldValueChangeMetadata {
  return {
    field_id: input.fieldId,
    ...(input.fieldName ? { field_name: input.fieldName } : {}),
    previous_values: input.previousValues,
    next_values: input.nextValues,
  };
}
