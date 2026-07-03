"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Save } from "lucide-react";
import {
  createAccountMemory,
  retractAccountMemory,
  updateAccountMemory,
} from "@/lib/actions/account-memory";
import type {
  AccountMemoryCategory,
  AccountMemoryRecord,
  AccountMemorySensitivity,
} from "@/lib/types";

interface AccountMemorySettingsProps {
  records: AccountMemoryRecord[];
  markdown: string;
}

const CATEGORY_OPTIONS: Array<{
  value: AccountMemoryCategory;
  label: string;
}> = [
  { value: "identity", label: "Identity" },
  { value: "role", label: "Role" },
  { value: "current_project", label: "Current project" },
  { value: "standing_goal", label: "Standing goal" },
  { value: "preference", label: "Preference" },
  { value: "communication_style", label: "Communication style" },
  { value: "writing_voice", label: "Writing voice" },
  { value: "recurring_constraint", label: "Recurring constraint" },
  { value: "tool_context", label: "Tool context" },
  { value: "relationship", label: "Relationship" },
  { value: "correction", label: "Correction" },
  { value: "sensitive_fact", label: "Sensitive fact" },
  { value: "work_standard", label: "Work standard" },
];

const SENSITIVITY_OPTIONS: Array<{
  value: AccountMemorySensitivity;
  label: string;
}> = [
  { value: "normal", label: "Normal" },
  { value: "private", label: "Private" },
  { value: "financial", label: "Financial" },
  { value: "medical", label: "Medical" },
  { value: "legal", label: "Legal" },
  { value: "credential_like", label: "Credential-like" },
  { value: "high_care", label: "High care" },
];

type Drafts = Record<
  string,
  {
    statement: string;
    category: AccountMemoryCategory;
    sensitivityLabel: AccountMemorySensitivity;
  }
>;

export function AccountMemorySettings({
  records,
  markdown,
}: AccountMemorySettingsProps) {
  const router = useRouter();
  const [statement, setStatement] = useState("");
  const [category, setCategory] = useState<AccountMemoryCategory>("preference");
  const [sensitivityLabel, setSensitivityLabel] =
    useState<AccountMemorySensitivity>("normal");
  const [drafts, setDrafts] = useState<Drafts>(() => buildDrafts(records));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeRecords = useMemo(
    () =>
      records
        .filter((record) => record.status === "active")
        .sort(
          (a, b) =>
            Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
            a.statement.localeCompare(b.statement)
        ),
    [records]
  );

  const addMemory = () => {
    setError(null);
    startTransition(async () => {
      try {
        await createAccountMemory({
          category,
          statement,
          sensitivityLabel,
        });
        setStatement("");
        setCategory("preference");
        setSensitivityLabel("normal");
        router.refresh();
      } catch {
        setError("Could not add that memory.");
      }
    });
  };

  const saveMemory = (record: AccountMemoryRecord) => {
    const draft = drafts[record.id];
    if (!draft) return;

    setError(null);
    startTransition(async () => {
      try {
        await updateAccountMemory({
          id: record.id,
          statement: draft.statement,
          category: draft.category,
          sensitivityLabel: draft.sensitivityLabel,
        });
        router.refresh();
      } catch {
        setError("Could not save that memory.");
      }
    });
  };

  const retractMemory = (record: AccountMemoryRecord) => {
    setError(null);
    startTransition(async () => {
      try {
        await retractAccountMemory(record.id);
        router.refresh();
      } catch {
        setError("Could not retract that memory.");
      }
    });
  };

  const updateDraft = (
    id: string,
    patch: Partial<{
      statement: string;
      category: AccountMemoryCategory;
      sensitivityLabel: AccountMemorySensitivity;
    }>
  ) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Memory</h2>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Review and maintain long-term account context used across WorkOS
            threads.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-secondary">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-bg-card">
        <div className="border-b border-border bg-bg-secondary px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Add Memory</h3>
        </div>
        <div className="grid gap-3 p-4">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-text-secondary">
              Statement
            </span>
            <textarea
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              rows={3}
              className="min-h-20 rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Capture a durable preference, correction, or context note."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <SelectField
              label="Category"
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={(value) => setCategory(value as AccountMemoryCategory)}
            />
            <SelectField
              label="Sensitivity"
              value={sensitivityLabel}
              options={SENSITIVITY_OPTIONS}
              onChange={(value) =>
                setSensitivityLabel(value as AccountMemorySensitivity)
              }
            />
            <button
              type="button"
              onClick={addMemory}
              disabled={pending || !statement.trim()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} />
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-bg-card">
        <div className="border-b border-border bg-bg-secondary px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Active Memories
          </h3>
        </div>
        {activeRecords.length > 0 ? (
          <div className="divide-y divide-border">
            {activeRecords.map((record) => (
              <MemoryRow
                key={record.id}
                record={record}
                draft={drafts[record.id]}
                pending={pending}
                onUpdate={updateDraft}
                onSave={() => saveMemory(record)}
                onRetract={() => retractMemory(record)}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-text-tertiary">
            No active memories yet.
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-bg-card">
        <div className="border-b border-border bg-bg-secondary px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Portable Markdown
          </h3>
        </div>
        <div className="p-4">
          <textarea
            readOnly
            value={markdown}
            rows={12}
            className="w-full resize-y rounded-md border border-border bg-bg-primary px-3 py-2 font-mono text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>
    </section>
  );
}

function MemoryRow({
  record,
  draft,
  pending,
  onUpdate,
  onSave,
  onRetract,
}: {
  record: AccountMemoryRecord;
  draft:
    | {
        statement: string;
        category: AccountMemoryCategory;
        sensitivityLabel: AccountMemorySensitivity;
      }
    | undefined;
  pending: boolean;
  onUpdate: (
    id: string,
    patch: Partial<{
      statement: string;
      category: AccountMemoryCategory;
      sensitivityLabel: AccountMemorySensitivity;
    }>
  ) => void;
  onSave: () => void;
  onRetract: () => void;
}) {
  const current = draft ?? {
    statement: record.statement,
    category: record.category,
    sensitivityLabel: record.sensitivity_label,
  };

  return (
    <div className="grid gap-3 px-4 py-3">
      <label className="grid gap-1">
        <span className="text-xs font-medium text-text-secondary">
          Statement
        </span>
        <textarea
          value={current.statement}
          onChange={(event) =>
            onUpdate(record.id, { statement: event.target.value })
          }
          rows={2}
          className="min-h-16 rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <SelectField
          label="Category"
          value={current.category}
          options={CATEGORY_OPTIONS}
          onChange={(value) =>
            onUpdate(record.id, { category: value as AccountMemoryCategory })
          }
        />
        <SelectField
          label="Sensitivity"
          value={current.sensitivityLabel}
          options={SENSITIVITY_OPTIONS}
          onChange={(value) =>
            onUpdate(record.id, {
              sensitivityLabel: value as AccountMemorySensitivity,
            })
          }
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={pending || !current.statement.trim()}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-bg-primary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={15} />
            Save
          </button>
          <button
            type="button"
            onClick={onRetract}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-bg-primary px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={15} />
            Retract
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildDrafts(records: AccountMemoryRecord[]): Drafts {
  return Object.fromEntries(
    records.map((record) => [
      record.id,
      {
        statement: record.statement,
        category: record.category,
        sensitivityLabel: record.sensitivity_label,
      },
    ])
  );
}
