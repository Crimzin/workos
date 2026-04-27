"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { archiveNode, unarchiveNode, deleteNode } from "@/lib/actions/nodes";
import { ConfirmModal } from "./confirm-modal";

interface NodeActionsProps {
  nodeId: string;
  workspaceId: string;
  parentId: string | null;
  nodeType: "card" | "stack";
  isArchived: boolean;
  /** href to redirect to after delete (usually the board URL) */
  closeHref: string;
}

export function NodeActions({
  nodeId,
  workspaceId,
  parentId,
  nodeType,
  isArchived,
  closeHref,
}: NodeActionsProps) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleArchive = () => {
    startTransition(async () => {
      await archiveNode(nodeId, workspaceId, parentId);
      router.push(closeHref);
      router.refresh();
    });
  };

  const handleUnarchive = () => {
    startTransition(async () => {
      await unarchiveNode(nodeId, workspaceId, parentId);
      router.refresh();
    });
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    startTransition(async () => {
      await deleteNode(nodeId, workspaceId, parentId);
      router.push(closeHref);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {isArchived ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleUnarchive}
            title="Unarchive"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary disabled:opacity-40"
          >
            <ArchiveRestore size={14} />
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={handleArchive}
            title="Archive"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary disabled:opacity-40"
          >
            <Archive size={14} />
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
          title="Delete"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-red-500 disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${nodeType}?`}
          body={
            nodeType === "stack"
              ? "Are you sure? Deleted stacks and all their cards can't be recovered."
              : "Are you sure? Deleted cards can't be recovered."
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
