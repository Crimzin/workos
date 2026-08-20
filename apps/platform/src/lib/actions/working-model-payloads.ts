import type {
  ThreadContextSheet,
  ThreadContextSheetItem,
} from "../types";
import type { ThreadContextSheetUpdate } from "../thread-context-sheet";

export function buildCorrectWorkingModelClaimRpcArgs(input: {
  claimId: string;
  actorId: string;
  replacementStatement?: string | null;
  reason: string;
}) {
  const reason = cleanRequiredText(input.reason, "A correction reason", 500);
  const replacementStatement = cleanOptionalText(
    input.replacementStatement,
    1000
  );
  return {
    p_claim_id: input.claimId,
    p_actor_id: input.actorId,
    p_replacement_statement: replacementStatement,
    p_reason: reason,
  };
}

export function buildWorkingModelExclusionInsert(input: {
  instanceId: string;
  threadId: string;
  claimId: string;
  actorId: string;
  reason: string;
}) {
  return {
    instance_id: input.instanceId,
    thread_id: input.threadId,
    target_type: "memory_primitive" as const,
    target_id: input.claimId,
    directive: "exclude" as const,
    user_reason: cleanRequiredText(input.reason, "A relevance reason", 500),
    created_by_actor_id: input.actorId,
  };
}

export function buildClearWorkingModelOverrideUpdate(
  actorId: string,
  now: string
) {
  return {
    cleared_by_actor_id: actorId,
    cleared_at: now,
  };
}

export function buildCorrectedThreadSheetUpdate(input: {
  sheet: ThreadContextSheet;
  claimId: string;
  replacementClaimId: string | null;
  previousStatement: string;
  replacementStatement: string | null;
  now: string;
}): ThreadContextSheetUpdate {
  const nextStatus = input.replacementClaimId ? "superseded" : "retracted";
  let replacementBand: "activeWorking" | "shortTerm" | "longTerm" =
    "longTerm";
  let found = false;

  const mapBand = (
    items: ThreadContextSheetItem[],
    band: typeof replacementBand
  ) =>
    items.map((item) => {
      if (!matchesCorrectedClaim(item, input.claimId, input.previousStatement)) {
        return item;
      }
      if (!found) replacementBand = band;
      found = true;
      return { ...item, status: nextStatus, updated_at: input.now };
    });

  const update: Required<
    Pick<ThreadContextSheetUpdate, "activeWorking" | "shortTerm" | "longTerm">
  > & { metadata: Record<string, unknown> } = {
    activeWorking: mapBand(input.sheet.active_working, "activeWorking"),
    shortTerm: mapBand(input.sheet.short_term, "shortTerm"),
    longTerm: mapBand(input.sheet.long_term, "longTerm"),
    metadata: {
      working_model_corrected_at: input.now,
      working_model_corrected_claim_id: input.claimId,
    },
  };

  if (input.replacementClaimId && input.replacementStatement) {
    update[replacementBand].push({
      id: `working-model:${input.replacementClaimId}`,
      statement: input.replacementStatement,
      source_refs: [
        {
          memory_primitive_id: input.replacementClaimId,
          relation: "corrects",
        },
      ],
      status: "active",
      updated_at: input.now,
    });
  }

  return update;
}

function matchesCorrectedClaim(
  item: ThreadContextSheetItem,
  claimId: string,
  statement: string
): boolean {
  if (
    item.source_refs.some(
      (source) => source.memory_primitive_id === claimId
    )
  ) {
    return true;
  }
  return normalizeText(item.statement) === normalizeText(statement);
}

function cleanRequiredText(
  value: string,
  label: string,
  maxLength: number
): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function cleanOptionalText(
  value: string | null | undefined,
  maxLength: number
): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw new Error(`The replacement must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
