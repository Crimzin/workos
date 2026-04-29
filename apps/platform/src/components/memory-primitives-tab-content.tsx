"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { Block } from "@blocknote/core";
import type { MemoryPrimitive, MemoryPrimitiveType } from "@/lib/types";
import type { NodeMemoryPrimitives } from "@/lib/memory-primitives";
import {
  createMemoryPrimitive,
  deleteMemoryPrimitive,
  updateMemoryPrimitive,
} from "@/lib/actions/memory-primitives";
import {
  parsePostBody,
  PostEditor,
  serializePostBody,
} from "./post-editor";

interface MemoryPrimitivesTabContentProps {
  nodeId: string;
  workspaceId: string;
  initialPrimitives: NodeMemoryPrimitives;
}

type PrimitiveDraft = {
  statement: string;
  status: string;
  sourceLabel: string;
};

const ASSUMPTION_STATUSES = ["untested", "validated", "invalidated"] as const;
const DECISION_STATUSES = ["active", "superseded", "reversed"] as const;

function isEditorEmpty(blocks: Block[]): boolean {
  if (blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const b = blocks[0];
  return (
    b.type === "paragraph" &&
    (!b.content || (Array.isArray(b.content) && b.content.length === 0))
  );
}

export function MemoryPrimitivesTabContent({
  nodeId,
  workspaceId,
  initialPrimitives,
}: MemoryPrimitivesTabContentProps) {
  return (
    <div className="space-y-6 px-5 py-5">
      <RationaleSection
        nodeId={nodeId}
        workspaceId={workspaceId}
        primitive={initialPrimitives.rationale}
      />

      <PrimitiveList
        title="Assumptions"
        emptyText="No assumptions captured yet."
        type="assumption"
        nodeId={nodeId}
        workspaceId={workspaceId}
        primitives={initialPrimitives.assumptions}
      />

      <PrimitiveList
        title="Decisions"
        emptyText="No decisions captured yet."
        type="decision"
        nodeId={nodeId}
        workspaceId={workspaceId}
        primitives={initialPrimitives.decisions}
      />
    </div>
  );
}

function RationaleSection({
  nodeId,
  workspaceId,
  primitive,
}: {
  nodeId: string;
  workspaceId: string;
  primitive: MemoryPrimitive | null;
}) {
  const [editing, setEditing] = useState(!primitive);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const blocksRef = useRef<Block[]>([]);
  const initialContent = parsePostBody(primitive?.body ?? null);

  const isEditing = primitive ? editing : true;

  const handleSave = (blocks: Block[]) => {
    if (isEditorEmpty(blocks)) return;
    const body = serializePostBody(blocks);
    startTransition(async () => {
      if (primitive) {
        await updateMemoryPrimitive(primitive.id, nodeId, workspaceId, {
          statement: "Why this exists",
          body,
        });
      } else {
        await createMemoryPrimitive({
          nodeId,
          workspaceId,
          type: "rationale",
          statement: "Why this exists",
          body,
          status: "active",
        });
      }
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="section-label">Rationale</div>
        {primitive && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-text-tertiary transition-colors hover:text-accent"
          >
            Edit
          </button>
        )}
      </div>

      <div
        className={[
          "overflow-hidden rounded-md border border-border bg-bg-card",
          pending ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        {isEditing ? (
          <>
            <PostEditor
              initialContent={initialContent}
              editable
              onChange={(blocks) => {
                blocksRef.current = blocks;
              }}
              onSubmit={handleSave}
              onCancel={() => primitive && setEditing(false)}
            />
            <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
              {primitive && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-xs text-text-tertiary transition-colors hover:text-text-secondary"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => handleSave(blocksRef.current)}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </>
        ) : primitive ? (
          <div className="prose-post px-3 py-2">
            <PostEditor initialContent={initialContent} editable={false} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PrimitiveList({
  title,
  emptyText,
  type,
  nodeId,
  workspaceId,
  primitives,
}: {
  title: string;
  emptyText: string;
  type: Exclude<MemoryPrimitiveType, "rationale">;
  nodeId: string;
  workspaceId: string;
  primitives: MemoryPrimitive[];
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="section-label">{title}</div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-accent"
          title={`Add ${type}`}
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="space-y-2">
        {showCreate && (
          <PrimitiveForm
            type={type}
            nodeId={nodeId}
            workspaceId={workspaceId}
            onDone={() => setShowCreate(false)}
          />
        )}

        {primitives.length === 0 && !showCreate && (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-tertiary">
            {emptyText}
          </div>
        )}

        {primitives.map((primitive) => (
          <PrimitiveCard
            key={primitive.id}
            primitive={primitive}
            nodeId={nodeId}
            workspaceId={workspaceId}
          />
        ))}
      </div>
    </section>
  );
}

function PrimitiveForm({
  type,
  nodeId,
  workspaceId,
  onDone,
}: {
  type: Exclude<MemoryPrimitiveType, "rationale">;
  nodeId: string;
  workspaceId: string;
  onDone: () => void;
}) {
  const defaultStatus = type === "assumption" ? "untested" : "active";
  const [draft, setDraft] = useState<PrimitiveDraft>({
    statement: "",
    status: defaultStatus,
    sourceLabel: "",
  });
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const blocksRef = useRef<Block[]>([]);

  const handleSave = () => {
    const statement = draft.statement.trim();
    if (!statement) return;
    const body = isEditorEmpty(blocksRef.current)
      ? null
      : serializePostBody(blocksRef.current);

    startTransition(async () => {
      await createMemoryPrimitive({
        nodeId,
        workspaceId,
        type,
        statement,
        status: draft.status,
        body,
        sourceLabel: draft.sourceLabel,
      });
      onDone();
      router.refresh();
    });
  };

  return (
    <div
      className={[
        "overflow-hidden rounded-md border border-accent/50 bg-bg-card",
        pending ? "pointer-events-none opacity-60" : "",
      ].join(" ")}
    >
      <PrimitiveFields draft={draft} setDraft={setDraft} type={type} />
      <div className="border-t border-border">
        <PostEditor
          editable
          onChange={(blocks) => {
            blocksRef.current = blocks;
          }}
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-text-tertiary transition-colors hover:text-text-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || !draft.statement.trim()}
          onClick={handleSave}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function PrimitiveCard({
  primitive,
  nodeId,
  workspaceId,
}: {
  primitive: MemoryPrimitive;
  nodeId: string;
  workspaceId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [draft, setDraft] = useState<PrimitiveDraft>({
    statement: primitive.statement,
    status: primitive.status,
    sourceLabel: primitive.source_label ?? "",
  });
  const blocksRef = useRef<Block[]>([]);
  const type = primitive.type as Exclude<MemoryPrimitiveType, "rationale">;
  const initialContent = parsePostBody(primitive.body);

  const handleSave = () => {
    const body = isEditorEmpty(blocksRef.current)
      ? primitive.body
      : serializePostBody(blocksRef.current);
    startTransition(async () => {
      await updateMemoryPrimitive(primitive.id, nodeId, workspaceId, {
        statement: draft.statement,
        status: draft.status,
        body,
        sourceLabel: draft.sourceLabel,
      });
      setEditing(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteMemoryPrimitive(primitive.id, nodeId, workspaceId);
      router.refresh();
    });
  };

  return (
    <div
      className={[
        "group rounded-md border border-border bg-bg-card px-3 py-3",
        pending ? "pointer-events-none opacity-60" : "",
      ].join(" ")}
    >
      {editing ? (
        <>
          <PrimitiveFields draft={draft} setDraft={setDraft} type={type} />
          <div className="mt-2 overflow-hidden rounded-md border border-border">
            <PostEditor
              initialContent={initialContent}
              editable
              onChange={(blocks) => {
                blocksRef.current = blocks;
              }}
              onSubmit={handleSave}
              onCancel={() => setEditing(false)}
            />
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-text-tertiary transition-colors hover:text-text-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !draft.statement.trim()}
              onClick={handleSave}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusPill status={primitive.status} type={primitive.type} />
                {primitive.source_label && (
                  <span className="truncate text-[11px] text-text-tertiary">
                    {primitive.source_label}
                  </span>
                )}
              </div>
              <h4 className="mt-1 text-sm font-medium text-text-primary">
                {primitive.statement}
              </h4>
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-text-tertiary transition-colors hover:text-accent"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-red-500"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {primitive.body && (
            <div className="prose-post mt-2 text-sm text-text-secondary">
              <PostEditor initialContent={initialContent} editable={false} />
            </div>
          )}
          {confirmDelete && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-text-secondary">Delete this?</span>
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs font-medium text-red-500 transition-colors hover:text-red-600"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-text-tertiary transition-colors hover:text-text-secondary"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PrimitiveFields({
  draft,
  setDraft,
  type,
}: {
  draft: PrimitiveDraft;
  setDraft: (draft: PrimitiveDraft) => void;
  type: Exclude<MemoryPrimitiveType, "rationale">;
}) {
  const statuses = type === "assumption" ? ASSUMPTION_STATUSES : DECISION_STATUSES;

  return (
    <div className="space-y-2 px-3 py-3">
      <input
        value={draft.statement}
        onChange={(e) => setDraft({ ...draft, statement: e.target.value })}
        placeholder={type === "assumption" ? "Assumption" : "Decision"}
        className="w-full rounded-md border border-border bg-bg-primary px-2 py-1.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent"
      />
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
        <input
          value={draft.sourceLabel}
          onChange={(e) => setDraft({ ...draft, sourceLabel: e.target.value })}
          placeholder="Source"
          className="min-w-0 rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent"
        />
        <select
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value })}
          className="rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-primary outline-none transition-colors focus:border-accent"
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StatusPill({
  status,
  type,
}: {
  status: string;
  type: MemoryPrimitiveType;
}) {
  const tone =
    status === "validated" || status === "active"
      ? "bg-accent-subtle text-accent"
      : status === "invalidated" || status === "reversed"
        ? "bg-red-500/10 text-red-500"
        : "bg-bg-hover text-text-secondary";

  return (
    <span
      className={[
        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tone,
      ].join(" ")}
    >
      {type === "assumption" ? status : status}
    </span>
  );
}
