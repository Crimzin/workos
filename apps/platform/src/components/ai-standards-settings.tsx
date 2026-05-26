"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { AIStandard } from "@/lib/types";
import { DEFAULT_AI_STANDARDS } from "@/lib/ai-standards";
import {
  createCustomAIStandard,
  deleteCustomAIStandard,
  resetAIStandardOverride,
  saveCustomAIStandard,
  saveAIStandardOverride,
} from "@/lib/actions/ai-standards";

interface AIStandardsSettingsProps {
  standards: AIStandard[];
}

type MutationStatus = {
  key: string;
  action: "created" | "saved" | "reset" | "deleted";
} | null;

const MODE_LABELS: Record<AIStandard["mode"], string> = {
  latent: "Latent",
  visible_when_useful: "Visible when useful",
};

function sortStandards(standards: AIStandard[]) {
  return [...standards].sort(
    (a, b) => a.position - b.position || a.title.localeCompare(b.title)
  );
}

export function AIStandardsSettings({ standards }: AIStandardsSettingsProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(standards);
  const [status, setStatus] = useState<MutationStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const saveTimeouts = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => setStatus(null), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(
    () => () => {
      Object.values(saveTimeouts.current).forEach(window.clearTimeout);
    },
    []
  );

  const grouped = useMemo(
    () => ({
      interaction: drafts.filter((standard) => standard.category === "interaction"),
      output: drafts.filter((standard) => standard.category === "output"),
    }),
    [drafts]
  );

  const save = useCallback((standard: AIStandard) => {
    if (!standard.title.trim() || !standard.instruction.trim()) return;

    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          standardKey: standard.standard_key,
          category: standard.category,
          title: standard.title,
          instruction: standard.instruction,
          mode: standard.mode,
          enabled: standard.enabled,
          position: standard.position,
          source: standard.source === "custom" ? "custom" : "override",
        } as const;
        if (standard.source === "custom") {
          await saveCustomAIStandard(payload);
        } else {
          await saveAIStandardOverride(payload);
        }
        setStatus({ key: standard.standard_key, action: "saved" });
      } catch {
        setError("Could not save that standard.");
      }
    });
  }, []);

  const queueSave = useCallback(
    (standard: AIStandard) => {
      window.clearTimeout(saveTimeouts.current[standard.standard_key]);
      saveTimeouts.current[standard.standard_key] = window.setTimeout(() => {
        save(standard);
      }, 650);
    },
    [save]
  );

  const updateDraft = (
    standardKey: string,
    patch: Partial<AIStandard>,
    options?: { saveNow?: boolean }
  ) => {
    const updatedRef: { current?: AIStandard } = {};
    setDrafts((current) =>
      current.map((standard) => {
        if (standard.standard_key !== standardKey) return standard;
        const updatedStandard = { ...standard, ...patch };
        updatedRef.current = updatedStandard;
        return updatedStandard;
      })
    );

    const updatedStandard = updatedRef.current;
    if (!updatedStandard) return;

    if (options?.saveNow) {
      window.clearTimeout(saveTimeouts.current[standardKey]);
      save(updatedStandard);
      return;
    }
    queueSave(updatedStandard);
  };

  const createCustom = (input: {
    category: AIStandard["category"];
    title: string;
    instruction: string;
    mode: AIStandard["mode"];
  }) => {
    const nextPosition =
      Math.max(
        0,
        ...drafts
          .filter((standard) => standard.category === input.category)
          .map((standard) => standard.position)
      ) + 10;
    setError(null);
    startTransition(async () => {
      try {
        const created = await createCustomAIStandard({
          ...input,
          position: nextPosition,
        });
        setDrafts((current) => sortStandards([...current, created]));
        setStatus({ key: created.standard_key, action: "created" });
      } catch {
        setError("Could not add that principle.");
      }
    });
  };

  const reset = (standardKey: string) => {
    const defaultStandard = DEFAULT_AI_STANDARDS.find(
      (standard) => standard.standard_key === standardKey
    );
    window.clearTimeout(saveTimeouts.current[standardKey]);
    setError(null);
    startTransition(async () => {
      try {
        await resetAIStandardOverride(standardKey);
        if (defaultStandard) {
          setDrafts((current) =>
            current.map((standard) =>
              standard.standard_key === standardKey ? defaultStandard : standard
            )
          );
        }
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
        category="interaction"
        title="Interaction"
        description="How AI teammates reason, ask, challenge, and collaborate."
        standards={grouped.interaction}
        pending={pending}
        status={status}
        onCreate={createCustom}
        onUpdate={updateDraft}
        onReset={reset}
        onDeleteCustom={deleteCustom}
      />
      <StandardGroup
        category="output"
        title="Output"
        description="How AI teammates structure synthesis, recommendations, and deliverables."
        standards={grouped.output}
        pending={pending}
        status={status}
        onCreate={createCustom}
        onUpdate={updateDraft}
        onReset={reset}
        onDeleteCustom={deleteCustom}
      />
    </div>
  );
}

interface StandardGroupProps {
  category: AIStandard["category"];
  title: string;
  description: string;
  standards: AIStandard[];
  pending: boolean;
  status: MutationStatus;
  onCreate: (input: {
    category: AIStandard["category"];
    title: string;
    instruction: string;
    mode: AIStandard["mode"];
  }) => void;
  onUpdate: (
    standardKey: string,
    patch: Partial<AIStandard>,
    options?: { saveNow?: boolean }
  ) => void;
  onReset: (standardKey: string) => void;
  onDeleteCustom: (standardKey: string) => void;
}

function StandardGroup({
  category,
  title,
  description,
  standards,
  pending,
  status,
  onCreate,
  onUpdate,
  onReset,
  onDeleteCustom,
}: StandardGroupProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [instructionDraft, setInstructionDraft] = useState("");
  const [modeDraft, setModeDraft] = useState<AIStandard["mode"]>("latent");
  const canCreate =
    titleDraft.trim().length > 0 && instructionDraft.trim().length > 0;

  const submit = () => {
    if (!canCreate || pending) return;
    onCreate({
      category,
      title: titleDraft,
      instruction: instructionDraft,
      mode: modeDraft,
    });
    setTitleDraft("");
    setInstructionDraft("");
    setModeDraft("latent");
    setIsAdding(false);
  };

  return (
    <section className="border-b border-border last:border-b-0">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="section-label">{title}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-secondary">{description}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => setIsAdding((current) => !current)}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-bg-card px-2.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:bg-bg-hover hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus size={14} />
          Add principle
        </button>
      </div>

      <div className="divide-y divide-border">
        {isAdding && (
          <div className="grid gap-3 bg-bg-secondary/50 px-4 py-4 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <label className="sr-only" htmlFor={`${category}-new-title`}>
                New principle title
              </label>
              <input
                id={`${category}-new-title`}
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder="Principle title"
                className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label className="sr-only" htmlFor={`${category}-new-instruction`}>
                New principle instruction
              </label>
              <textarea
                id={`${category}-new-instruction`}
                value={instructionDraft}
                onChange={(event) => setInstructionDraft(event.target.value)}
                placeholder="Tell AI teammates how this principle should shape their behavior."
                rows={3}
                className="min-h-24 w-full resize-y rounded-md border border-border bg-bg-primary px-3 py-2 text-sm leading-5 text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <select
                value={modeDraft}
                onChange={(event) =>
                  setModeDraft(event.target.value as AIStandard["mode"])
                }
                className="w-full rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-secondary outline-none transition-colors focus:border-accent sm:w-fit"
              >
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-start gap-1 lg:justify-end">
              <button
                type="button"
                disabled={!canCreate || pending}
                onClick={submit}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-1 focus:ring-accent disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>
        )}
        {standards.map((standard) => (
          <StandardRow
            key={standard.standard_key}
            standard={standard}
            pending={pending}
            status={status}
            onUpdate={onUpdate}
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
  onUpdate: (
    standardKey: string,
    patch: Partial<AIStandard>,
    options?: { saveNow?: boolean }
  ) => void;
  onReset: (standardKey: string) => void;
  onDeleteCustom: (standardKey: string) => void;
}

function StandardRow({
  standard,
  pending,
  status,
  onUpdate,
  onReset,
  onDeleteCustom,
}: StandardRowProps) {
  const isCustom = standard.source === "custom";
  const isStatusRow = status?.key === standard.standard_key;

  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <label className="sr-only" htmlFor={`${standard.standard_key}-title`}>
          Standard title
        </label>
        <input
          id={`${standard.standard_key}-title`}
          value={standard.title}
          onChange={(event) =>
            onUpdate(standard.standard_key, { title: event.target.value })
          }
          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-strong focus:bg-bg-primary"
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
          onChange={(event) =>
            onUpdate(standard.standard_key, {
              instruction: event.target.value,
            })
          }
          rows={3}
          className="min-h-24 w-full resize-y rounded-md border border-border bg-bg-primary px-3 py-2 text-sm leading-5 text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={`${standard.standard_key}-mode`}>
            Mode
          </label>
          <select
            id={`${standard.standard_key}-mode`}
            value={standard.mode}
            onChange={(event) =>
              onUpdate(standard.standard_key, {
                mode: event.target.value as AIStandard["mode"],
              })
            }
            className="w-full rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-secondary outline-none transition-colors focus:border-accent sm:w-fit"
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
          tooltip={
            standard.enabled
              ? "Turn this standard off for AI replies."
              : "Turn this standard on for AI replies."
          }
          disabled={pending}
          onClick={() =>
            onUpdate(
              standard.standard_key,
              {
                enabled: !standard.enabled,
              },
              { saveNow: true }
            )
          }
        >
          {standard.enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
        </IconButton>
        {!isCustom && (
          <IconButton
            label="Reset default"
            tooltip="Restore the shipped default text, mode, and enabled state."
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
            tooltip="Remove this custom standard."
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
  tooltip,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  tooltip?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tooltipText = tooltip ?? label;

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={tooltipText}
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
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-9 z-20 hidden w-max max-w-52 rounded-md border border-border bg-bg-card px-2 py-1 text-xs text-text-secondary shadow-sm group-hover:block group-focus-within:block"
      >
        {tooltipText}
      </span>
    </div>
  );
}
