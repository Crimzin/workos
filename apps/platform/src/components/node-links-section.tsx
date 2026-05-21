"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, Layers, Plus, X } from "lucide-react";
import type { LinkRecord, LinkType, NodeLinks, LinkableNode } from "@/lib/links";
import { createLink, deleteLink, searchLinkableNodes } from "@/lib/actions/links";

interface NodeLinksSectionProps {
  nodeId: string;
  /** Workspace currently being viewed (for revalidation + chip hrefs). */
  workspaceId: string;
  links: NodeLinks;
}

export function NodeLinksSection({ nodeId, workspaceId, links }: NodeLinksSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  const isEmpty =
    links.related.length === 0 &&
    links.blocks.length === 0 &&
    links.blockedBy.length === 0;

  const handleCreate = (target: LinkableNode, linkType: LinkType) => {
    setAdding(false);
    startTransition(async () => {
      await createLink(nodeId, target.id, linkType, workspaceId);
      router.refresh();
    });
  };

  const handleRemove = (link: LinkRecord) => {
    startTransition(async () => {
      await deleteLink(link.id, link.from_node_id, link.to_node_id, workspaceId);
      router.refresh();
    });
  };

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="section-label mb-2">Linked Context</div>

      {isEmpty && !adding && (
        <p className="mb-2 text-xs text-text-tertiary">No linked context yet.</p>
      )}

      <LinkGroup
        label="Related"
        items={links.related}
        workspaceId={workspaceId}
        isPending={isPending}
        onRemove={handleRemove}
      />
      <LinkGroup
        label="Blocks"
        items={links.blocks}
        workspaceId={workspaceId}
        isPending={isPending}
        onRemove={handleRemove}
      />
      <LinkGroup
        label="Blocked by"
        items={links.blockedBy}
        workspaceId={workspaceId}
        isPending={isPending}
        onRemove={handleRemove}
      />

      <div className="mt-2">
        {!adding ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary disabled:cursor-default disabled:opacity-40"
          >
            <Plus size={10} />
            Add link
          </button>
        ) : (
          <AddLinkPicker
            excludeNodeId={nodeId}
            onCancel={() => setAdding(false)}
            onPick={handleCreate}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkGroup — renders a labeled row of chips when items exist
// ---------------------------------------------------------------------------

function LinkGroup({
  label,
  items,
  workspaceId,
  isPending,
  onRemove,
}: {
  label: string;
  items: LinkRecord[];
  workspaceId: string;
  isPending: boolean;
  onRemove: (link: LinkRecord) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((link) => (
          <LinkChip
            key={link.id}
            link={link}
            workspaceId={workspaceId}
            isPending={isPending}
            onRemove={() => onRemove(link)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkChip — node icon + title + workspace dim suffix + hover-X
// ---------------------------------------------------------------------------

function LinkChip({
  link,
  workspaceId,
  isPending,
  onRemove,
}: {
  link: LinkRecord;
  workspaceId: string;
  isPending: boolean;
  onRemove: () => void;
}) {
  const { other_node } = link;
  const Icon = other_node.type === "stack" ? Layers : CreditCard;

  const href = `/n/${other_node.id}`;
  const isCrossWorkspace =
    other_node.workspace && other_node.workspace.id !== workspaceId;

  return (
    <span className="group inline-flex items-center gap-1 rounded-full border border-border bg-bg-card px-2 py-0.5 text-xs text-text-secondary">
      <Icon size={9} className="shrink-0 text-text-tertiary" />
      <Link
        href={href}
        scroll={false}
        className="max-w-[180px] truncate hover:text-text-primary transition-colors"
      >
        {other_node.title}
      </Link>
      {isCrossWorkspace && other_node.workspace && (
        <span className="shrink-0 text-text-tertiary">· {other_node.workspace.title}</span>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={onRemove}
        aria-label={`Remove link to ${other_node.title}`}
        className="ml-0.5 shrink-0 rounded text-text-tertiary opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 disabled:opacity-40"
      >
        <X size={9} />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// AddLinkPicker — debounced search + type toggle + result list
// ---------------------------------------------------------------------------

function AddLinkPicker({
  excludeNodeId,
  onCancel,
  onPick,
}: {
  excludeNodeId: string;
  onCancel: () => void;
  onPick: (target: LinkableNode, linkType: LinkType) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkableNode[]>([]);
  const [linkType, setLinkType] = useState<LinkType>("related");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      const frameId = requestAnimationFrame(() => {
        setResults([]);
        setLoading(false);
      });
      return () => cancelAnimationFrame(frameId);
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchLinkableNodes(trimmed, excludeNodeId);
        setResults(found);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, excludeNodeId]);

  return (
    <div className="relative">
      <div className="flex flex-col gap-1.5 rounded-md border border-border-strong bg-bg-card p-2 shadow-sm">
        {/* Type toggle */}
        <div className="flex gap-1">
          {(["related", "blocks"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLinkType(t)}
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
                linkType === t
                  ? "bg-accent text-white"
                  : "border border-border text-text-tertiary hover:text-text-secondary",
              ].join(" ")}
            >
              {t === "related" ? "Related" : "Blocks"}
            </button>
          ))}
        </div>

        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Search cards or stacks…"
          className="h-7 rounded border border-border-strong bg-bg-primary px-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
        />

        {/* Results */}
        {query.trim().length > 0 && (
          <div className="max-h-56 overflow-y-auto">
            {loading && (
              <p className="px-1 py-1 text-xs text-text-tertiary">Searching…</p>
            )}
            {!loading && results.length === 0 && (
              <p className="px-1 py-1 text-xs text-text-tertiary">No matches.</p>
            )}
            {!loading &&
              results.map((r) => {
                const Icon = r.type === "stack" ? Layers : CreditCard;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onPick(r, linkType)}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <Icon size={11} className="shrink-0 text-text-tertiary" />
                    <span className="flex-1 truncate">{r.title}</span>
                    {r.workspace_title && (
                      <span className="shrink-0 text-text-tertiary">
                        {r.workspace_title}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
