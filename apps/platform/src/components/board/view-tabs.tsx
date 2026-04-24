"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Star } from "lucide-react";
import type { ViewFilter, WorkspaceView } from "@/lib/views";
import { createView, updateViewName, starView, deleteView } from "@/lib/actions/views";

interface ViewTabsProps {
  views: WorkspaceView[];
  activeViewId: string;
  workspaceId: string;
  onSwitch: (view: WorkspaceView) => void;
  onViewCreated: (view: WorkspaceView) => void;
  currentColumnFieldId: string | null;
  currentFilters: ViewFilter[];
}

export function ViewTabs({
  views,
  activeViewId,
  workspaceId,
  onSwitch,
  onViewCreated,
  currentColumnFieldId,
  currentFilters,
}: ViewTabsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId) renameRef.current?.select();
  }, [renamingId]);

  const commitRename = (view: WorkspaceView) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === view.name) return;
    startTransition(async () => {
      await updateViewName(view.id, workspaceId, trimmed);
      router.refresh();
    });
  };

  const handleStar = (view: WorkspaceView) => {
    if (view.starred) return;
    startTransition(async () => {
      await starView(view.id, workspaceId);
      router.refresh();
    });
  };

  const handleDelete = (view: WorkspaceView) => {
    startTransition(async () => {
      await deleteView(view.id, workspaceId);
      router.refresh();
    });
  };

  const handleAdd = () => {
    startTransition(async () => {
      const newView = await createView(workspaceId, "New View", currentColumnFieldId, currentFilters);
      router.refresh();
      onViewCreated({ id: newView.id, workspace_id: workspaceId, name: "New View", starred: false, column_field_id: currentColumnFieldId, filters: currentFilters });
      setRenamingId(newView.id);
      setRenameValue("New View");
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-bg-secondary/40 px-4">
      {views.map((view) => {
        const isActive = view.id === activeViewId;
        return (
          <div key={view.id} className="group relative flex items-center">
            {renamingId === view.id ? (
              <input
                ref={renameRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(view);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => commitRename(view)}
                className="w-28 rounded border border-border-strong bg-bg-card px-1.5 py-0.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSwitch(view)}
                onDoubleClick={() => { setRenamingId(view.id); setRenameValue(view.name); }}
                className={[
                  "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-tertiary hover:text-text-secondary",
                ].join(" ")}
              >
                {view.starred && (
                  <Star
                    size={10}
                    className="fill-current text-amber-400"
                  />
                )}
                {view.name}
              </button>
            )}

            {/* Per-tab hover actions */}
            {renamingId !== view.id && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full hidden items-center gap-0.5 rounded border border-border bg-bg-card px-1 py-0.5 shadow-sm group-hover:flex z-10">
                {!view.starred && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleStar(view)}
                    title="Set as default"
                    className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-amber-400 transition-colors"
                  >
                    <Star size={10} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => { setRenamingId(view.id); setRenameValue(view.name); }}
                  title="Rename"
                  className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-text-secondary transition-colors text-[10px] font-medium"
                >
                  Aa
                </button>
                {views.length > 1 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleDelete(view)}
                    title="Delete view"
                    className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-red-500 transition-colors text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        disabled={pending}
        onClick={handleAdd}
        title="New view"
        className="ml-1 flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-secondary transition-colors"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
