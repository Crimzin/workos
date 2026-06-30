import type {
  AccountMemoryRecord,
  AccountMemorySensitivity,
} from "./types";

const KERNEL_CATEGORIES = new Set<AccountMemoryRecord["category"]>([
  "identity",
  "role",
  "communication_style",
  "work_standard",
  "correction",
]);

const HIGH_CARE_LABELS = new Set<AccountMemorySensitivity>([
  "financial",
  "medical",
  "legal",
  "credential_like",
  "high_care",
]);

const SENSITIVE_QUERY_TERMS = new Map<AccountMemorySensitivity, string[]>([
  [
    "financial",
    [
      "finance",
      "financial",
      "money",
      "tax",
      "budget",
      "retirement",
      "runway",
      "cash",
      "asset",
    ],
  ],
  ["medical", ["medical", "health", "doctor", "diagnosis", "therapy"]],
  ["legal", ["legal", "lawyer", "contract", "lawsuit", "liability"]],
  ["credential_like", ["password", "token", "credential", "api key", "secret"]],
  ["high_care", ["private", "sensitive", "personal"]],
]);

const MARKDOWN_SECTIONS: Array<{
  title: string;
  categories: AccountMemoryRecord["category"][];
}> = [
  { title: "About Me", categories: ["identity", "role"] },
  { title: "Current Work", categories: ["current_project", "standing_goal"] },
  {
    title: "How I Work With AI",
    categories: [
      "preference",
      "recurring_constraint",
      "tool_context",
      "relationship",
      "work_standard",
    ],
  },
  { title: "Writing Voice", categories: ["communication_style", "writing_voice"] },
  { title: "Corrections", categories: ["correction"] },
  { title: "Things To Handle Carefully", categories: ["sensitive_fact"] },
];

export interface AccountMemorySelection {
  included: AccountMemoryRecord[];
  omitted: AccountMemoryRecord[];
  suppressed: AccountMemoryRecord[];
}

export function activeAccountMemory(
  records: AccountMemoryRecord[]
): AccountMemoryRecord[] {
  return records.filter((record) => record.status === "active");
}

export function buildAccountMemoryKernel(
  records: AccountMemoryRecord[]
): AccountMemoryRecord[] {
  return activeAccountMemory(records)
    .filter(
      (record) =>
        KERNEL_CATEGORIES.has(record.category) &&
        !HIGH_CARE_LABELS.has(record.sensitivity_label)
    )
    .sort(compareMemoryRecords);
}

export function selectAccountMemoryForPrompt({
  records,
  resolvedQuery,
  latestUserText,
}: {
  records: AccountMemoryRecord[];
  resolvedQuery: string;
  latestUserText: string;
}): AccountMemorySelection {
  const included: AccountMemoryRecord[] = [];
  const omitted: AccountMemoryRecord[] = [];
  const suppressed: AccountMemoryRecord[] = [];
  const activeRecords = activeAccountMemory(records).filter(
    (record) => !["tentative", "superseded", "retracted"].includes(record.status)
  );
  const ignoreVoice = shouldIgnorePriorVoice(latestUserText);
  const queryText = `${resolvedQuery} ${latestUserText}`;

  for (const record of activeRecords) {
    if (HIGH_CARE_LABELS.has(record.sensitivity_label)) {
      if (isSensitiveRecordRelevant(record, queryText)) {
        included.push(record);
      } else {
        suppressed.push(record);
      }
      continue;
    }

    if (!KERNEL_CATEGORIES.has(record.category)) {
      omitted.push(record);
      continue;
    }

    if (ignoreVoice && record.category === "communication_style") {
      omitted.push(record);
      continue;
    }

    included.push(record);
  }

  return {
    included: included.sort(compareMemoryRecords),
    omitted: omitted.sort(compareMemoryRecords),
    suppressed: suppressed.sort(compareMemoryRecords),
  };
}

export function renderAccountMemoryMarkdown(
  records: AccountMemoryRecord[]
): string {
  const activeRecords = activeAccountMemory(records).sort(compareMemoryRecords);
  const lines = ["# Account Context", ""];

  for (const section of MARKDOWN_SECTIONS) {
    const sectionRecords = activeRecords.filter((record) =>
      section.categories.includes(record.category)
    );
    if (sectionRecords.length === 0) continue;

    lines.push(`## ${section.title}`);
    for (const record of sectionRecords) {
      lines.push(`- ${record.statement}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export async function getAccountMemoryRecords(
  instanceId: string
): Promise<AccountMemoryRecord[]> {
  const [{ unstable_cache }, { cacheTags }, { supabase }] = await Promise.all([
    import("next/cache"),
    import("./cache"),
    import("./supabase"),
  ]);

  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("account_memory_records")
        .select("*")
        .eq("instance_id", instanceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AccountMemoryRecord[];
    },
    ["account-memory", instanceId],
    {
      tags: [cacheTags.accountMemory(instanceId)],
      revalidate: 3600,
    }
  )();
}

function compareMemoryRecords(
  a: AccountMemoryRecord,
  b: AccountMemoryRecord
): number {
  return (
    b.conviction - a.conviction ||
    Date.parse(b.updated_at) - Date.parse(a.updated_at)
  );
}

function shouldIgnorePriorVoice(latestUserText: string): boolean {
  const text = latestUserText.toLocaleLowerCase();
  return (
    text.includes("ignore prior voice") ||
    text.includes("ignore prior preference") ||
    text.includes("ignore prior preferences") ||
    text.includes("ignore voice preferences")
  );
}

function isSensitiveRecordRelevant(
  record: AccountMemoryRecord,
  queryText: string
): boolean {
  const text = queryText.toLocaleLowerCase();
  const statement = record.statement.toLocaleLowerCase();
  if (statement && text.includes(statement)) return true;

  const terms = SENSITIVE_QUERY_TERMS.get(record.sensitivity_label) ?? [];
  return terms.some((term) => text.includes(term));
}
