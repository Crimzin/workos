"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2, Unlink } from "lucide-react";
import { archiveNode, unarchiveNode, deleteNode, unmirrorNode } from "@/lib/actions/nodes";
import type { WorkNode } from "@/lib/types";
import { ConfirmModal } from "./confirm-modal";

interface NodeActionsProps {
  nodeId: string;
  workspaceId: string;
  parentId: string | null;
  nodeType: WorkNode["type"];
  isArchived: boolean;
  /** href to redirect to after delete or remove-mirror */
  closeHref: string;
  /** True when viewed from the node's home workspace. */
  isHomeContext: boolean;
  /** True when this node has any mirror placements. */
  isMirrored: boolean;
  /** When isHomeContext is false: the mirror_parent_id to unlink. */
  mirrorParentId?: string;
  /** Home workspace id — needed for unmirrorNode revalidation. */
  homeWorkspaceId: string;
}

export function NodeActions({
  nodeId,
  workspaceId,
  parentId,
  isArchived,
  closeHref,
  isHomeContext,
  isMirrored,
  mirrorParentId,
  homeWorkspaceId,
}: NodeActionsProps) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleArchive = () => {
    startTransition(async () => {
      await archiveNode(nodeId, homeWorkspaceId, parentId);
      router.push(closeHref);
      router.refresh();
    });
  };

  const handleUnarchive = () => {
    startTransition(async () => {
      await unarchiveNode(nodeId, homeWorkspaceId, parentId);
      router.refresh();
    });
  };

  const handleDelete = () => {
    setConfirmDelete(false);
    startTransition(async () => {
      await deleteNode(nodeId, homeWorkspaceId, parentId);
      router.push(closeHref);
      router.refresh();
    });
  };

  const handleRemoveMirror = () => {
    setConfirmRemove(false);
    if (!mirrorParentId) return;
    startTransition(async () => {
      await unmirrorNode(nodeId, mirrorParentId, workspaceId);
      router.push(closeHref);
      router.refresh();
    });
  };

  // Delete confirm body changes based on context.
  const deleteBody = !isHomeContext
    ? "This deletes the thread from every place it appears. This cannot be undone."
    : isMirrored
    ? "This thread appears in more than one place. Deleting it removes it everywhere. This cannot be undone."
    : "Are you sure? Deleted threads cannot be recovered.";

  const deleteLabel =
    !isHomeContext || isMirrored ? "Delete from everywhere" : "Delete";

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

        {/* Remove from this workspace (mirror context only) */}
        {!isHomeContext && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmRemove(true)}
            title="Remove from this workspace"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary disabled:opacity-40"
          >
            <Unlink size={14} />
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
          title="Delete thread?"
          body={deleteBody}
          confirmLabel={deleteLabel}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {confirmRemove && (
        <ConfirmModal
          title="Remove from here?"
          body="This removes the thread from this place. It stays everywhere else it appears."
          confirmLabel="Remove"
          onConfirm={handleRemoveMirror}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </>
  );
}
