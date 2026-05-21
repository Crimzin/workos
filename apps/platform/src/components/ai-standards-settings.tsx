"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { AIStandard } from "@/lib/types";
import {
  deleteCustomAIStandard,
  resetAIStandardOverride,
  saveAIStandardOverride,
} from "@/lib/actions/ai-standards";

interface AIStandardsSettingsProps {
  standards: AIStandard[];
}

type MutationStatus = {
  key: string;
  action: "saved" | "reset" | "deleted";
} | null;

const MODE_LABELS: Record<AIStandard["mode"], string> = {
  latent: "Latent",
  visible_when_useful: "Visible when useful",
};

export function AIStandardsSettings({ standards }: AIStandardsSettingsProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(standards);
  const [status, setStatus] = useState<MutationStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => setStatus(null), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const grouped = useMemo(
    () => ({
      interaction: drafts.filter((standard) => standard.category === "interaction"),
      output: drafts.filter((standard) => standard.category === "output"),
    }),
    [drafts]
  );

  const updateDraft = (standardKey: string, patch: Partial<AIStandard>) => {
    setDrafts((current) =>
      current.map((standard) =>
        standard.standard_key === standardKey
          ? { ...standard, ...patch }
          : standard
      )
    );
  };

  const save = (standard: AIStandard) => {
    if (standard.source === "custom") return;

    setError(null);
    startTransition(async () => {
      try {
        await saveAIStandardOverride({
          standardKey: standard.standard_key,
          category: standard.category,
          title: standard.title,
          instruction: standard.instruction,
          mode: standard.mode,
          enabled: standard.enabled,
          position: standard.position,
          source: "override",
        });
        setStatus({ key: standard.standard_key, action: "saved" });
        router.refresh();
      } catch {
        setError("Could not save that standard.");
      }
    });
  };

  const reset = (standardKey: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await resetAIStandardOverride(standardKey);
        setStatus({ key: standardKey, action: "reset" });
        router.refresh();
      } catch {
        setError("Could not reset that standard.");
      }
    });
  };

  const deleteCustom = (standardKey: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCustomAIStandard(standardKey);
        setDrafts((current) =>
          current.filter((standard) => standard.standard_key !== standardKey)
        );
        setStatus({ key: standardKey, action: "deleted" });
        router.refresh();
      } catch {
        setError("Could not delete that custom standard.");
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-bg-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Effective Standards
          </h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Defaults save as instance overrides. Custom standards can be
            removed here.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-border bg-bg-card px-2 py-1 text-xs text-text-secondary">
            {error}
          </div>
        )}
      </div>

      <StandardGroup
        title="Interaction"
        description="How AI teammates reason, ask, challenge, and collaborate."
        standards={grouped.interaction}
        pending={pending}
        status={status}
        onUpdate={updateDraft}
        onSave={save}
        onReset={reset}
        onDeleteCustom={deleteCustom}
      />
      <StandardGroup
        title="Output"
        description="How AI teammates structure synthesis, recommendations, and deliverables."
        standards={grouped.output}
        pending={pending}
        status={status}
        onUpdate={updateDraft}
        onSave={save}
        onReset={reset}
        onDeleteCustom={deleteCustom}
      />
    </div>
  );
}

interface StandardGroupProps {
  title: string;
  description: string;
  standards: AIStandard[];
  pending: boolean;
  status: MutationStatus;
  onUpdate: (standardKey: string, patch: Partial<AIStandard>) => void;
  onSave: (standard: AIStandard) => void;
  onReset: (standardKey: string) => void;
  onDeleteCustom: (standardKey: string) => void;
}

function StandardGroup({
  title,
  description,
  standards,
  pending,
  status,
  onUpdate,
  onSave,
  onReset,
  onDeleteCustom,
}: StandardGroupProps) {
  return (
    <section className="border-b border-border last:border-b-0">
      <div className="border-b border-border px-4 py-3">
        <div className="section-label">{title}</div>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </div>

      <div className="divide-y divide-border">
        {standards.map((standard) => (
          <StandardRow
            key={standard.standard_key}
            standard={standard}
            pending={pending}
            status={status}
            onUpdate={onUpdate}
            onSave={onSave}
            onReset={onReset}
            onDeleteCustom={onDeleteCustom}
          />
        ))}
      </div>
    </section>
  );
}

interface StandardRowProps {
  standard: AIStandard;
  pending: boolean;
  status: MutationStatus;
  onUpdate: (standardKey: string, patch: Partial<AIStandard>) => void;
  onSave: (standard: AIStandard) => void;
  onReset: (standardKey: string) => void;
  onDeleteCustom: (standardKey: string) => void;
}

function StandardRow({
  standard,
  pending,
  status,
  onUpdate,
  onSave,
  onReset,
  onDeleteCustom,
}: StandardRowProps) {
  const isCustom = standard.source === "custom";
  const isStatusRow = status?.key === standard.standard_key;
  const canEdit = !isCustom;

  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <label className="sr-only" htmlFor={`${standard.standard_key}-title`}>
          Standard title
        </label>
        <input
          id={`${standard.standard_key}-title`}
          value={standard.title}
          disabled={!canEdit}
          onChange={(event) =>
            onUpdate(standard.standard_key, { title: event.target.value })
          }
          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-text-primary outline-none transition-colors disabled:cursor-default disabled:opacity-100 focus:border-border-strong focus:bg-bg-primary"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5 px-2">
          <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary">
            {isCustom ? "Custom" : "Default"}
          </span>
          <span className="break-all font-mono text-[11px] text-text-tertiary">
            {standard.standard_key}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <label
          className="sr-only"
          htmlFor={`${standard.standard_key}-instruction`}
        >
          Instruction
        </label>
        <textarea
          id={`${standard.standard_key}-instruction`}
          value={standard.instruction}
          disabled={!canEdit}
          onChange={(event) =>
            onUpdate(standard.standard_key, {
              instruction: event.target.value,
            })
          }
          rows={3}
          className="min-h-24 w-full resize-y rounded-md border border-border bg-bg-primary px-3 py-2 text-sm leading-5 text-text-primary outline-none transition-colors disabled:cursor-default disabled:opacity-100 focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={`${standard.standard_key}-mode`}>
            Mode
          </label>
          <select
            id={`${standard.standard_key}-mode`}
            value={standard.mode}
            disabled={!canEdit}
            onChange={(event) =>
              onUpdate(standard.standard_key, {
                mode: event.target.value as AIStandard["mode"],
              })
            }
            className="w-full rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-secondary outline-none transition-colors disabled:cursor-default disabled:opacity-100 focus:border-accent sm:w-fit"
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
            {standard.mode === "latent" ? (
              <EyeOff size={13} />
            ) : (
              <Eye size={13} />
            )}
            {MODE_LABELS[standard.mode]}
          </span>
        </div>
      </div>

      <div className="flex items-start gap-1 lg:justify-end">
        <IconButton
          label={standard.enabled ? "Disable standard" : "Enable standard"}
          disabled={!canEdit || pending}
          onClick={() =>
            onUpdate(standard.standard_key, {
              enabled: !standard.enabled,
            })
          }
        >
          {standard.enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
        </IconButton>
        <IconButton
          label={
            isCustom
              ? "Custom standard editing is not available"
              : "Save standard"
          }
          disabled={isCustom || pending}
          onClick={() => onSave(standard)}
        >
          {isStatusRow && status.action === "saved" ? (
            <Check size={15} />
          ) : (
            <Save size={15} />
          )}
        </IconButton>
        {!isCustom && (
          <IconButton
            label="Reset default"
            disabled={pending}
            onClick={() => onReset(standard.standard_key)}
          >
            {isStatusRow && status.action === "reset" ? (
              <Check size={15} />
            ) : (
              <RotateCcw size={15} />
            )}
          </IconButton>
        )}
        {isCustom && (
          <IconButton
            label="Delete custom standard"
            disabled={pending}
            danger
            onClick={() => onDeleteCustom(standard.standard_key)}
          >
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
        danger
          ? "text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          : "text-text-tertiary hover:bg-bg-hover hover:text-text-primary",
        "focus:outline-none focus:ring-1 focus:ring-accent disabled:pointer-events-none disabled:opacity-40",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
