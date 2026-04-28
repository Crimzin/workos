"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Home, X, Plus } from "lucide-react";
import type { NodeMirrorPlacement } from "@/lib/board-types";
import { mirrorNode, unmirrorNode } from "@/lib/actions/nodes";

interface MirrorsSectionProps {
  nodeId: string;
  nodeType: "stack" | "card";
  /** The workspace currently being viewed (for passing to server actions). */
  workspaceId: string;
  /** The node's home workspace id (source of truth for mirrorNode call). */
  homeWorkspaceId: string;
  /** All placements: home first, then mirrors ordered by created_at. */
  placements: NodeMirrorPlacement[];
  /** All valid add-targets (workspaces for stacks, stacks for cards). */
  availableTargets: { id: string; title: string; type: string }[];
}

export function MirrorsSection({
  nodeId,
  nodeType,
  workspaceId,
  homeWorkspaceId,
  placements,
  availableTargets,
}: MirrorsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const presentParentIds = new Set(placements.map((p) => p.parent.id));

  const filtered = availableTargets.filter(
    (t) =>
      !presentParentIds.has(t.id) &&
      t.title.toLowerCase().includes(query.toLowerCase())
  );

  const handleAdd = (target: { id: string; title: string; type: string }) => {
    setAdding(false);
    setQuery("");
    startTransition(async () => {
      // For stacks, target is a workspace. For cards, target is a stack.
      // targetWorkspaceId: for stacks = target.id; for cards we pass workspaceId
      // as a fallback (the actual board to revalidate is the workspace the target
      // stack lives in — we don't have that here, so revalidate current workspace).
      const targetWorkspaceId = nodeType === "stack" ? target.id : workspaceId;
      await mirrorNode(nodeId, target.id, homeWorkspaceId, targetWorkspaceId);
      router.refresh();
    });
  };

  const handleRemove = (placement: NodeMirrorPlacement) => {
    startTransition(async () => {
      const affectedWorkspaceId =
        nodeType === "stack" ? placement.parent.id : workspaceId;
      await unmirrorNode(nodeId, placement.parent.id, affectedWorkspaceId);
      router.refresh();
    });
  };

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="section-label mb-2">Appears in</div>

      {/* Placement chips */}
      <div className="flex flex-wrap gap-1.5">
        {placements.map((p) => (
          <PlacementChip
            key={p.parent.id}
            placement={p}
            isPending={isPending}
            onRemove={() => handleRemove(p)}
          />
        ))}

        {/* Add button / inline search */}
        {!adding ? (
          <button
            type="button"
            disabled={isPending || availableTargets.length === presentParentIds.size}
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary disabled:cursor-default disabled:opacity-40"
          >
            <Plus size={10} />
            {nodeType === "stack" ? "Add workspace" : "Add stack"}
          </button>
        ) : (
          <div className="relative">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAdding(false);
                  setQuery("");
                }
              }}
              placeholder={nodeType === "stack" ? "Search workspaces…" : "Search stacks…"}
              className="h-6 rounded-full border border-border-strong bg-bg-card px-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {/* Dropdown */}
            {filtered.length > 0 && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => { setAdding(false); setQuery(""); }}
                />
                <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-bg-card py-1 shadow-sm">
                  {filtered.slice(0, 8).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleAdd(t)}
                      className="block w-full truncate px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </>
            )}
            {filtered.length === 0 && query.length > 0 && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => { setAdding(false); setQuery(""); }}
                />
                <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-bg-card py-2 shadow-sm">
                  <p className="px-3 text-xs text-text-tertiary">No results</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlacementChip({
  placement,
  isPending,
  onRemove,
}: {
  placement: NodeMirrorPlacement;
  isPending: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="group inline-flex items-center gap-1 rounded-full border border-border bg-bg-card px-2 py-0.5 text-xs text-text-secondary">
      {placement.is_home && (
        <Home size={9} className="shrink-0 text-text-tertiary" aria-label="Home" />
      )}
      <span className="max-w-[120px] truncate">{placement.parent.title}</span>
      {!placement.is_home && (
        <button
          type="button"
          disabled={isPending}
          onClick={onRemove}
          aria-label={`Remove from ${placement.parent.title}`}
          className="ml-0.5 shrink-0 rounded text-text-tertiary opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 disabled:opacity-40"
        >
          <X size={9} />
        </button>
      )}
    </span>
  );
}
